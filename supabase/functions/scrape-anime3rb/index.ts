// Supabase Edge Function: scrape-anime3rb
// On-demand scraper that fetches anime3rb.com episode pages directly,
// bypasses Cloudflare using Apify's Cloudflare Bypasser actor, extracts the video URL,
// and caches the result in the database for future use.
// Strategy: Try direct episode URL first (slug from title), fall back to search if needed.
//
// Deploy to: Supabase Dashboard → Edge Functions → scrape-anime3rb

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Call Apify Cloudflare Bypasser actor to fetch a Cloudflare-protected page
async function fetchWithApify(url: string, apifyToken: string): Promise<{ html: string; error?: string }> {
  const actorId = 'neatrat~cloudflare-scraper'
  const endpoint = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`

  console.log(`[Apify] Fetching: ${url}`)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[Apify] HTTP ${response.status}: ${errorText.slice(0, 300)}`)
    return { html: '', error: `Apify request failed: ${response.status}` }
  }

  const items = await response.json()

  if (!Array.isArray(items) || items.length === 0) {
    return { html: '', error: 'Apify returned no data' }
  }

  // The Cloudflare Scraper actor typically returns items with body/html field
  const item = items[0]
  const html = item.body || item.html || item.content || item.pageContent || item.text || ''

  if (!html) {
    // If no known field, dump all keys for debugging
    console.log('[Apify] Item keys:', Object.keys(item))
    console.log('[Apify] Item sample:', JSON.stringify(item).slice(0, 500))
    return { html: JSON.stringify(item), error: undefined }
  }

  console.log(`[Apify] Got HTML, length: ${html.length}`)
  return { html }
}

