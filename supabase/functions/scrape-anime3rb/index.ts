// Supabase Edge Function: scrape-anime3rb
// On-demand scraper that searches anime3rb.com for a specific anime episode,
// bypasses Cloudflare using Apify's Cloudflare Bypasser actor, extracts the video URL,
// and caches the result in the database for future use.
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

// Call Apify Universal Bypasser actor (same as ani3rbscrap repo)
async function fetchWithApify(url: string, apifyToken: string): Promise<{ html: string; error?: string }> {
  // Using macheta/universal-bypasser - proven to work in ani3rbscrap
  // Note: API uses ~ instead of / in actor ID
  const actorId = 'macheta~universal-bypasser'
  const endpoint = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`

  console.log(`[Apify] Using universal-bypasser for: ${url}`)

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      // Longer timeout for Cloudflare bypass
      signal: AbortSignal.timeout(90000), // 90 seconds
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Apify] HTTP ${response.status}: ${errorText.slice(0, 300)}`)
      return { html: '', error: `Apify request failed: ${response.status}` }
    }

    const items = await response.json()

    if (!Array.isArray(items) || items.length === 0) {
      console.log('[Apify] No items returned')
      return { html: '', error: 'Apify returned no data' }
    }

    console.log(`[Apify] Got ${items.length} item(s) from dataset`)

    // Extract HTML from various possible field names (same as ani3rbscrap)
    const item = items[0]
    let html = ''

    for (const key of ['body', 'html', 'content', 'pageContent', 'text', 'result']) {
      const val = item[key]
      if (val && typeof val === 'string' && val.length > 100) {
        html = val
        break
      }
    }

    // Check nested data.body/html
    if (!html && item.data && typeof item.data === 'object') {
      for (const key of ['body', 'html', 'content']) {
        const val = item.data[key]
        if (val && typeof val === 'string' && val.length > 100) {
          html = val
          break
        }
      }
    }

    if (!html) {
      console.log('[Apify] No HTML in response. Item keys:', Object.keys(item))
      // Fallback: return stringified item for debugging
      return { html: JSON.stringify(item), error: 'No HTML content in Apify response' }
    }

    console.log(`[Apify] Got HTML, length: ${html.length}`)
    return { html }
  } catch (error: any) {
    console.error('[Apify] Error:', error.message)
    return { html: '', error: error.message }
  }
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
function extractVideoUrls(html: string): { url: string; type: 'direct' | 'embed' | 'proxy'; server_name: string; quality: string }[] {
  const sources: { url: string; type: 'direct' | 'embed' | 'proxy'; server_name: string; quality: string }[] = []

  // Pattern 1: Direct MP4 files from files.vid3rb.com
  const mp4Pattern = /https:\/\/files\.vid3rb\.com\/[^\s"'<>]+\.mp4[^\s"'<>]*/g
  const mp4Matches = html.match(mp4Pattern) || []
  for (const url of mp4Matches) {
    sources.push({ url, type: 'direct', server_name: 'anime3rb', quality: '720p' })
  }

  // Pattern 2: vid3rb.com player/embed URLs (these need proxy resolution due to Cloudflare)
  const vid3rbPattern = /https:\/\/[^/]*vid3rb\.com\/(?:embed|player|v)\/[^\s"'<>]+/g
  const vid3rbMatches = html.match(vid3rbPattern) || []
  for (const url of vid3rbMatches) {
    if (!sources.some(s => s.url === url)) {
      sources.push({ url, type: 'proxy', server_name: 'anime3rb', quality: '720p' })
    }
  }

  // Pattern 3: Any vid3rb.com URL not already captured (also needs proxy)
  const anyVid3rbPattern = /https:\/\/[^/]*vid3rb\.com\/[^\s"'<>]+/g
  const anyVid3rbMatches = html.match(anyVid3rbPattern) || []
  for (const url of anyVid3rbMatches) {
    if (!sources.some(s => s.url === url)) {
      // Filter out thumbnails and images
      if (url.match(/\.(jpg|jpeg|png|webp|gif|svg|vtt|srt)$/i)) continue
      if (url.match(/thumbnail/i)) continue
      // If it's not a direct MP4, it needs proxy resolution
      const isDirect = url.match(/\.mp4/i)
      sources.push({ url, type: isDirect ? 'direct' : 'proxy', server_name: 'anime3rb', quality: '720p' })
    }
  }

  // Pattern 4: iframe sources (may contain external players)
  const iframePattern = /<iframe[^>]+src=["']([^"']+)["']/gi
  let iframeMatch
  while ((iframeMatch = iframePattern.exec(html)) !== null) {
    const url = iframeMatch[1]
    if (!sources.some(s => s.url === url) && !url.includes('google') && !url.includes('facebook')) {
      // Determine if iframe needs proxy resolution
      const needsProxy = url.includes('anime3rb.com') || url.includes('vid3rb.com')
      sources.push({ url, type: needsProxy ? 'proxy' : 'embed', server_name: 'iframe-player', quality: '720p' })
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
      const needsProxy = !isDirectVideo && (url.includes('anime3rb.com') || url.includes('vid3rb.com'))
      sources.push({
        url,
        type: isDirectVideo ? 'direct' : (needsProxy ? 'proxy' : 'embed'),
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

    // Step 1: Search anime3rb for the anime
    const searchQuery = normalizeForSearch(animeTitle)
    const searchUrl = `https://anime3rb.com/search?q=${encodeURIComponent(searchQuery)}`

    console.log(`[Step 1] Searching anime3rb: ${searchUrl}`)
    const searchResult = await fetchWithApify(searchUrl, apifyToken)

    if (searchResult.error && !searchResult.html) {
      return jsonResponse({
        error: 'Failed to search anime3rb',
        debug: { step: 'search', searchUrl, error: searchResult.error },
      })
    }

    // Extract anime slug from search results
    let animeSlug = extractAnimeSlugFromSearch(searchResult.html, animeTitle)

    // If search with Japanese/romaji title fails, try English title
    if (!animeSlug && animeTitleEnglish && animeTitleEnglish !== animeTitle) {
      console.log(`[Step 1b] Retrying search with English title: "${animeTitleEnglish}"`)
      const searchUrl2 = `https://anime3rb.com/search?q=${encodeURIComponent(normalizeForSearch(animeTitleEnglish))}`
      const searchResult2 = await fetchWithApify(searchUrl2, apifyToken)
      if (searchResult2.html) {
        animeSlug = extractAnimeSlugFromSearch(searchResult2.html, animeTitleEnglish)
      }
    }

    if (!animeSlug) {
      return jsonResponse({
        error: 'Anime not found on anime3rb',
        debug: {
          step: 'search',
          searchUrl,
          searchQuery,
          htmlLength: searchResult.html.length,
          htmlSample: searchResult.html.slice(0, 500),
        },
      })
    }

    console.log(`[Step 1] Found anime slug: ${animeSlug}`)

    // Step 2: Fetch the episode page
    const episodeUrl = `https://anime3rb.com/episode/${animeSlug}/${episodeNumber}`
    console.log(`[Step 2] Fetching episode page: ${episodeUrl}`)

    const episodeResult = await fetchWithApify(episodeUrl, apifyToken)

    if (episodeResult.error && !episodeResult.html) {
      return jsonResponse({
        error: 'Failed to fetch episode page',
        debug: { step: 'episode', episodeUrl, error: episodeResult.error },
      })
    }

    // Step 3: Extract video URLs from the episode page
    const videoSources = extractVideoUrls(episodeResult.html)

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

    console.log(`[Step 3] Found ${videoSources.length} video source(s)`)

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
