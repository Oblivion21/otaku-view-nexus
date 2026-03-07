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

function extractHtmlFromApifyItems(items: any[]): string {
  for (const item of items) {
    for (const key of ['body', 'html', 'content', 'text', 'page_content', 'pageContent', 'result']) {
      const val = item?.[key]
      if (val && typeof val === 'string' && val.length > 100) {
        return val
      }
    }

    if (item?.data && typeof item.data === 'object') {
      for (const key of ['body', 'html', 'content']) {
        const val = item.data[key]
        if (val && typeof val === 'string' && val.length > 100) {
          return val
        }
      }
    }

    const itemString = String(item ?? '')
    if (itemString.toLowerCase().includes('<html') && itemString.length > 500) {
      let best = ''
      for (const v of Object.values(item ?? {})) {
        if (typeof v === 'string' && v.length > best.length) {
          best = v
        }
      }
      if (best.length > 100) return best
    }
  }

  return ''
}

// Call Apify Universal Bypasser actor (same as ani3rbscrap repo)
async function fetchWithApify(url: string, apifyToken: string): Promise<{ html: string; error?: string }> {
  // Using macheta/universal-bypasser - proven to work in ani3rbscrap
  // Note: API uses ~ instead of / in actor ID
  const actorId = 'macheta~universal-bypasser'
  const endpoint = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${apifyToken}`

  console.log(`[Apify] Using universal-bypasser for: ${url}`)

  let lastError = 'Unknown Apify error'

  for (let attempt = 1; attempt <= 2; attempt++) {
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
        lastError = `Apify request failed: ${response.status}`
        console.error(`[Apify] HTTP ${response.status}: ${errorText.slice(0, 300)}`)
        continue
      }

      const items = await response.json()

      if (!Array.isArray(items) || items.length === 0) {
        lastError = 'Apify returned no data'
        console.log('[Apify] No items returned')
        continue
      }

      console.log(`[Apify] Got ${items.length} item(s) from dataset`)

      const html = extractHtmlFromApifyItems(items)

      if (!html) {
        lastError = 'No HTML content in Apify response'
        console.log('[Apify] No HTML in response')
        continue
      }

      console.log(`[Apify] Got HTML, length: ${html.length}`)
      return { html }
    } catch (error: any) {
      lastError = error.message
      console.error(`[Apify] Error (attempt ${attempt}/2):`, error.message)
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }

  return { html: '', error: lastError }
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreSlug(slug: string, query: string): number {
  const slugNorm = normalizeText(slug.replace(/-/g, ' '))
  const queryNorm = normalizeText(query)
  if (!slugNorm || !queryNorm) return 0

  let score = 0
  if (slugNorm.includes(queryNorm)) score += 5
  const slugTokens = new Set(slugNorm.split(' '))
  const queryTokens = new Set(queryNorm.split(' '))
  for (const token of queryTokens) {
    if (slugTokens.has(token)) score += 1
  }
  return score
}

function buildSearchQueries(animeTitle: string, animeTitleEnglish?: string | null): string[] {
  const queries: string[] = [animeTitle.trim()]

  if (animeTitle.includes(':')) {
    queries.push(animeTitle.split(':', 1)[0].trim())
  }
  if (animeTitle.includes(' - ')) {
    queries.push(animeTitle.split(' - ', 1)[0].trim())
  }
  if (animeTitleEnglish && animeTitleEnglish !== animeTitle) {
    queries.push(animeTitleEnglish.trim())
  }

  const cleaned = animeTitle.replace(/[^\w\s]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (cleaned) queries.push(cleaned)

  return [...new Set(queries.filter(Boolean))]
}

// Extract the best anime slug from anime3rb search results HTML.
function extractAnimeSlugFromSearch(html: string, animeTitle: string): string | null {
  const pattern = /href=["'](?:https?:\/\/(?:www\.)?anime3rb\.com)?\/(?:anime|titles)\/([a-z0-9-]+)["']/gi
  const matches: string[] = []
  let match

  while ((match = pattern.exec(html)) !== null) {
    matches.push(match[1])
  }

  if (matches.length === 0) return null

  const uniqueSlugs = [...new Set(matches)]
  uniqueSlugs.sort((a, b) => scoreSlug(b, animeTitle) - scoreSlug(a, animeTitle))
  console.log(`[Search] Found ${uniqueSlugs.length} anime slugs:`, uniqueSlugs.slice(0, 5))
  return uniqueSlugs[0]
}

function extractEpisodeLinksFromTitlePage(html: string, animeSlug: string): string[] {
  const links: string[] = []
  const seen = new Set<string>()
  const pattern = /href=["'](?:https?:\/\/(?:www\.)?anime3rb\.com)?\/episode\/([^"'?#]+)["']/gi
  let match

  while ((match = pattern.exec(html)) !== null) {
    const raw = (match[1] || '').replace(/^\/+|\/+$/g, '')
    if (!raw) continue

    let url = ''
    let slug = ''

    const slashFormat = raw.match(/^([^/]+)\/(\d+)$/)
    if (slashFormat) {
      slug = slashFormat[1]
      url = `https://anime3rb.com/episode/${slug}/${slashFormat[2]}`
    } else {
      const dashFormat = raw.match(/^(.+)-episode-(\d+)$/)
      if (dashFormat) {
        slug = dashFormat[1]
        url = `https://anime3rb.com/episode/${slug}-episode-${dashFormat[2]}`
      }
    }

    if (!url || !slug) continue
    if (slug !== animeSlug && !slug.includes(animeSlug) && !animeSlug.includes(slug)) continue
    if (!seen.has(url)) {
      seen.add(url)
      links.push(url)
    }
  }

  return links
}