// Extract the anime slug from anime3rb search results HTML
function extractAnimeSlugFromSearch(html: string, animeTitle: string): string | null {
  // Look for links like /titles/anime-slug in the search results
  const titleLinkPattern = /href=["']\/titles\/([a-z0-9-]+)["']/gi
  const matches: string[] = []
  let match

  while ((match = titleLinkPattern.exec(html)) !== null) {
    matches.push(match[1])
  }

  if (matches.length === 0) {
    // Try alternate pattern: full URL
    const fullUrlPattern = /href=["']https?:\/\/(?:www\.)?anime3rb\.com\/titles\/([a-z0-9-]+)["']/gi
    while ((match = fullUrlPattern.exec(html)) !== null) {
      matches.push(match[1])
    }
  }

  if (matches.length === 0) return null

  // Deduplicate
  const uniqueSlugs = [...new Set(matches)]
  console.log(`[Search] Found ${uniqueSlugs.length} anime slugs:`, uniqueSlugs.slice(0, 5))

  // Return the first result (most relevant match from anime3rb search)
  return uniqueSlugs[0]
}

// Extract video URLs from anime3rb episode page HTML
function extractVideoUrls(html: string): { url: string; type: 'direct' | 'embed'; server_name: string; quality: string }[] {
  const sources: { url: string; type: 'direct' | 'embed'; server_name: string; quality: string }[] = []

  // Pattern 1: Direct MP4 files from files.vid3rb.com
  const mp4Pattern = /https:\/\/files\.vid3rb\.com\/[^\s"'<>]+\.mp4[^\s"'<>]*/g
  const mp4Matches = html.match(mp4Pattern) || []
  for (const url of mp4Matches) {
    sources.push({ url, type: 'direct', server_name: 'anime3rb', quality: '720p' })
  }

  // Pattern 2: vid3rb.com player/embed URLs
  const vid3rbPattern = /https:\/\/[^/]*vid3rb\.com\/(?:embed|player|v)\/[^\s"'<>]+/g
  const vid3rbMatches = html.match(vid3rbPattern) || []
  for (const url of vid3rbMatches) {
    if (!sources.some(s => s.url === url)) {
      sources.push({ url, type: 'embed', server_name: 'anime3rb', quality: '720p' })
    }
  }

  // Pattern 3: Any vid3rb.com URL not already captured
  const anyVid3rbPattern = /https:\/\/[^/]*vid3rb\.com\/[^\s"'<>]+/g
  const anyVid3rbMatches = html.match(anyVid3rbPattern) || []
  for (const url of anyVid3rbMatches) {
    if (!sources.some(s => s.url === url)) {
      // Filter out thumbnails and images
      if (url.match(/\.(jpg|jpeg|png|webp|gif|svg|vtt|srt)$/i)) continue
      if (url.match(/thumbnail/i)) continue
      sources.push({ url, type: 'embed', server_name: 'anime3rb', quality: '720p' })
    }
  }

  // Pattern 4: iframe sources (may contain external players)
  const iframePattern = /<iframe[^>]+src=["']([^"']+)["']/gi
  let iframeMatch
  while ((iframeMatch = iframePattern.exec(html)) !== null) {
    const url = iframeMatch[1]
    if (!sources.some(s => s.url === url) && !url.includes('google') && !url.includes('facebook')) {
      sources.push({ url, type: 'embed', server_name: 'iframe-player', quality: '720p' })
    }
  }

  // Pattern 5: video source tags
  const videoSrcPattern = /<source[^>]+src=["']([^"']+)["'][^>]*type=["']video\/[^"']+["']/gi
  let videoMatch
  while ((videoMatch = videoSrcPattern.exec(html)) !== null) {
    const url = videoMatch[1]
    if (!sources.some(s => s.url === url)) {
      sources.push({ url, type: 'direct', server_name: 'anime3rb', quality: '720p' })
    }
  }

  // Pattern 6: Look for video URL in JavaScript variables/objects
  const jsVideoPattern = /["'](?:src|file|url|source|video_url)["']\s*:\s*["'](https?:\/\/[^"']+(?:\.mp4|\.m3u8|\.webm|vid3rb)[^"']*)["']/gi
  let jsMatch
  while ((jsMatch = jsVideoPattern.exec(html)) !== null) {
    const url = jsMatch[1]
    if (!sources.some(s => s.url === url)) {
      const isDirectVideo = url.match(/\.(mp4|m3u8|webm)/)
      sources.push({
        url,
        type: isDirectVideo ? 'direct' : 'embed',
        server_name: 'anime3rb',
        quality: '720p',
      })
    }
  }

  return sources
}

// Normalize anime title to a search-friendly format
function normalizeForSearch(title: string): string {
  // Remove common suffixes and special chars for better search
  return title
    .replace(/\s*\(TV\)\s*/gi, '')
    .replace(/\s*Season\s*\d+/gi, '')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Convert a title to a URL slug (lowercase, hyphenated)
function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s*\(TV\)\s*/gi, '')
    .replace(/\s*Season\s*\d+/gi, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Try fetching episode page directly with a constructed slug, return video sources if found
async function tryDirectEpisodeUrl(
  slug: string,
  episodeNumber: number,
  apifyToken: string
): Promise<{ url: string; sources: ReturnType<typeof extractVideoUrls> } | null> {
  const episodeUrl = `https://anime3rb.com/episode/${slug}/${episodeNumber}`
  console.log(`[Direct] Trying: ${episodeUrl}`)

  const result = await fetchWithApify(episodeUrl, apifyToken)
  if (result.error && !result.html) return null

  const sources = extractVideoUrls(result.html)
  if (sources.length === 0) return null

  return { url: episodeUrl, sources }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { animeTitle, animeTitleEnglish, episodeNumber, malId } = await req.json()

    if (!animeTitle || !episodeNumber) {
      return jsonResponse({ error: 'animeTitle and episodeNumber are required' }, 400)
    }

    const apifyToken = Deno.env.get('APIFY_TOKEN')
    if (!apifyToken) {
      return jsonResponse({ error: 'APIFY_TOKEN not configured' }, 500)
    }

    // Initialize Supabase client for caching
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : null

    // Step 0: Check if we already have this episode cached
    if (supabase && malId) {
      const { data: cached } = await supabase
        .from('anime_episodes')
        .select('*')
        .eq('mal_id', malId)
        .eq('episode_number', episodeNumber)
        .eq('is_active', true)
        .single()

      if (cached?.video_sources && cached.video_sources.length > 0) {
        console.log(`[Cache] Found cached episode: mal_id=${malId}, ep=${episodeNumber}`)
        return jsonResponse({
          video_sources: cached.video_sources,
          cached: true,
          debug: { method: 'cache' },
        })
      }
    }

    console.log(`[Scraper] Starting for "${animeTitle}" Episode ${episodeNumber}`)

    // Step 1: Try direct episode URL construction (skip search entirely)
    // Generate slug candidates from the title(s) and try fetching the episode page directly
    const slugCandidates: string[] = []
    const mainSlug = slugify(animeTitle)
    if (mainSlug) slugCandidates.push(mainSlug)
    if (animeTitleEnglish && animeTitleEnglish !== animeTitle) {
      const englishSlug = slugify(animeTitleEnglish)
      if (englishSlug && englishSlug !== mainSlug) slugCandidates.push(englishSlug)
    }

    console.log(`[Step 1] Trying direct slugs:`, slugCandidates)

    let directResult: { url: string; sources: ReturnType<typeof extractVideoUrls> } | null = null
    let animeSlug = ''
    let episodeUrl = ''

    for (const slug of slugCandidates) {
      directResult = await tryDirectEpisodeUrl(slug, episodeNumber, apifyToken)
      if (directResult) {
        animeSlug = slug
        episodeUrl = directResult.url
        console.log(`[Step 1] Direct hit with slug: ${slug}`)
        break
      }
    }

    let videoSources: ReturnType<typeof extractVideoUrls> = []

    if (directResult) {
      // Direct URL worked — use the video sources from it
      videoSources = directResult.sources
      console.log(`[Step 1] Found ${videoSources.length} video source(s) via direct URL`)
    } else {
      // Step 2: Fallback to search if direct URL didn't work
      console.log(`[Step 2] Direct slugs failed, falling back to search`)
      const searchQuery = normalizeForSearch(animeTitle)
      const searchUrl = `https://anime3rb.com/search?q=${encodeURIComponent(searchQuery)}`

      console.log(`[Step 2] Searching anime3rb: ${searchUrl}`)
      const searchResult = await fetchWithApify(searchUrl, apifyToken)

      if (searchResult.error && !searchResult.html) {
        return jsonResponse({
          error: 'Failed to search anime3rb',
          debug: { step: 'search', searchUrl, error: searchResult.error },
        })
      }

      // Extract anime slug from search results
      animeSlug = extractAnimeSlugFromSearch(searchResult.html, animeTitle) || ''

      // If search with main title fails, try English title
      if (!animeSlug && animeTitleEnglish && animeTitleEnglish !== animeTitle) {
        console.log(`[Step 2b] Retrying search with English title: "${animeTitleEnglish}"`)
        const searchUrl2 = `https://anime3rb.com/search?q=${encodeURIComponent(normalizeForSearch(animeTitleEnglish))}`
        const searchResult2 = await fetchWithApify(searchUrl2, apifyToken)
        if (searchResult2.html) {
          animeSlug = extractAnimeSlugFromSearch(searchResult2.html, animeTitleEnglish) || ''
        }
      }

      if (!animeSlug) {
        return jsonResponse({
          error: 'Anime not found on anime3rb',
          debug: {
            step: 'search',
            searchUrl,
            searchQuery,
            slugsAttempted: slugCandidates,
            htmlLength: searchResult.html.length,
            htmlSample: searchResult.html.slice(0, 500),
          },
        })
      }

      console.log(`[Step 2] Found anime slug via search: ${animeSlug}`)

      // Step 3: Fetch the episode page using the slug from search
      episodeUrl = `https://anime3rb.com/episode/${animeSlug}/${episodeNumber}`
      console.log(`[Step 3] Fetching episode page: ${episodeUrl}`)

      const episodeResult = await fetchWithApify(episodeUrl, apifyToken)

      if (episodeResult.error && !episodeResult.html) {
        return jsonResponse({
          error: 'Failed to fetch episode page',
          debug: { step: 'episode', episodeUrl, error: episodeResult.error },
        })
      }

      videoSources = extractVideoUrls(episodeResult.html)

      if (videoSources.length === 0) {
        return jsonResponse({
          error: 'No video sources found on episode page',
          debug: {
            step: 'extract',
            episodeUrl,
            htmlLength: episodeResult.html.length,
            htmlSample: episodeResult.html.slice(0, 1000),
          },
        })
      }

      console.log(`[Step 3] Found ${videoSources.length} video source(s) via search`)
    }

    // Step 4: Cache the result in the database
    if (supabase && malId) {
      const { error: upsertError } = await supabase
        .from('anime_episodes')
        .upsert(
          {
            mal_id: malId,
            episode_number: episodeNumber,
            video_url: videoSources[0].url,
            video_sources: videoSources,
            quality: videoSources[0].quality,
            subtitle_language: 'ar',
            is_active: true,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'mal_id,episode_number' }
        )

      if (upsertError) {
        console.error('[Cache] Failed to cache episode:', upsertError.message)
      } else {
        console.log(`[Cache] Cached episode: mal_id=${malId}, ep=${episodeNumber}`)
      }
    }

    return jsonResponse({
      video_sources: videoSources,
      cached: false,
      debug: {
        method: 'apify',
        animeSlug,
        episodeUrl,
        sourceCount: videoSources.length,
      },
    })
  } catch (error: any) {
    console.error('[Error]', error)
    return jsonResponse({ error: error.message || 'Unknown error' }, 500)
  }
})
