// Supabase Edge Function: scrape-anime3rb
// On-demand scraper that fetches anime3rb.com episode pages directly,
// bypasses Cloudflare using Apify's Cloudflare Bypasser actor, extracts the video URL,
// and caches the result in the database for future use.
// Strategy:
// 1) provided episode URL (directEpisodeUrl)
// 2) stored DB episode_page_url
// 3) built canonical URL from MAL title + episode
// 4) anime3rb search fallback
// Stop on first successful 1080p resolution.
//
// Deploy to: Supabase Dashboard → Edge Functions → scrape-anime3rb

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MIN_PREFERRED_RESOLUTION = 1080
const SCRAPE_CACHE_TTL_MS = 2 * 60 * 60 * 1000

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

type PythonResolveByNameResponse = {
  success?: boolean
  video_url?: string | null
  episode_page_url?: string | null
  error?: string | null
}

async function resolveFromPythonService(
  serviceBaseUrl: string,
  animeNames: string[],
  episodeNumber: number,
): Promise<{
  videoUrl: string
  episodePageUrl: string | null
  matchedAnimeName: string
  attempts: Array<{ animeName: string; ok: boolean; status?: number; error?: string | null }>
} | null> {
  const base = serviceBaseUrl.replace(/\/+$/, '')
  const attempts: Array<{ animeName: string; ok: boolean; status?: number; error?: string | null }> = []

  for (const animeName of animeNames) {
    const trimmed = String(animeName || '').trim()
    if (!trimmed) continue

    try {
      const response = await fetch(`${base}/api/resolve-by-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          anime_name: trimmed,
          episode_number: episodeNumber,
        }),
        signal: AbortSignal.timeout(30000),
      })

      if (!response.ok) {
        let errorSnippet: string | null = null
        try {
          const text = await response.text()
          errorSnippet = text ? text.slice(0, 160) : null
        } catch {
          // ignore
        }
        attempts.push({ animeName: trimmed, ok: false, status: response.status, error: errorSnippet })
        continue
      }

      const payload = (await response.json()) as PythonResolveByNameResponse
      if (payload.success && payload.video_url) {
        attempts.push({ animeName: trimmed, ok: true })
        return {
          videoUrl: payload.video_url,
          episodePageUrl: payload.episode_page_url || null,
          matchedAnimeName: trimmed,
          attempts,
        }
      }

      attempts.push({
        animeName: trimmed,
        ok: false,
        error: payload.error || 'No video URL',
      })
    } catch (error: any) {
      attempts.push({
        animeName: trimmed,
        ok: false,
        error: error?.message || 'Request failed',
      })
    }
  }

  return null
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
  )

  return [...new Set(candidates)]
}

function parseEpisodeNumberInput(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    const n = Math.trunc(input)
    return n > 0 ? n : null
  }

  if (typeof input === 'string') {
    const match = input.match(/(\d+)/)
    if (!match?.[1]) return null
    const n = parseInt(match[1], 10)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  return null
}

function sanitizeEpisodeUrlCandidates(candidates: string[], episodeNumber: number): string[] {
  const out: string[] = []
  const seen = new Set<string>()

  for (const raw of candidates) {
    const normalized = normalizeDirectUrl(String(raw || ''))
      .replace(/[#?].*$/, '')
      .replace(/\/+$/, '')

    if (!normalized) continue

    const slashFormat = normalized.match(/^https?:\/\/(?:www\.)?anime3rb\.com\/episode\/([a-z0-9-]+)\/(\d+)$/i)
    const dashFormat = normalized.match(/^https?:\/\/(?:www\.)?anime3rb\.com\/episode\/([a-z0-9-]+)-episode-(\d+)$/i)

    let canonical: string | null = null
    let parsedEpisode: number | null = null

    if (slashFormat?.[1] && slashFormat[2]) {
      parsedEpisode = parseInt(slashFormat[2], 10)
      canonical = `https://anime3rb.com/episode/${slashFormat[1]}/${slashFormat[2]}`
    } else if (dashFormat?.[1] && dashFormat[2]) {
      parsedEpisode = parseInt(dashFormat[2], 10)
      canonical = `https://anime3rb.com/episode/${dashFormat[1]}-episode-${dashFormat[2]}`
    }

    if (!canonical || !parsedEpisode || parsedEpisode !== episodeNumber) continue

    if (!seen.has(canonical)) {
      seen.add(canonical)
      out.push(canonical)
    }
  }

  return out
}

// Extract video URLs from anime3rb episode page HTML
function extractVideoUrls(html: string): { url: string; type: 'direct' | 'embed' | 'proxy'; server_name: string; quality: string }[] {
  const sources: { url: string; type: 'direct' | 'embed' | 'proxy'; server_name: string; quality: string }[] = []
  const normalizeUrl = (raw: string) => raw.replace(/\\\//g, '/').replace(/&amp;/g, '&').trim()

  // Pattern 1: Direct MP4 files from files.vid3rb.com
  // Generate 1080p/720p/480p variants from any found URL
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
    /https?:\/\/[^\s"'<>]*files\.vid3rb\.com[^\s"'<>]*\.mp4[^\s"'<>]*/gi,
    /https?:\/\/video\.vid3rb\.com\/video\/[a-f0-9-]{36}(?:\?[^\s"'<>]*)?/gi,
  ]

  const candidates: string[] = []
  for (const pattern of patterns) {
    const matches = text.match(pattern) || []
    for (const raw of matches) {
      const normalized = normalizeDirectUrl(raw)
      if (isDirectLikeUrl(normalized)) {
        candidates.push(normalized)
      }
    }
  }

  return pickBestDirectUrl(candidates)
}

function extractResolution(text: string): number {
  const normalized = String(text || '').toLowerCase()
  const exactMatch = normalized.match(/\b(2160|1440|1080|720|480|360|240)p\b/)
  if (exactMatch?.[1]) return parseInt(exactMatch[1], 10)

  return 0
}

function getUrlResolution(url: string): number {
  const normalized = normalizeDirectUrl(url)
  const fromPath = normalized.match(/\/(2160|1440|1080|720|480|360|240)p(?:\.mp4|[/?#]|$)/i)
  if (fromPath?.[1]) return parseInt(fromPath[1], 10)
  return extractResolution(normalized)
}

function getSourceResolution(source: any): number {
  const fields = [source?.res, source?.label, source?.quality, source?.name, source?.src]
  let best = 0
  for (const field of fields) {
    const asNumber = Number(field)
    if (Number.isFinite(asNumber) && [2160, 1440, 1080, 720, 480, 360, 240].includes(asNumber)) {
      best = Math.max(best, asNumber)
      continue
    }
    best = Math.max(best, extractResolution(String(field ?? '')))
  }
  return best
}

function pickBestDirectUrl(urls: string[]): string | null {
  if (!urls.length) return null

  const unique = [...new Set(urls.map((u) => normalizeDirectUrl(u)).filter((u) => isDirectLikeUrl(u)))]
  if (!unique.length) return null

  unique.sort((a, b) => {
    const aSigned = isSignedVid3rbVideo(a) ? 1 : 0
    const bSigned = isSignedVid3rbVideo(b) ? 1 : 0
    if (aSigned !== bSigned) return bSigned - aSigned

    const resDiff = getUrlResolution(b) - getUrlResolution(a)
    if (resDiff !== 0) return resDiff
    // Prefer files mp4 when resolution ties.
    const aMp4 = /\.mp4(?:$|[?#])/i.test(a) ? 1 : 0
    const bMp4 = /\.mp4(?:$|[?#])/i.test(b) ? 1 : 0
    if (aMp4 !== bMp4) return bMp4 - aMp4
    return a.length - b.length
  })

  return unique[0]
}

function qualityFromUrl(url: string): string {
  const res = getUrlResolution(url)
  return res > 0 ? `${res}p` : 'auto'
}

function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isScrapedVideoFresh(scrapedAt: unknown, maxAgeMs = SCRAPE_CACHE_TTL_MS): boolean {
  if (typeof scrapedAt !== 'string' || !scrapedAt) return false
  const parsed = Date.parse(scrapedAt)
  if (!Number.isFinite(parsed)) return false
  return Date.now() - parsed < maxAgeMs
}

function extractCfTokenFromPlayerHtml(html: string): string | null {
  const patterns = [
    /cf_token\s*[=:]\s*["']([^"']+)["']/i,
    /["']cf_token["']\s*:\s*["']([^"']+)["']/i,
    /window\.cf_token\s*=\s*["']([^"']+)["']/i,
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return match[1]
  }
  return null
}

type DirectCandidate = {
  url: string
  resolution: number
}

function rankDirectCandidates(candidates: DirectCandidate[]): DirectCandidate[] {
  if (!candidates.length) return []

  const byUrl = new Map<string, number>()
  for (const item of candidates) {
    const url = normalizeDirectUrl(item.url)
    if (!isDirectLikeUrl(url)) continue
    const res = Math.max(item.resolution || 0, getUrlResolution(url))
    byUrl.set(url, Math.max(byUrl.get(url) || 0, res))
  }

  const ranked = Array.from(byUrl.entries()).map(([url, resolution]) => ({ url, resolution }))
  ranked.sort((a, b) => {
    const aSigned = isSignedVid3rbVideo(a.url) ? 1 : 0
    const bSigned = isSignedVid3rbVideo(b.url) ? 1 : 0
    if (aSigned !== bSigned) return bSigned - aSigned

    const resDiff = b.resolution - a.resolution
    if (resDiff !== 0) return resDiff

    const aMp4 = /\.mp4(?:$|[?#])/i.test(a.url) ? 1 : 0
    const bMp4 = /\.mp4(?:$|[?#])/i.test(b.url) ? 1 : 0
    if (aMp4 !== bMp4) return bMp4 - aMp4
    return a.url.length - b.url.length
  })

  return ranked
}

function pickBestDirectCandidate(candidates: DirectCandidate[]): string | null {
  const ranked = rankDirectCandidates(candidates)
  return ranked.length > 0 ? ranked[0].url : null
}

function has1080Candidate(candidates: DirectCandidate[]): boolean {
  return candidates.some((candidate) => {
    const res = Math.max(candidate.resolution || 0, getUrlResolution(candidate.url))
    return res >= 1080 || /(?:^|\/)1080p(?:\.mp4|[/?#]|$)/i.test(candidate.url)
  })
}

async function resolveSignedVideoToFinalUrl(url: string): Promise<string> {
  const normalized = normalizeDirectUrl(url)
  if (!isSignedVid3rbVideo(normalized)) return normalized

  try {
    // First pass: read redirect target directly.
    const manualResp = await fetch(normalized, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'Range': 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://video.vid3rb.com/',
      },
      signal: AbortSignal.timeout(15000),
    })

    const location = manualResp.headers.get('location')
    if (location) {
      const redirected = normalizeDirectUrl(location)
      if (/\/1080p\.mp4(?:[?#]|$)/i.test(redirected) || /\.mp4(?:[?#]|$)/i.test(redirected)) {
        return redirected
      }
    }

    // Fallback: follow redirects and use final response URL if it's mp4.
    const followResp = await fetch(normalized, {
      method: 'GET',
      headers: {
        'Range': 'bytes=0-1',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
        'Referer': 'https://video.vid3rb.com/',
      },
      signal: AbortSignal.timeout(15000),
    })
    const effective = normalizeDirectUrl(followResp.url || '')
    if (/\.mp4(?:[?#]|$)/i.test(effective)) {
      return effective
    }
  } catch {
    // Keep the original signed URL.
  }

  return normalized
}

function collectDirectCandidatesFromPayload(payload: unknown): DirectCandidate[] {
  const out: DirectCandidate[] = []

  const walk = (value: unknown, inheritedResolution: number, depth: number) => {
    if (depth > 10) return

    if (typeof value === 'string') {
      const candidate = normalizeDirectUrl(value)
      if (isDirectLikeUrl(candidate)) {
        out.push({ url: candidate, resolution: Math.max(inheritedResolution, getUrlResolution(candidate)) })
      }
      return
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item, inheritedResolution, depth + 1)
      }
      return
    }

    if (!value || typeof value !== 'object') return

    const obj = value as Record<string, unknown>
    if (obj.premium === true) return

    const ownResolution = Math.max(inheritedResolution, getSourceResolution(obj))

    for (const key of ['src', 'url', 'video_url', 'file', 'download']) {
      if (typeof obj[key] === 'string') {
        walk(obj[key], ownResolution, depth + 1)
      }
    }

    for (const nested of Object.values(obj)) {
      walk(nested, ownResolution, depth + 1)
    }
  }

  walk(payload, 0, 0)
  return out
}

async function fetchBestDirectFromSourcesApi(playerUrl: string, playerHtml: string): Promise<string | null> {
  const candidates = await fetchDirectCandidatesFromSourcesApi(playerUrl, playerHtml)
  return pickBestDirectCandidate(candidates)
}

async function fetchDirectCandidatesFromSourcesApi(playerUrl: string, playerHtml: string): Promise<DirectCandidate[]> {
  const cfToken = extractCfTokenFromPlayerHtml(playerHtml)
  if (!cfToken) return []

  const playerUuid = playerUrl.match(/\/player\/([a-f0-9-]+)/i)?.[1]
  if (!playerUuid) return []

  const sourcesUrl = `https://video.vid3rb.com/player/${playerUuid}/sources?cf_token=${encodeURIComponent(cfToken)}`

  try {
    const response = await fetch(sourcesUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': playerUrl,
        'Accept': 'application/json,*/*',
        'Origin': 'https://video.vid3rb.com',
      },
      signal: AbortSignal.timeout(20000),
    })

    if (!response.ok) return []

    const text = await response.text()
    if (!text) return []

    let payload: any
    try {
      payload = JSON.parse(text)
    } catch {
      return []
    }

    return rankDirectCandidates(collectDirectCandidatesFromPayload(payload))
  } catch {
    return []
  }
}

function parseDirectCandidatesFromPlayerHtml(html: string): DirectCandidate[] {
  const candidates: DirectCandidate[] = []
  const matches = Array.from(html.matchAll(/video_sources\s*=\s*(\[.*?\]);/gs))
  for (const match of matches.reverse()) {
    const raw = match[1]
    if (!raw || raw.length <= 5) continue
    try {
      const sources = JSON.parse(raw)
      if (!Array.isArray(sources)) continue

      const valid = sources
        .filter((s: any) => !s?.premium)
        .sort((a: any, b: any) => getSourceResolution(b) - getSourceResolution(a))

      for (const src of valid) {
        const resolution = getSourceResolution(src)
        for (const field of [src?.src, src?.url, src?.video_url, src?.file, src?.download]) {
          if (!field) continue
          const candidate = normalizeDirectUrl(String(field))
          if (isDirectLikeUrl(candidate)) {
            candidates.push({ url: candidate, resolution })
          }
        }
      }
    } catch {
      // Keep checking the other matches.
    }
  }

  const textDirects = extractDirectUrlFromText(html)
  if (textDirects) {
    candidates.push({ url: textDirects, resolution: getUrlResolution(textDirects) })
  }

  return rankDirectCandidates(candidates)
}

function parseBestDirectFromPlayerHtml(html: string): string | null {
  const ranked = parseDirectCandidatesFromPlayerHtml(html)
  return ranked.length > 0 ? ranked[0].url : null
}

async function fetchDirectVideoLinksFromPlayer(playerUrl: string, refererUrl: string, apifyToken: string): Promise<DirectCandidate[]> {
  const normalizedPlayerUrl = normalizeDirectUrl(playerUrl)
  let collected: DirectCandidate[] = []
  const maxWaitAttempts = 4
  const waitMs = 1500

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

      // Prefer signed sources endpoint when available (dynamic token flow).
      const fromSourcesApi = await fetchDirectCandidatesFromSourcesApi(normalizedPlayerUrl, html)
      const fromHtml = parseDirectCandidatesFromPlayerHtml(html)
      collected = rankDirectCandidates([...collected, ...fromSourcesApi, ...fromHtml])
      if (has1080Candidate(collected)) {
        return collected
      }

      // Player sources can populate progressively; give it a short window before fallback.
      for (let i = 0; i < maxWaitAttempts; i++) {
        await sleep(waitMs)
        const retrySources = await fetchDirectCandidatesFromSourcesApi(normalizedPlayerUrl, html)
        collected = rankDirectCandidates([...collected, ...retrySources])
        if (has1080Candidate(collected)) {
          return collected
        }
      }

      if (collected.length > 0) return collected
    }
  } catch {
    // Fall back to Apify path below.
  }

  const playerResult = await fetchWithApify(normalizedPlayerUrl, apifyToken)
  if (!playerResult.html) return []

  const fromSourcesApiFallback = await fetchDirectCandidatesFromSourcesApi(normalizedPlayerUrl, playerResult.html)
  const fromHtmlFallback = parseDirectCandidatesFromPlayerHtml(playerResult.html)
  collected = rankDirectCandidates([...collected, ...fromSourcesApiFallback, ...fromHtmlFallback])

  if (!has1080Candidate(collected)) {
    for (let i = 0; i < maxWaitAttempts; i++) {
      await sleep(waitMs)
      const retrySourcesFallback = await fetchDirectCandidatesFromSourcesApi(normalizedPlayerUrl, playerResult.html)
      collected = rankDirectCandidates([...collected, ...retrySourcesFallback])
      if (has1080Candidate(collected)) {
        break
      }
    }
  }

  return collected
}

function isDirectLikeUrl(url: string): boolean {
  const isSigned = isSignedVid3rbVideo(url)
  return (
    /\.mp4(?:$|[?#])/i.test(url) ||
    isSigned
  )
}

function isSignedVid3rbVideo(url: string): boolean {
  return /video\.vid3rb\.com\/video\//i.test(url) && /(?:\?|&)token=/i.test(url)
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
    const { animeTitle, animeTitleEnglish, episodeNumber, malId, forceRefresh, directEpisodeUrl } = await req.json()
    const rawEpisodeNumber = episodeNumber
    const normalizedEpisodeNumber = parseEpisodeNumberInput(episodeNumber)

    if (!normalizedEpisodeNumber) {
      return jsonResponse({
        error: 'episodeNumber must contain a positive integer',
        debug: {
          raw_episode_number: rawEpisodeNumber ?? null,
          normalized_episode_number: null,
          episode_candidates: [],
        },
      }, 400)
    }

    if (directEpisodeUrl) {
      // Direct URL mode: episodeNumber still required for DB caching
      // Input validated above.
    } else {
      if (!animeTitle) {
        return jsonResponse({ error: 'animeTitle and episodeNumber are required' }, 400)
      }
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

    let dbEpisodePageUrl: string | null = null
    const providedEpisodeUrl = directEpisodeUrl ? String(directEpisodeUrl) : null
    let resolutionStepUsed: 'provided_link' | 'db_link' | 'built_link' | 'search' | null = null
    let savedEpisodePageUrl: string | null = null

    // Step 0: Check if we already have this episode cached
    if (!forceRefresh && supabase && malId) {
      const { data: cached } = await supabase
        .from('anime_episodes')
        .select('*')
        .eq('mal_id', malId)
        .eq('episode_number', normalizedEpisodeNumber)
        .eq('is_active', true)
        .single()

      if (cached?.video_sources && cached.video_sources.length > 0) {
        let hasPlayableDirect = false
        let bestCachedResolution = 0
        const cachedScrapedAt = typeof (cached as any)?.scraped_at === 'string'
          ? String((cached as any).scraped_at)
          : null
        const isFreshCache = isScrapedVideoFresh(cachedScrapedAt)
        for (const s of cached.video_sources as any[]) {
          const url = String(s?.url || '')
          const type = String(s?.type || '')
          if (type !== 'direct' && !isDirectLikeUrl(url)) continue
          bestCachedResolution = Math.max(bestCachedResolution, getUrlResolution(url))
          if (isUrlExpiringSoon(url, 180)) continue
          if (await isDirectUrlReachable(url)) {
            hasPlayableDirect = true
            break
          }
        }

        if (isFreshCache && hasPlayableDirect && bestCachedResolution >= MIN_PREFERRED_RESOLUTION) {
          console.log(`[Cache] Found cached episode: mal_id=${malId}, ep=${normalizedEpisodeNumber}`)
          return jsonResponse({
            video_sources: cached.video_sources,
            cached: true,
            debug: {
              method: 'cache',
              scraped_at: cachedScrapedAt,
              resolution_step_used: null,
              provided_episode_url: providedEpisodeUrl,
              db_episode_page_url: typeof (cached as any)?.episode_page_url === 'string'
                ? String((cached as any).episode_page_url)
                : null,
              saved_episode_page_url: null,
              raw_episode_number: rawEpisodeNumber ?? null,
              normalized_episode_number: normalizedEpisodeNumber,
              episode_candidates: [],
            },
          })
        }

        console.log(
          `[Cache] Cached direct is stale/missing/low-quality (${bestCachedResolution}p); re-scraping mal_id=${malId}, ep=${normalizedEpisodeNumber}`
        )
      }
    }

    // Step 1 (DB): use episode_page_url from anime_episodes as fallback after provided URL.
    if (supabase && malId) {
      try {
        const { data: dbEpisode } = await supabase
          .from('anime_episodes')
          .select('episode_page_url')
          .eq('mal_id', malId)
          .eq('episode_number', normalizedEpisodeNumber)
          .eq('is_active', true)
          .maybeSingle()

        if (dbEpisode && typeof (dbEpisode as any).episode_page_url === 'string') {
          dbEpisodePageUrl = String((dbEpisode as any).episode_page_url)
        }
      } catch {
        // Keep DB link optional.
      }
    }

    let episodeCandidates: string[] = []
    let rawEpisodeCandidates: string[] = []
    let animeSlug: string | null = null
    let searchQueries: string[] = []
    let lastSearchDebug: any = null
    let searchFallbackUsed = false
    searchQueries = animeTitle ? buildSearchQueries(animeTitle, animeTitleEnglish) : []

    // Step 3: Try candidate episode pages until one yields direct video URLs
    let videoSources: ReturnType<typeof extractVideoUrls> = []
    let usedEpisodeUrl: string | null = null
    let lastEpisodeError: string | undefined = undefined
    let selectedCandidateCount = 0
    let selectedTopQuality: string | null = null
    let selectedTopHost: string | null = null
    let selectedReachability: Record<string, boolean | null> = {}

    const tryResolveFromCandidates = async (candidates: string[]): Promise<boolean> => {
      for (const episodeUrl of candidates) {
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

        const directCandidates: DirectCandidate[] = []
        if (playerUrl) {
          const playerCandidates = await fetchDirectVideoLinksFromPlayer(playerUrl, episodeUrl, apifyToken)
          for (const candidate of playerCandidates) {
            directCandidates.push(candidate)
          }
        }

        // 2) Also include direct URLs already present in episode HTML.
        const fallbackCandidates = extracted
          .map((s) => normalizeDirectUrl(s.url))
          .filter((url) => isDirectLikeUrl(url))
        for (const url of fallbackCandidates) {
          directCandidates.push({ url, resolution: getUrlResolution(url) })
        }

        const rankedCandidates = rankDirectCandidates(directCandidates)
        if (rankedCandidates.length === 0) {
          lastEpisodeError = 'No direct video URL found'
          continue
        }

        // Strict 1080-only policy: never return 720/480 fallback URLs.
        // Some signed URLs do not expose resolution until redirect is resolved,
        // so probe top-ranked candidates when no explicit 1080 hint is present.
        const candidatesWith1080Hint = rankedCandidates.filter((candidate) => {
          const sourceRes = Math.max(candidate.resolution || 0, getUrlResolution(candidate.url))
          return sourceRes >= 1080 || /(?:^|\/)1080p(?:\.mp4|[/?#]|$)/i.test(candidate.url)
        })
        const candidatesToProbe =
          candidatesWith1080Hint.length > 0
            ? candidatesWith1080Hint
            : rankedCandidates.slice(0, 5)

        let chosenCandidate: DirectCandidate | null = null
        let resolvedChosenUrl: string | null = null
        for (const candidate of candidatesToProbe) {
          const resolved = await resolveSignedVideoToFinalUrl(candidate.url)
          const resolvedRes = getUrlResolution(resolved)
          const sourceRes = Math.max(candidate.resolution || 0, getUrlResolution(candidate.url))
          const is1080Resolved = resolvedRes >= 1080 || /(?:^|\/)1080p(?:\.mp4|[/?#]|$)/i.test(resolved)
          const is1080BySource = sourceRes >= 1080
          if (is1080Resolved || is1080BySource) {
            chosenCandidate = candidate
            resolvedChosenUrl = resolved
            break
          }
        }
        if (!chosenCandidate || !resolvedChosenUrl) {
          lastEpisodeError = candidatesWith1080Hint.length > 0
            ? '1080p candidates found, but no playable 1080p URL could be resolved'
            : 'No 1080p direct video URL found'
          continue
        }

        // Non-blocking diagnostics: probe reachability but do NOT filter output.
        const reachabilityByCandidate: Record<string, boolean | null> = {}
        for (const candidate of candidatesToProbe.slice(0, 5)) {
          const normalized = normalizeDirectUrl(candidate.url)
          try {
            reachabilityByCandidate[normalized] = await isDirectUrlReachable(normalized)
          } catch {
            reachabilityByCandidate[normalized] = null
          }
        }

        // Return one preferred source (1080p first when available).
        videoSources = [
          {
            url: resolvedChosenUrl,
            type: 'direct',
            server_name: 'anime3rb-direct',
            quality: '1080p',
          },
        ]
        usedEpisodeUrl = episodeUrl
        selectedCandidateCount = rankedCandidates.length
        selectedTopQuality = videoSources[0]?.quality || null
        selectedTopHost = videoSources[0]?.url ? hostFromUrl(videoSources[0].url) : null
        selectedReachability = reachabilityByCandidate
        return true
      }
      return false
    }

    let resolved = false

    // Step 1: Provided episode URL first, then DB episode_page_url
    const providedCandidates = providedEpisodeUrl
      ? sanitizeEpisodeUrlCandidates([providedEpisodeUrl], normalizedEpisodeNumber)
      : []
    const dbCandidates = dbEpisodePageUrl
      ? sanitizeEpisodeUrlCandidates([dbEpisodePageUrl], normalizedEpisodeNumber)
      : []
    episodeCandidates = [...new Set([...providedCandidates, ...dbCandidates])]
    rawEpisodeCandidates = [...episodeCandidates]

    if (episodeCandidates.length > 0) {
      console.log(`[Step 1] Candidate URLs (provided/db):`, episodeCandidates)
      const slugMatch = episodeCandidates[0].match(/anime3rb\.com\/episode\/([^/?#]+)/)
      if (slugMatch) {
        animeSlug = slugMatch[1].replace(/-episode-\d+$/, '')
      }
      resolved = await tryResolveFromCandidates(episodeCandidates)
      if (resolved && usedEpisodeUrl) {
        resolutionStepUsed = providedCandidates.includes(usedEpisodeUrl) ? 'provided_link' : 'db_link'
      }
    }

    // Step 2: Build canonical URL from MAL title + episode number
    if (!resolved && animeTitle) {
      console.log(`[Step 2] Building URL from MAL title for "${animeTitle}" Episode ${normalizedEpisodeNumber}`)
      const directSlugCandidates = [...new Set(
        searchQueries
          .map((q) => slugify(q))
          .filter((slug) => Boolean(slug))
      )]

      rawEpisodeCandidates = directSlugCandidates.map(
        (slug) => `https://anime3rb.com/episode/${slug}/${normalizedEpisodeNumber}`
      )
      episodeCandidates = sanitizeEpisodeUrlCandidates(rawEpisodeCandidates, normalizedEpisodeNumber)
      animeSlug = directSlugCandidates[0] || animeSlug
      console.log(`[Step 2] Built URL candidates:`, episodeCandidates)

      if (episodeCandidates.length > 0) {
        resolved = await tryResolveFromCandidates(episodeCandidates)
        if (resolved) {
          resolutionStepUsed = 'built_link'
        }
      }
    }

    // Step 3: Search fallback on anime3rb
    if (!resolved && animeTitle) {
      searchFallbackUsed = true
      console.log('[Step 3] Built URL failed, starting anime3rb search fallback...')

      for (const query of searchQueries) {
        const searchUrl = `https://anime3rb.com/search?q=${encodeURIComponent(query)}`
        console.log(`[Step 3] Searching anime3rb: ${searchUrl}`)

        const searchResult = await fetchWithApify(searchUrl, apifyToken)
        lastSearchDebug = {
          query,
          searchUrl,
          error: searchResult.error,
          htmlLength: searchResult.html?.length || 0,
        }

        if (!searchResult.html) continue

        animeSlug = extractAnimeSlugFromSearch(searchResult.html, animeTitle)
        if (animeSlug) break
      }

      if (animeSlug) {
        console.log(`[Step 3] Found anime slug: ${animeSlug}`)
        const titleUrl = `https://anime3rb.com/titles/${animeSlug}`
        console.log(`[Step 3] Fetching title page: ${titleUrl}`)
        const titleResult = await fetchWithApify(titleUrl, apifyToken)
        rawEpisodeCandidates = buildEpisodeUrlCandidates(animeSlug, normalizedEpisodeNumber, titleResult.html || '')
        episodeCandidates = sanitizeEpisodeUrlCandidates(rawEpisodeCandidates, normalizedEpisodeNumber)
        console.log(`[Step 3] Search candidates:`, episodeCandidates)

        if (episodeCandidates.length > 0) {
          resolved = await tryResolveFromCandidates(episodeCandidates)
          if (resolved) {
            resolutionStepUsed = 'search'
          }
        }
      }
    }

    if (!resolved || videoSources.length === 0) {
      return jsonResponse({
        error: 'No 1080p direct video URLs found on candidate episode pages',
        debug: {
          step: 'extract',
          resolution_step_used: resolutionStepUsed,
          provided_episode_url: providedEpisodeUrl,
          db_episode_page_url: dbEpisodePageUrl,
          saved_episode_page_url: savedEpisodePageUrl,
          animeSlug,
          search_fallback_used: searchFallbackUsed,
          lastSearchDebug,
          searchQueries,
          raw_episode_number: rawEpisodeNumber ?? null,
          normalized_episode_number: normalizedEpisodeNumber,
          episode_candidates: episodeCandidates,
          lastEpisodeError,
          candidate_count: selectedCandidateCount,
          top_candidate_quality: selectedTopQuality,
          top_candidate_url_host: selectedTopHost,
          reachability_by_candidate: selectedReachability,
        },
      })
    }

    console.log(`[Step 3] Found ${videoSources.length} video source(s)`)

    if (usedEpisodeUrl && (resolutionStepUsed === 'built_link' || resolutionStepUsed === 'search')) {
      savedEpisodePageUrl = usedEpisodeUrl
    }

    // Step 4: Cache the result in the database
    if (supabase && malId) {
      const upsertPayload: Record<string, unknown> = {
        mal_id: malId,
        episode_number: normalizedEpisodeNumber,
        video_url: videoSources[0].url,
        video_sources: videoSources,
        quality: videoSources[0].quality,
        subtitle_language: 'ar',
        is_active: true,
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (savedEpisodePageUrl) {
        upsertPayload.episode_page_url = savedEpisodePageUrl
      }

      const { error: upsertError } = await supabase
        .from('anime_episodes')
        .upsert(
          upsertPayload,
          { onConflict: 'mal_id,episode_number' }
        )

      if (upsertError) {
        console.error('[Cache] Failed to cache episode:', upsertError.message)
      } else {
        console.log(`[Cache] Cached episode: mal_id=${malId}, ep=${normalizedEpisodeNumber}`)
      }
    }

    return jsonResponse({
      video_sources: videoSources,
      cached: false,
      debug: {
        method: 'apify',
        enforced_1080_only: true,
        resolution_step_used: resolutionStepUsed,
        provided_episode_url: providedEpisodeUrl,
        db_episode_page_url: dbEpisodePageUrl,
        saved_episode_page_url: savedEpisodePageUrl,
        search_fallback_used: searchFallbackUsed,
        animeSlug,
        episodeUrl: usedEpisodeUrl,
        raw_episode_number: rawEpisodeNumber ?? null,
        normalized_episode_number: normalizedEpisodeNumber,
        episode_candidates: episodeCandidates,
        sourceCount: videoSources.length,
        candidate_count: selectedCandidateCount,
        top_candidate_quality: selectedTopQuality,
        top_candidate_url_host: selectedTopHost,
        reachability_by_candidate: selectedReachability,
      },
    })
  } catch (error: any) {
    console.error('[Error]', error)
    return jsonResponse({ error: error.message || 'Unknown error' }, 500)
  }
})
