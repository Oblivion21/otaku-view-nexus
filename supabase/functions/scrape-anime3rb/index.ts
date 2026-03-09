// Supabase Edge Function: scrape-anime3rb
// On-demand resolver that delegates anime3rb scraping to the remote ani3rbscraper service
// and caches the resolved video URL in the database for future use.
// Strategy:
// 1) provided episode URL (directEpisodeUrl) via remote /api/resolve
// 2) stored DB episode_page_url via remote /api/resolve
// 3) anime title + episode via remote /api/resolve-by-name
// Stop on first successful direct video URL.
//
// Deploy to: Supabase Dashboard → Edge Functions → scrape-anime3rb

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const MIN_PREFERRED_RESOLUTION = 1080
const DEFAULT_REMOTE_SCRAPER_URL = 'https://ani3rbscraper.onrender.com'
const SCRAPE_CACHE_TTL_MS = 2 * 60 * 60 * 1000
const PREFETCH_EPISODE_COUNT = 3

type RemoteResolveResponse = {
  success?: boolean
  video_url?: string | null
  episode_page_url?: string | null
  error?: string | null
}

type VideoSource = {
  url: string
  type: 'direct' | 'embed' | 'proxy'
  server_name: string
  quality: string
}

type ResolveStep = 'provided_link' | 'db_link' | 'search' | null

type ResolveEpisodeParams = {
  animeTitle?: string | null
  animeTitleEnglish?: string | null
  episodeNumber: number
  rawEpisodeNumber: unknown
  malId?: number | null
  forceRefresh?: boolean
  directEpisodeUrl?: string | null
  directUrlOnly?: boolean
  remoteScraperUrl: string
  supabase: any
}

type ResolveEpisodeSuccess = {
  ok: true
  cached: boolean
  videoSources: VideoSource[]
  usedEpisodeUrl: string | null
  savedEpisodePageUrl: string | null
  resolutionStepUsed: ResolveStep
  debug: Record<string, unknown>
}

type ResolveEpisodeFailure = {
  ok: false
  error: string
  debug: Record<string, unknown>
}

type ResolveEpisodeResult = ResolveEpisodeSuccess | ResolveEpisodeFailure

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