function buildEpisodeUrlCandidates(animeSlug: string, episodeNumber: number, titleHtml: string): string[] {
  const candidates: string[] = []

  const titleLinks = extractEpisodeLinksFromTitlePage(titleHtml, animeSlug)
  if (titleLinks.length > 0 && episodeNumber >= 1 && episodeNumber <= titleLinks.length) {
    // Forward mapping only (ep1 -> /1)
    candidates.push(titleLinks[episodeNumber - 1])
  }

  // Exact numeric fallback if link exists
  const exactSuffix = `/${episodeNumber}`
  for (const link of titleLinks) {
    if (link.endsWith(exactSuffix)) {
      candidates.push(link)
      break
    }
  }

  // Pattern fallbacks
  candidates.push(
    `https://anime3rb.com/episode/${animeSlug}/${episodeNumber}`,
    `https://anime3rb.com/episode/${animeSlug}-episode-${episodeNumber}`,
    `https://anime3rb.com/episodes/${animeSlug}/${episodeNumber}`,
  )

  return [...new Set(candidates)]
}

// Extract video URLs from anime3rb episode page HTML
function extractVideoUrls(html: string): { url: string; type: 'direct' | 'embed' | 'proxy'; server_name: string; quality: string }[] {
  const sources: { url: string; type: 'direct' | 'embed' | 'proxy'; server_name: string; quality: string }[] = []
  const normalizeUrl = (raw: string) => raw.replace(/\\\//g, '/').replace(/&amp;/g, '&').trim()

  // Pattern 1: Direct MP4 files from files.vid3rb.com
  const mp4Pattern = /https:\/\/files\.vid3rb\.com\/[^\s"'<>]+\.mp4[^\s"'<>]*/g
  const mp4Matches = html.match(mp4Pattern) || []
  for (const url of mp4Matches) {
    const normalized = normalizeUrl(url)
    sources.push({ url: normalized, type: 'direct', server_name: 'anime3rb', quality: '720p' })
  }

  // Pattern 2: vid3rb.com player/embed URLs (these need proxy resolution due to Cloudflare)
  const vid3rbPattern = /https:\/\/[^/]*vid3rb\.com\/(?:embed|player|v)\/[^\s"'<>]+/g
  const vid3rbMatches = html.match(vid3rbPattern) || []
  for (const url of vid3rbMatches) {
    const normalized = normalizeUrl(url)
    if (!sources.some(s => s.url === normalized)) {
      sources.push({ url: normalized, type: 'proxy', server_name: 'anime3rb', quality: '720p' })
    }
  }

  // Pattern 3: Any vid3rb.com URL not already captured (also needs proxy)
  const anyVid3rbPattern = /https:\/\/[^/]*vid3rb\.com\/[^\s"'<>]+/g
  const anyVid3rbMatches = html.match(anyVid3rbPattern) || []
  for (const url of anyVid3rbMatches) {
    const normalized = normalizeUrl(url)
    if (!sources.some(s => s.url === normalized)) {
      // Filter out thumbnails and images
      if (normalized.match(/\.(jpg|jpeg|png|webp|gif|svg|vtt|srt)$/i)) continue
      if (normalized.match(/thumbnail/i)) continue

      // /video/<uuid> links without signed params are usually not playable.
      const isSignedVid3rbVideo = /video\.vid3rb\.com\/video\//i.test(normalized)
        && /(?:\?|&)token=/i.test(normalized)
      const isDirect = normalized.match(/\.mp4/i) || isSignedVid3rbVideo
      sources.push({ url: normalized, type: isDirect ? 'direct' : 'proxy', server_name: 'anime3rb', quality: '720p' })
    }
  }

  // Pattern 4: iframe sources (may contain external players)
  const iframePattern = /<iframe[^>]+src=["']([^"']+)["']/gi
  let iframeMatch
  while ((iframeMatch = iframePattern.exec(html)) !== null) {
    const url = normalizeUrl(iframeMatch[1])
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
    const url = normalizeUrl(videoMatch[1])
    if (!sources.some(s => s.url === url)) {
      sources.push({ url, type: 'direct', server_name: 'anime3rb', quality: '720p' })
    }
  }

  // Pattern 6: Look for video URL in JavaScript variables/objects
  const jsVideoPattern = /["'](?:src|file|url|source|video_url)["']\s*:\s*["'](https?:\/\/[^"']+(?:\.mp4|\.m3u8|\.webm|vid3rb)[^"']*)["']/gi
  let jsMatch
  while ((jsMatch = jsVideoPattern.exec(html)) !== null) {
    const url = normalizeUrl(jsMatch[1])
    if (!sources.some(s => s.url === url)) {
      const isSignedVid3rbVideo = /video\.vid3rb\.com\/video\//i.test(url) && /(?:\?|&)token=/i.test(url)
      const isDirectVideo = url.match(/\.(mp4|m3u8|webm)/) || isSignedVid3rbVideo
      const needsProxy = !isDirectVideo && (url.includes('anime3rb.com') || url.includes('vid3rb.com'))
      sources.push({
        url,
        type: isDirectVideo ? 'direct' : (needsProxy ? 'proxy' : 'embed'),
        server_name: 'anime3rb',
        quality: '720p',
      })
    }
  }

  // Prefer directly playable sources first so the player uses them by default.
  sources.sort((a, b) => {
    const rank = (type: 'direct' | 'proxy' | 'embed') => (
      type === 'direct' ? 0 : type === 'proxy' ? 1 : 2
    )
    return rank(a.type) - rank(b.type)
  })

  return sources
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function findPlayerUrlInText(text: string): string | null {
  const match = text.match(/https?:\/\/video\.vid3rb\.com\/player\/[a-f0-9-]{36}[^\s"'<>]*/i)
  if (!match?.[0]) return null
  return normalizeDirectUrl(match[0])
}

function searchJsonForPlayerUrl(obj: unknown, depth = 0): string | null {
  if (depth > 10) return null
  if (typeof obj === 'string') return findPlayerUrlInText(obj)
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = searchJsonForPlayerUrl(item, depth + 1)
      if (found) return found
    }
    return null
  }
  if (obj && typeof obj === 'object') {
    for (const value of Object.values(obj)) {
      const found = searchJsonForPlayerUrl(value, depth + 1)
      if (found) return found
    }
  }
  return null
}

function extractFromWireSnapshot(html: string): string | null {
  const snapshotPattern = /wire:snapshot\s*=\s*"((?:[^"\\]|\\.)*)"|wire:snapshot\s*=\s*'((?:[^'\\]|\\.)*)'|wire:initial-data\s*=\s*"((?:[^"\\]|\\.)*)"/gs
  let match: RegExpExecArray | null
  while ((match = snapshotPattern.exec(html)) !== null) {
    const raw = match[1] || match[2] || match[3]
    if (!raw) continue
    const decoded = decodeHtmlEntities(raw)
    if (!decoded.includes('vid3rb')) continue

    const direct = findPlayerUrlInText(decoded)
    if (direct) return direct

    try {
      const parsed = JSON.parse(decoded)
      const found = searchJsonForPlayerUrl(parsed)
      if (found) return found
    } catch {
      // Continue with next snapshot.
    }
  }
  return null
}

function extractPlayerUrlFromEpisodeHtml(html: string): string | null {
  const attrMatch = html.match(/(?:src|href|data-src|data-url|data-iframe)\s*=\s*["']?(https?:\/\/video\.vid3rb\.com\/player\/[^"'>\s]+)/i)
  if (attrMatch?.[1]) return normalizeDirectUrl(attrMatch[1])

  const snapshotUrl = extractFromWireSnapshot(html)
  if (snapshotUrl) return snapshotUrl

  const snapshotJsonMatch = html.match(/"video_url"\s*:\s*"(https?:\\?\/\\?\/video\.vid3rb\.com\\?\/player\\?\/[^"]+)"/i)
  if (snapshotJsonMatch?.[1]) return normalizeDirectUrl(snapshotJsonMatch[1])

  const jsMatch = html.match(/(?:url|src|href|iframe|player|video_url|videoUrl)\s*[=:]\s*['"](https?:\/\/video\.vid3rb\.com\/player\/[^'"]+)/i)
  if (jsMatch?.[1]) return normalizeDirectUrl(jsMatch[1])

  const catchAll = html.match(/https?:(?:\/\/|\\?\/\\?\/)video\.vid3rb\.com(?:\\?\/)player(?:\\?\/)([a-f0-9-]{36}(?:[?&][^\s"'<>\\]*)?)/i)
  if (catchAll?.[0]) {
    const cleaned = normalizeDirectUrl(catchAll[0])
    if (cleaned.startsWith('https://')) return cleaned
    if (catchAll[1]) return `https://video.vid3rb.com/player/${normalizeDirectUrl(catchAll[1])}`
  }

  return null
}

function extractDirectUrlFromText(text: string): string | null {
  const patterns = [
    /https?:\/\/[^\s"'<>]*files\.vid3rb\.com[^\s"'<>]*\.mp4[^\s"'<>]*/i,
    /https?:\/\/video\.vid3rb\.com\/video\/[a-f0-9-]{36}(?:\?[^\s"'<>]*)?/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (!match?.[0]) continue
    const normalized = normalizeDirectUrl(match[0])
    if (isDirectLikeUrl(normalized)) return normalized
  }

  return null
}

function parseBestDirectFromPlayerHtml(html: string): string | null {
  const matches = Array.from(html.matchAll(/video_sources\s*=\s*(\[.*?\]);/gs))
  for (const match of matches.reverse()) {
    const raw = match[1]
    if (!raw || raw.length <= 5) continue
    try {
      const sources = JSON.parse(raw)
      if (!Array.isArray(sources)) continue

      const valid = sources
        .filter((s: any) => s?.src && !s?.premium)
        .sort((a: any, b: any) => parseInt(String(b?.res ?? '0'), 10) - parseInt(String(a?.res ?? '0'), 10))

      for (const src of valid) {
        const candidate = normalizeDirectUrl(String(src.src))
        if (isDirectLikeUrl(candidate)) return candidate
      }
    } catch {
      // Keep checking the other matches.
    }
  }
  return extractDirectUrlFromText(html)
}

async function fetchDirectVideoFromPlayer(playerUrl: string, refererUrl: string, apifyToken: string): Promise<string | null> {
  const normalizedPlayerUrl = normalizeDirectUrl(playerUrl)

  try {
    const resp = await fetch(normalizedPlayerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': refererUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (resp.ok) {
      const html = await resp.text()
      const direct = parseBestDirectFromPlayerHtml(html)
      if (direct) return direct
    }
  } catch {
    // Fall back to Apify path below.
  }

  const playerResult = await fetchWithApify(normalizedPlayerUrl, apifyToken)
  if (!playerResult.html) return null
  return parseBestDirectFromPlayerHtml(playerResult.html)
}

function isDirectLikeUrl(url: string): boolean {
  const isSignedVid3rbVideo = /video\.vid3rb\.com\/video\//i.test(url) && /(?:\?|&)token=/i.test(url)
  return (
    /\.mp4(?:$|[?#])/i.test(url) ||
    isSignedVid3rbVideo
  )
}

function normalizeDirectUrl(url: string): string {
  return url.replace(/\\\//g, '/').replace(/&amp;/g, '&').trim()
}

function parseExpiresParam(url: string): number | null {
  try {
    const parsed = new URL(url)
    const raw = parsed.searchParams.get('expires')
    if (!raw) return null
    const n = Number(raw)
    return Number.isFinite(n) ? n : null
  } catch {
    return null
  }
}

function isUrlExpiringSoon(url: string, skewSeconds = 180): boolean {
  const expires = parseExpiresParam(url)
  if (!expires) return false
  const nowSec = Math.floor(Date.now() / 1000)
  return expires <= nowSec + skewSeconds
}

async function isDirectUrlReachable(url: string): Promise<boolean> {
  if (!isDirectLikeUrl(url)) return false
  if (isUrlExpiringSoon(url, 90)) return false

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://anime3rb.com/',
      },
      signal: AbortSignal.timeout(15000),
    })

    if (resp.status !== 200 && resp.status !== 206) return false
    const ct = (resp.headers.get('content-type') || '').toLowerCase()
    return ct.includes('video') || ct.includes('octet-stream') || ct.includes('binary')
  } catch {
    return false
  }
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
        let hasPlayableDirect = false
        for (const s of cached.video_sources as any[]) {
          const url = String(s?.url || '')
          const type = String(s?.type || '')
          if (type !== 'direct' && !isDirectLikeUrl(url)) continue
          if (isUrlExpiringSoon(url, 180)) continue
          if (await isDirectUrlReachable(url)) {
            hasPlayableDirect = true
            break
          }
        }

        if (hasPlayableDirect) {
          console.log(`[Cache] Found cached episode: mal_id=${malId}, ep=${episodeNumber}`)
          return jsonResponse({
            video_sources: cached.video_sources,
            cached: true,
            debug: { method: 'cache' },
          })
        }

        console.log(`[Cache] Cached sources are proxy-only; re-scraping mal_id=${malId}, ep=${episodeNumber}`)
      }
    }

    console.log(`[Scraper] Starting for "${animeTitle}" Episode ${episodeNumber}`)

    // Step 1: Search anime3rb for the anime slug (with query fallbacks)
    const searchQueries = buildSearchQueries(animeTitle, animeTitleEnglish)
    let animeSlug: string | null = null
    let lastSearchDebug: any = null

    for (const query of searchQueries) {
      const searchUrl = `https://anime3rb.com/search?q=${encodeURIComponent(query)}`
      console.log(`[Step 1] Searching anime3rb: ${searchUrl}`)

      const searchResult = await fetchWithApify(searchUrl, apifyToken)
      lastSearchDebug = {
        query,
        searchUrl,
        error: searchResult.error,
        htmlLength: searchResult.html?.length || 0,
      }

      if (!searchResult.html) continue

      animeSlug = extractAnimeSlugFromSearch(searchResult.html, animeTitle)
      if (animeSlug) {
        break
      }
    }

    if (!animeSlug) {
      return jsonResponse({
        error: 'Anime not found on anime3rb',
        debug: { step: 'search', lastSearchDebug, searchQueries },
      })
    }

    console.log(`[Step 1] Found anime slug: ${animeSlug}`)

    // Step 2: Fetch title page and build episode URL candidates
    const titleUrl = `https://anime3rb.com/titles/${animeSlug}`
    console.log(`[Step 2] Fetching title page: ${titleUrl}`)
    const titleResult = await fetchWithApify(titleUrl, apifyToken)
    const episodeCandidates = buildEpisodeUrlCandidates(
      animeSlug,
      episodeNumber,
      titleResult.html || '',
    )

    console.log(`[Step 2] Episode URL candidates:`, episodeCandidates)

    // Step 3: Try candidate episode pages until one yields a signed direct URL
    let videoSources: ReturnType<typeof extractVideoUrls> = []
    let usedEpisodeUrl: string | null = null
    let lastEpisodeError: string | undefined = undefined

    for (const episodeUrl of episodeCandidates) {
      console.log(`[Step 3] Fetching episode page: ${episodeUrl}`)
      const episodeResult = await fetchWithApify(episodeUrl, apifyToken)
      if (episodeResult.error && !episodeResult.html) {
        lastEpisodeError = episodeResult.error
        continue
      }

      const extracted = extractVideoUrls(episodeResult.html)

      // 1) Best path: resolve signed direct URL from player page.
      const playerUrl =
        extractPlayerUrlFromEpisodeHtml(episodeResult.html) ||
        extracted.find((s) => /video\.vid3rb\.com\/player\//i.test(s.url))?.url ||
        null

      let directUrl: string | null = null
      if (playerUrl) {
        directUrl = await fetchDirectVideoFromPlayer(playerUrl, episodeUrl, apifyToken)
      }

      // 2) Fallback: signed direct URL already present in episode HTML.
      if (!directUrl) {
        const signed = extracted.find((s) => isDirectLikeUrl(normalizeDirectUrl(s.url)))
        if (signed) {
          directUrl = signed.url
        }
      }

      if (!directUrl) {
        lastEpisodeError = 'No signed direct URL found'
        continue
      }

      directUrl = normalizeDirectUrl(directUrl)
      const reachable = await isDirectUrlReachable(directUrl)
      if (!reachable) {
        lastEpisodeError = 'Signed direct URL is not reachable'
        continue
      }

      // Return ONLY one direct source, as requested.
      videoSources = [
        {
          url: directUrl,
          type: 'direct',
          server_name: 'anime3rb-direct',
          quality: '1080p',
        },
      ]
      usedEpisodeUrl = episodeUrl
      break
    }

    if (videoSources.length === 0) {
      return jsonResponse({
        error: 'No signed direct video URL found on candidate episode pages',
        debug: {
          step: 'extract',
          animeSlug,
          episodeCandidates,
          lastEpisodeError,
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
        episodeUrl: usedEpisodeUrl,
        sourceCount: videoSources.length,
      },
    })
  } catch (error: any) {
    console.error('[Error]', error)
    return jsonResponse({ error: error.message || 'Unknown error' }, 500)
  }
})