async function callRemoteResolveByUrl(
  serviceBaseUrl: string,
  episodeUrl: string,
): Promise<{
  result: { videoUrl: string; episodePageUrl: string | null } | null
  error: string | null
}> {
  const base = serviceBaseUrl.replace(/\/+$/, '')

  try {
    const response = await fetch(`${base}/api/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: episodeUrl }),
      signal: AbortSignal.timeout(120000),
    })

    if (!response.ok) {
      const text = await response.text()
      return { result: null, error: text?.slice(0, 200) || `HTTP ${response.status}` }
    }

    const payload = await response.json() as RemoteResolveResponse
    if (!payload.success || !payload.video_url) {
      return { result: null, error: payload.error || 'No video URL returned' }
    }

    return {
      result: {
        videoUrl: payload.video_url,
        episodePageUrl: payload.episode_page_url || episodeUrl,
      },
      error: null,
    }
  } catch (error: any) {
    return { result: null, error: error?.message || 'Request failed' }
  }
}

async function callRemoteResolveByName(
  serviceBaseUrl: string,
  animeNames: string[],
  episodeNumber: number,
): Promise<{
  result: { videoUrl: string; episodePageUrl: string | null; matchedAnimeName: string } | null
  attempts: Array<{ animeName: string; ok: boolean; error?: string | null }>
}> {
  const base = serviceBaseUrl.replace(/\/+$/, '')
  const attempts: Array<{ animeName: string; ok: boolean; error?: string | null }> = []

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
        signal: AbortSignal.timeout(120000),
      })

      if (!response.ok) {
        const text = await response.text()
        attempts.push({ animeName: trimmed, ok: false, error: text?.slice(0, 160) || `HTTP ${response.status}` })
        continue
      }

      const payload = await response.json() as RemoteResolveResponse
      if (payload.success && payload.video_url) {
        attempts.push({ animeName: trimmed, ok: true })
        return {
          result: {
            videoUrl: payload.video_url,
            episodePageUrl: payload.episode_page_url || null,
            matchedAnimeName: trimmed,
          },
          attempts,
        }
      }

      attempts.push({ animeName: trimmed, ok: false, error: payload.error || 'No video URL returned' })
    } catch (error: any) {
      attempts.push({ animeName: trimmed, ok: false, error: error?.message || 'Request failed' })
    }
  }

  return { result: null, attempts }
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

function slugifyAnimeTitle(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/\s*\(tv\)\s*/gi, ' ')
    .replace(/\s*season\s*\d+/gi, ' ')
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
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
  const candidates = extractDirectCandidatesFromText(text)
  const best = pickBestDirectCandidate(candidates)
  return best?.url || null
}

type DirectCandidate = {
  url: string
  resolution: number
}

function extractDirectCandidatesFromText(text: string): DirectCandidate[] {
  const patterns = [
    /https?:\/\/[^\s"'<>]*files\.vid3rb\.com[^\s"'<>]*\.mp4[^\s"'<>]*/gi,
    /https?:\/\/video\.vid3rb\.com\/video\/[a-f0-9-]{36}(?:\?[^\s"'<>]*)?/gi,
  ]

  const candidates: DirectCandidate[] = []
  for (const pattern of patterns) {
    const matches = text.match(pattern) || []
    for (const raw of matches) {
      const normalized = normalizeDirectUrl(raw)
      if (isDirectLikeUrl(normalized)) {
        candidates.push({ url: normalized, resolution: getUrlResolution(normalized) })
      }
    }
  }

  return rankDirectCandidates(candidates)
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

function pickBestDirectUrl(urls: string[]): string | null {
  return pickBestDirectCandidate(urls.map((url) => ({
    url,
    resolution: getUrlResolution(url),
  })))?.url || null
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

function isScrapedVideoFresh(scrapedAt: unknown, maxAgeMs = SCRAPE_CACHE_TTL_MS): boolean {
  if (typeof scrapedAt !== 'string' || !scrapedAt) return false
  const parsed = Date.parse(scrapedAt)
  if (!Number.isFinite(parsed)) return false
  return Date.now() - parsed < maxAgeMs
}

function rankDirectCandidates(candidates: DirectCandidate[]): DirectCandidate[] {
  const byUrl = new Map<string, number>()

  for (const candidate of candidates) {
    const normalized = normalizeDirectUrl(candidate.url)
    if (!isDirectLikeUrl(normalized)) continue
    const resolution = Math.max(candidate.resolution || 0, getUrlResolution(normalized))
    byUrl.set(normalized, Math.max(byUrl.get(normalized) || 0, resolution))
  }

  return Array.from(byUrl.entries())
    .map(([url, resolution]) => ({ url, resolution }))
    .sort((a, b) => {
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
}

function pickBestDirectCandidate(candidates: DirectCandidate[]): DirectCandidate | null {
  const ranked = rankDirectCandidates(candidates)
  return ranked[0] || null
}

function isPreferredResolution(url: string, resolution = 0): boolean {
  if (isSignedVid3rbVideo(url)) {
    return true
  }
  const effectiveResolution = Math.max(resolution, getUrlResolution(url))
  return effectiveResolution >= MIN_PREFERRED_RESOLUTION
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

async function fetchPlayerVideoUrl(
  playerUrl: string,
  refererUrl: string,
  apifyToken: string,
): Promise<DirectCandidate[]> {
  const normalizedPlayerUrl = normalizeDirectUrl(playerUrl)

  const parsePlayerHtml = (html: string): DirectCandidate[] => {
    return rankDirectCandidates([
      ...parseDirectCandidatesFromPlayerHtml(html),
      ...extractDirectCandidatesFromText(html),
    ])
  }

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
      const directCandidates = parsePlayerHtml(html)
      if (directCandidates.length > 0) return directCandidates
    }
  } catch {
    // Fall back to Apify below.
  }

  return []
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
        .filter((source: any) => source?.src && !source?.premium)
        .sort((a: any, b: any) => Number(b?.res || 0) - Number(a?.res || 0))

      for (const source of valid) {
        candidates.push({
          url: normalizeDirectUrl(String(source.src)),
          resolution: Number(source?.res || 0),
        })
      }
    } catch {
      // Keep checking later matches.
    }
  }

  return rankDirectCandidates(candidates)
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

function hasUsableCachedVideoSources(videoSources: unknown): videoSources is VideoSource[] {
  if (!Array.isArray(videoSources) || videoSources.length === 0) return false

  return videoSources.some((source) => {
    const url = String(source?.url || '')
    const type = String(source?.type || '')
    if (type !== 'direct' && !isDirectLikeUrl(url)) return false
    return !isUrlExpiringSoon(url, 180)
  })
}

function buildEpisodeUrlFromKnownEpisodeUrl(episodeUrl: string | null, episodeNumber: number): string | null {
  const normalized = normalizeDirectUrl(String(episodeUrl || ''))
    .replace(/[#?].*$/, '')
    .replace(/\/+$/, '')

  if (!normalized) return null

  const slashFormat = normalized.match(/^https?:\/\/(?:www\.)?anime3rb\.com\/episode\/([a-z0-9-]+)\/\d+$/i)
  if (slashFormat?.[1]) {
    return `https://anime3rb.com/episode/${slashFormat[1]}/${episodeNumber}`
  }

  const dashFormat = normalized.match(/^https?:\/\/(?:www\.)?anime3rb\.com\/episode\/([a-z0-9-]+)-episode-\d+$/i)
  if (dashFormat?.[1]) {
    return `https://anime3rb.com/episode/${dashFormat[1]}-episode-${episodeNumber}`
  }

  return null
}

async function resolveAndCacheEpisode({
  animeTitle,
  animeTitleEnglish,
  episodeNumber,
  rawEpisodeNumber,
  malId,
  forceRefresh = false,
  directEpisodeUrl,
  directUrlOnly = false,
  remoteScraperUrl,
  supabase,
}: ResolveEpisodeParams): Promise<ResolveEpisodeResult> {
  let dbEpisodePageUrl: string | null = null
  const providedEpisodeUrl = directEpisodeUrl ? String(directEpisodeUrl) : null
  let resolutionStepUsed: ResolveStep = null
  let savedEpisodePageUrl: string | null = null

  if (!forceRefresh && supabase && malId) {
    const { data: cached } = await supabase
      .from('anime_episodes')
      .select('*')
      .eq('mal_id', malId)
      .eq('episode_number', episodeNumber)
      .eq('is_active', true)
      .single()

    if (cached?.video_sources && cached.video_sources.length > 0) {
      const cachedScrapedAt = typeof cached?.scraped_at === 'string'
        ? String(cached.scraped_at)
        : null
      const isFreshCache = isScrapedVideoFresh(cachedScrapedAt)

      if (isFreshCache && hasUsableCachedVideoSources(cached.video_sources)) {
        console.log(`[Cache] Found cached episode: mal_id=${malId}, ep=${episodeNumber}`)
        return {
          ok: true,
          cached: true,
          videoSources: cached.video_sources as VideoSource[],
          usedEpisodeUrl: typeof cached?.episode_page_url === 'string'
            ? String(cached.episode_page_url)
            : providedEpisodeUrl,
          savedEpisodePageUrl: null,
          resolutionStepUsed: null,
          debug: {
            method: 'cache',
            scraped_at: cachedScrapedAt,
            resolution_step_used: null,
            provided_episode_url: providedEpisodeUrl,
            db_episode_page_url: typeof cached?.episode_page_url === 'string'
              ? String(cached.episode_page_url)
              : null,
            saved_episode_page_url: null,
            raw_episode_number: rawEpisodeNumber ?? null,
            normalized_episode_number: episodeNumber,
            episode_candidates: [],
          },
        }
      }

      console.log(`[Cache] Cached direct is stale or expiring; re-scraping mal_id=${malId}, ep=${episodeNumber}`)
    }
  }

  if (!directUrlOnly && supabase && malId) {
    try {
      const { data: dbEpisode } = await supabase
        .from('anime_episodes')
        .select('episode_page_url')
        .eq('mal_id', malId)
        .eq('episode_number', episodeNumber)
        .eq('is_active', true)
        .maybeSingle()

      if (dbEpisode && typeof dbEpisode?.episode_page_url === 'string') {
        dbEpisodePageUrl = String(dbEpisode.episode_page_url)
      }
    } catch {
      // Keep DB link optional.
    }
  }

  let episodeCandidates: string[] = []
  let animeSlug: string | null = null
  let lastSearchDebug: Record<string, unknown> | null = null
  let searchFallbackUsed = false
  let searchSkippedAfterDirectCandidate = false
  const remoteAttempts: Array<{ episodeUrl?: string; animeName?: string; ok: boolean; error?: string | null }> = []
  const searchQueries = animeTitle ? buildSearchQueries(animeTitle, animeTitleEnglish) : []

  let videoSources: VideoSource[] = []
  let usedEpisodeUrl: string | null = null
  let lastEpisodeError: string | undefined
  let selectedCandidateCount = 0
  let selectedTopQuality: string | null = null
  let selectedTopHost: string | null = null
  const selectedReachability: Record<string, boolean | null> = {}

  const tryResolveFromCandidates = async (candidates: string[]): Promise<boolean> => {
    for (const episodeUrl of candidates) {
      console.log(`[Remote] Resolving episode page: ${episodeUrl}`)
      const remoteResponse = await callRemoteResolveByUrl(remoteScraperUrl, episodeUrl)
      remoteAttempts.push({
        episodeUrl,
        ok: Boolean(remoteResponse.result),
        error: remoteResponse.error,
      })

      if (!remoteResponse.result) {
        lastEpisodeError = remoteResponse.error || 'Remote scraper returned no video URL'
        continue
      }

      const resolvedChosenUrl = normalizeDirectUrl(remoteResponse.result.videoUrl)
      const chosenQuality = isSignedVid3rbVideo(resolvedChosenUrl) ? '1080p' : qualityFromUrl(resolvedChosenUrl)

      videoSources = [
        {
          url: resolvedChosenUrl,
          type: 'direct',
          server_name: 'anime3rb-direct',
          quality: isSignedVid3rbVideo(resolvedChosenUrl) ? '1080p' : chosenQuality,
        },
      ]
      usedEpisodeUrl = remoteResponse.result.episodePageUrl || episodeUrl
      selectedCandidateCount = 1
      selectedTopQuality = videoSources[0].quality
      selectedTopHost = hostFromUrl(videoSources[0]?.url || '')
      return true
    }
    return false
  }

  let resolved = false
  const providedCandidates = providedEpisodeUrl
    ? sanitizeEpisodeUrlCandidates([providedEpisodeUrl], episodeNumber)
    : []
  const dbCandidates = dbEpisodePageUrl
    ? sanitizeEpisodeUrlCandidates([dbEpisodePageUrl], episodeNumber)
    : []

  episodeCandidates = [...new Set([...providedCandidates, ...dbCandidates])]
  if (episodeCandidates.length > 0) {
    console.log('[Step 1] Candidate URLs (provided/db):', episodeCandidates)
    const slugMatch = episodeCandidates[0].match(/anime3rb\.com\/episode\/([^/?#]+)/)
    if (slugMatch) {
      animeSlug = slugMatch[1].replace(/-episode-\d+$/, '')
    }
    resolved = await tryResolveFromCandidates(episodeCandidates)
    if (resolved && usedEpisodeUrl) {
      resolutionStepUsed = providedCandidates.includes(usedEpisodeUrl) ? 'provided_link' : 'db_link'
    }
  }

  if (!resolved && episodeCandidates.length > 0) {
    searchSkippedAfterDirectCandidate = true
    console.log('[Step 2] Skipping search fallback because a direct episode candidate was already tried.')
  }

  if (!resolved && !directUrlOnly && animeTitle && episodeCandidates.length === 0) {
    searchFallbackUsed = true
    console.log('[Step 2] Building episode URL from MAL title...')

    const slugCandidates = [...new Set(
      searchQueries
        .map((query) => slugifyAnimeTitle(query))
        .filter(Boolean)
    )]

    episodeCandidates = sanitizeEpisodeUrlCandidates(
      slugCandidates.map((slug) => `https://anime3rb.com/episode/${slug}/${episodeNumber}`),
      episodeNumber,
    )

    if (episodeCandidates.length > 0) {
      animeSlug = slugCandidates[0] || null
      lastSearchDebug = {
        strategy: 'built_from_mal_title',
        slug_candidates: slugCandidates,
        episode_candidates: episodeCandidates,
      }
      resolved = await tryResolveFromCandidates(episodeCandidates)
      if (resolved) {
        resolutionStepUsed = 'search'
      }
    }

    if (!resolved) {
      console.log('[Step 2] Built MAL title URL failed, falling back to remote resolve-by-name...')

      const remoteByName = await callRemoteResolveByName(
        remoteScraperUrl,
        searchQueries,
        episodeNumber,
      )
      remoteAttempts.push(
        ...remoteByName.attempts.map((attempt) => ({
          animeName: attempt.animeName,
          ok: attempt.ok,
          error: attempt.error,
        }))
      )

      if (remoteByName.result) {
        const resolvedChosenUrl = normalizeDirectUrl(remoteByName.result.videoUrl)
        videoSources = [
          {
            url: resolvedChosenUrl,
            type: 'direct',
            server_name: 'anime3rb-remote',
            quality: isSignedVid3rbVideo(resolvedChosenUrl) ? '1080p' : qualityFromUrl(resolvedChosenUrl),
          },
        ]
        usedEpisodeUrl = remoteByName.result.episodePageUrl
        animeSlug = remoteByName.result.episodePageUrl?.match(/anime3rb\.com\/episode\/([^/?#]+)/)?.[1]?.replace(/-episode-\d+$/, '') || null
        selectedCandidateCount = 1
        selectedTopQuality = videoSources[0].quality
        selectedTopHost = hostFromUrl(resolvedChosenUrl)
        resolutionStepUsed = 'search'
        lastSearchDebug = {
          strategy: 'remote_resolve_by_name',
          matched_anime_name: remoteByName.result.matchedAnimeName,
          attempts: remoteByName.attempts,
        }
        resolved = true
      } else {
        lastEpisodeError = remoteByName.attempts[remoteByName.attempts.length - 1]?.error || 'Remote scraper could not find a video URL by name'
        lastSearchDebug = {
          strategy: 'remote_resolve_by_name',
          attempts: remoteByName.attempts,
        }
      }
    }
  }

  if (!resolved || videoSources.length === 0) {
    return {
      ok: false,
      error: 'No direct video URLs found on candidate episode pages',
      debug: {
        step: 'extract',
        resolution_step_used: resolutionStepUsed,
        provided_episode_url: providedEpisodeUrl,
        db_episode_page_url: dbEpisodePageUrl,
        saved_episode_page_url: savedEpisodePageUrl,
        animeSlug,
        search_fallback_used: searchFallbackUsed,
        search_skipped_after_direct_candidate: searchSkippedAfterDirectCandidate,
        remote_scraper_url: remoteScraperUrl,
        remote_attempts: remoteAttempts,
        lastSearchDebug,
        searchQueries,
        raw_episode_number: rawEpisodeNumber ?? null,
        normalized_episode_number: episodeNumber,
        episode_candidates: episodeCandidates,
        lastEpisodeError,
        candidate_count: selectedCandidateCount,
        top_candidate_quality: selectedTopQuality,
        top_candidate_url_host: selectedTopHost,
        reachability_by_candidate: selectedReachability,
      },
    }
  }

  console.log(`[Step 3] Found ${videoSources.length} video source(s)`)

  if (usedEpisodeUrl && resolutionStepUsed === 'search') {
    savedEpisodePageUrl = usedEpisodeUrl
  }

  if (supabase && malId) {
    const upsertPayload: Record<string, unknown> = {
      mal_id: malId,
      episode_number: episodeNumber,
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
      console.log(`[Cache] Cached episode: mal_id=${malId}, ep=${episodeNumber}`)
    }
  }

  return {
    ok: true,
    cached: false,
    videoSources,
    usedEpisodeUrl,
    savedEpisodePageUrl,
    resolutionStepUsed,
    debug: {
      method: 'remote',
      resolution_step_used: resolutionStepUsed,
      provided_episode_url: providedEpisodeUrl,
      db_episode_page_url: dbEpisodePageUrl,
      saved_episode_page_url: savedEpisodePageUrl,
      search_fallback_used: searchFallbackUsed,
      search_skipped_after_direct_candidate: searchSkippedAfterDirectCandidate,
      remote_scraper_url: remoteScraperUrl,
      remote_attempts: remoteAttempts,
      animeSlug,
      episodeUrl: usedEpisodeUrl,
      raw_episode_number: rawEpisodeNumber ?? null,
      normalized_episode_number: episodeNumber,
      episode_candidates: episodeCandidates,
      sourceCount: videoSources.length,
      candidate_count: selectedCandidateCount,
      top_candidate_quality: selectedTopQuality,
      top_candidate_url_host: selectedTopHost,
      reachability_by_candidate: selectedReachability,
    },
  }
}

function scheduleBackgroundTask(task: Promise<unknown>) {
  const wrappedTask = task.catch((error) => {
    console.error('[Prefetch] Background task failed:', error)
  })

  const edgeRuntime = (globalThis as typeof globalThis & {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void }
  }).EdgeRuntime

  if (edgeRuntime?.waitUntil) {
    edgeRuntime.waitUntil(wrappedTask)
    return
  }

  void wrappedTask
}

function getPrefetchEpisodeNumbers(currentEpisodeNumber: number, count = PREFETCH_EPISODE_COUNT): number[] {
  return Array.from({ length: count }, (_, index) => currentEpisodeNumber + index + 1)
}

async function prefetchUpcomingEpisodes(
  baseParams: Omit<ResolveEpisodeParams, 'episodeNumber' | 'rawEpisodeNumber' | 'directEpisodeUrl'>,
  currentEpisodeNumber: number,
  currentEpisodeUrl: string | null,
): Promise<number[]> {
  if (!baseParams.supabase || !baseParams.malId) return []
  if (!baseParams.animeTitle && !currentEpisodeUrl) return []

  const episodeNumbers = getPrefetchEpisodeNumbers(currentEpisodeNumber)
  if (episodeNumbers.length === 0) return []

  await Promise.allSettled(
    episodeNumbers.map(async (targetEpisodeNumber) => {
      const directCandidate = buildEpisodeUrlFromKnownEpisodeUrl(currentEpisodeUrl, targetEpisodeNumber)
      const result = await resolveAndCacheEpisode({
        ...baseParams,
        episodeNumber: targetEpisodeNumber,
        rawEpisodeNumber: targetEpisodeNumber,
        forceRefresh: false,
        directUrlOnly: Boolean(directCandidate),
        directEpisodeUrl: directCandidate,
      })

      if (result.ok) {
        console.log(`[Prefetch] Episode ${targetEpisodeNumber} cached (${result.cached ? 'cache-hit' : 'fresh'})`)
      } else {
        console.log(`[Prefetch] Episode ${targetEpisodeNumber} skipped: ${result.error}`)
      }
    })
  )

  return episodeNumbers
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

    if (!directEpisodeUrl && !animeTitle) {
      return jsonResponse({ error: 'animeTitle and episodeNumber are required' }, 400)
    }

    const remoteScraperUrl = Deno.env.get('PY_SCRAPER_URL') || DEFAULT_REMOTE_SCRAPER_URL
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : null

    const result = await resolveAndCacheEpisode({
      animeTitle,
      animeTitleEnglish,
      episodeNumber: normalizedEpisodeNumber,
      rawEpisodeNumber,
      malId,
      forceRefresh,
      directEpisodeUrl,
      remoteScraperUrl,
      supabase,
    })

    if (!result.ok) {
      return jsonResponse({
        error: result.error,
        debug: result.debug,
      })
    }

    const prefetchBaseUrl = result.usedEpisodeUrl || (directEpisodeUrl ? String(directEpisodeUrl) : null)
    const canPrefetch = Boolean(supabase && malId && (animeTitle || prefetchBaseUrl))
    const prefetchedEpisodeNumbers = canPrefetch ? getPrefetchEpisodeNumbers(normalizedEpisodeNumber) : []

    if (canPrefetch) {
      scheduleBackgroundTask(
        prefetchUpcomingEpisodes(
          {
            animeTitle,
            animeTitleEnglish,
            malId,
            forceRefresh: false,
            remoteScraperUrl,
            supabase,
          },
          normalizedEpisodeNumber,
          prefetchBaseUrl,
        )
      )
    }

    return jsonResponse({
      video_sources: result.videoSources,
      cached: result.cached,
      debug: {
        ...result.debug,
        prefetch_scheduled: canPrefetch,
        prefetched_episode_numbers: prefetchedEpisodeNumbers,
      },
    })
  } catch (error: any) {
    console.error('[Error]', error)
    return jsonResponse({ error: error.message || 'Unknown error' }, 500)
  }
})
