// Supabase Edge Function with Apify, FlareSolverr and Browserless Support
// Deploy to: Supabase Dashboard → Edge Functions → resolve-video

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

type DirectCandidate = {
  url: string
  resolution: number
}

function normalizeDirectUrl(url: string): string {
  return String(url || '').replace(/\\\//g, '/').replace(/&amp;/g, '&').trim()
}

function isSignedVid3rbVideo(url: string): boolean {
  return /video\.vid3rb\.com\/video\//i.test(url) && /(?:\?|&)token=/i.test(url)
}

function isDirectLikeUrl(url: string): boolean {
  return /\.mp4(?:$|[?#])/i.test(url) || isSignedVid3rbVideo(url)
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
  const fields = [source?.res, source?.label, source?.quality, source?.name, source?.src, source?.file, source?.url]
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

function rankDirectCandidates(candidates: DirectCandidate[]): DirectCandidate[] {
  const byUrl = new Map<string, number>()
  for (const candidate of candidates) {
    const normalized = normalizeDirectUrl(candidate.url)
    if (!isDirectLikeUrl(normalized)) continue
    byUrl.set(normalized, Math.max(byUrl.get(normalized) || 0, Math.max(candidate.resolution || 0, getUrlResolution(normalized))))
  }

  const ranked = Array.from(byUrl.entries()).map(([url, resolution]) => ({ url, resolution }))
  ranked.sort((a, b) => {
    const explicit1080A = /(?:^|\/)1080p(?:\.mp4|[/?#]|$)/i.test(a.url) ? 1 : 0
    const explicit1080B = /(?:^|\/)1080p(?:\.mp4|[/?#]|$)/i.test(b.url) ? 1 : 0
    if (explicit1080A !== explicit1080B) return explicit1080B - explicit1080A

    const resDiff = b.resolution - a.resolution
    if (resDiff !== 0) return resDiff

    const aSigned = isSignedVid3rbVideo(a.url) ? 1 : 0
    const bSigned = isSignedVid3rbVideo(b.url) ? 1 : 0
    if (aSigned !== bSigned) return bSigned - aSigned

    const aMp4 = /\.mp4(?:$|[?#])/i.test(a.url) ? 1 : 0
    const bMp4 = /\.mp4(?:$|[?#])/i.test(b.url) ? 1 : 0
    if (aMp4 !== bMp4) return bMp4 - aMp4
    return a.url.length - b.url.length
  })

  return ranked
}

function pickPreferredCandidate(candidates: DirectCandidate[]): DirectCandidate | null {
  const ranked = rankDirectCandidates(candidates)
  if (!ranked.length) return null
  const explicit1080 = ranked.find((c) => /(?:^|\/)1080p(?:\.mp4|[/?#]|$)/i.test(c.url))
  if (explicit1080) return explicit1080
  const res1080 = ranked.find((c) => Math.max(c.resolution || 0, getUrlResolution(c.url)) >= 1080)
  return res1080 || ranked[0]
}

function qualityFromUrl(url: string): string {
  const res = getUrlResolution(url)
  return res > 0 ? `${res}p` : 'auto'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function resolveSignedVideoToFinalUrl(url: string): Promise<string> {
  const normalized = normalizeDirectUrl(url)
  if (!isSignedVid3rbVideo(normalized)) return normalized

  try {
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
    if (/\.mp4(?:[?#]|$)/i.test(effective)) return effective
  } catch {
    // keep original
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
      for (const item of value) walk(item, inheritedResolution, depth + 1)
      return
    }
    if (!value || typeof value !== 'object') return

    const obj = value as Record<string, unknown>
    if (obj.premium === true) return
    const ownResolution = Math.max(inheritedResolution, getSourceResolution(obj))
    for (const key of ['src', 'url', 'video_url', 'file', 'download']) {
      if (typeof obj[key] === 'string') walk(obj[key], ownResolution, depth + 1)
    }
    for (const nested of Object.values(obj)) walk(nested, ownResolution, depth + 1)
  }

  walk(payload, 0, 0)
  return rankDirectCandidates(out)
}

function directCandidatesFromUrls(urls: string[]): DirectCandidate[] {
  return rankDirectCandidates(
    urls.map((url) => {
      const normalized = normalizeDirectUrl(url)
      return { url: normalized, resolution: getUrlResolution(normalized) }
    })
  )
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
      return { html: '', error: 'No HTML content in Apify response' }
    }

    console.log(`[Apify] Got HTML, length: ${html.length}`)
    return { html }
  } catch (error: any) {
    console.error('[Apify] Error:', error.message)
    return { html: '', error: error.message }
  }
}

// Decode common HTML entities
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// Find the first vid3rb player URL in plain (decoded) text
function findVid3rbPlayerUrl(text: string): string | null {
  const m = /https?:\/\/video\.vid3rb\.com\/player\/[a-f0-9-]{36}[^\s"'<>]*/.exec(text)
  if (m) return m[0].replace(/\\\//g, '/').replace(/&amp;/g, '&')
  return null
}

// Recursively search a parsed JSON object for vid3rb player URLs
function searchJsonForPlayerUrl(obj: unknown, depth = 0): string | null {
  if (depth > 10) return null
  if (typeof obj === 'string') return findVid3rbPlayerUrl(obj)
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const v of Object.values(obj as Record<string, unknown>)) {
      const result = searchJsonForPlayerUrl(v, depth + 1)
      if (result) return result
    }
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const result = searchJsonForPlayerUrl(item, depth + 1)
      if (result) return result
    }
  }
  return null
}

// Parse Livewire wire:snapshot attributes and search for vid3rb player URL.
// Livewire v3 stores component state as HTML-entity-encoded JSON:
//   <div wire:snapshot="{&quot;data&quot;:{&quot;video_url&quot;:&quot;https:\/\/video.vid3rb.com\/player\/UUID&quot;}}">
function extractFromWireSnapshot(html: string): string | null {
  const snapshotPattern = /wire:snapshot\s*=\s*"((?:[^"\\]|\\.)*)"|wire:initial-data\s*=\s*"((?:[^"\\]|\\.)*)"/g
  let m: RegExpExecArray | null
  while ((m = snapshotPattern.exec(html)) !== null) {
    const raw = m[1] || m[2]
    if (!raw || !raw.includes('vid3rb')) continue

    const decoded = decodeHtmlEntities(raw)

    // Quick check: find URL directly in decoded text
    const url = findVid3rbPlayerUrl(decoded)
    if (url) return url

    // Full JSON parse as fallback
    try {
      const data = JSON.parse(decoded)
      const found = searchJsonForPlayerUrl(data)
      if (found) return found
    } catch {
      // continue to next snapshot
    }
  }
  return null
}

// Extract player iframe URL from HTML (same as ani3rbscrap)
function extractPlayerIframeUrl(html: string): string | null {
  // 1. iframe/link src, href, or data-* attributes pointing to vid3rb player
  const iframePattern = /(?:src|href|data-src|data-url|data-iframe)\s*=\s*["']?(https?:\/\/video\.vid3rb\.com\/player\/[^"'>\s]+)/i
  let match = iframePattern.exec(html)
  if (match) {
    return match[1].replace(/&amp;/g, '&')
  }

  // 2. Livewire wire:snapshot (HTML-entity-encoded JSON) — most likely location
  const wireUrl = extractFromWireSnapshot(html)
  if (wireUrl) return wireUrl

  // 3. video_url in Livewire JSON with literal quotes + JSON-escaped slashes
  const livewirePattern = /"video_url"\s*:\s*"(https?:\\?\/\\?\/video\.vid3rb\.com\\?\/player\\?\/[^"]+)"/i
  match = livewirePattern.exec(html)
  if (match) {
    return match[1].replace(/\\\//g, '/').replace(/&amp;/g, '&')
  }

  // 4. JavaScript object literals or variable assignments
  const jsPattern = /(?:url|src|href|iframe|player|video_url|videoUrl)\s*[=:]\s*["'](https?:\/\/video\.vid3rb\.com\/player\/[^"']+)/i
  match = jsPattern.exec(html)
  if (match) {
    return match[1].replace(/&amp;/g, '&')
  }

  // 5. Catch-all — any occurrence of the player URL pattern (handles \/ and &amp;)
  const catchAllPattern = /https?:(?:\/\/|\\\/\\\/)video\.vid3rb\.com(?:\\\/|\/)player(?:\\\/|\/)([a-f0-9-]{36}(?:[?&][^\s"'<>\\]*)?)/i
  match = catchAllPattern.exec(html)
  if (match) {
    const raw = match[0]
    let url = raw.replace(/\\\//g, '/').replace(/&amp;/g, '&')
    if (!url.startsWith('https://')) {
      url = 'https://video.vid3rb.com/player/' + match[1].replace(/\\\//g, '/').replace(/&amp;/g, '&')
    }
    return url
  }

  return null
}

// Parse video_sources from player page HTML (same as ani3rbscrap)
function parseVideoSourceCandidatesFromHtml(html: string): DirectCandidate[] {
  const out: DirectCandidate[] = []
  const matches = Array.from(html.matchAll(/video_sources\s*=\s*(\[.*?\]);/gs))

  for (const match of matches.reverse()) {
    const raw = match[1]
    if (!raw || raw.length <= 5) continue

    try {
      const sources = JSON.parse(raw)
      if (!Array.isArray(sources)) continue

      for (const source of sources) {
        if (source?.premium) continue
        const resolution = getSourceResolution(source)
        for (const field of [source?.src, source?.url, source?.video_url, source?.file, source?.download]) {
          if (!field) continue
          const candidate = normalizeDirectUrl(String(field))
          if (!isDirectLikeUrl(candidate)) continue
          out.push({ url: candidate, resolution: Math.max(resolution, getUrlResolution(candidate)) })
        }
      }
    } catch (error: any) {
      console.log(`[Video Sources] Failed to parse JSON: ${error.message}`)
    }
  }

  return rankDirectCandidates(out)
}

// Fetch player page and extract MP4 URL (Phase 2 - same as ani3rbscrap)
async function fetchPlayerAndExtract(playerUrl: string, refererUrl: string): Promise<string | null> {
  console.log(`[Phase 2] Fetching player page: ${playerUrl.slice(0, 80)}...`)

  try {
    // First, fetch the player page to get the HTML and cf_token
    const response = await fetch(playerUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': refererUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8',
      },
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      console.log(`[Phase 2] Player page returned ${response.status}`)
      return null
    }

    const html = await response.text()
    console.log(`[Phase 2] Player page HTML: ${html.length} chars`)

    // PRIORITY 0: Extract cf_token and try /sources? API endpoint
    // Pattern: cf_token = "..." or "cf_token":"..." or cf_token: "..."
    const cfTokenPatterns = [
      /cf_token\s*[=:]\s*["']([^"']+)["']/i,
      /["']cf_token["']\s*:\s*["']([^"']+)["']/i,
      /window\.cf_token\s*=\s*["']([^"']+)["']/i,
    ]

    let cfToken: string | null = null
    for (const pattern of cfTokenPatterns) {
      const match = html.match(pattern)
      if (match && match[1]) {
        cfToken = match[1]
        console.log(`[Phase 2.0] Found cf_token: ${cfToken.slice(0, 20)}...`)
        break
      }
    }

    const candidates: DirectCandidate[] = []
    const playerUuid = playerUrl.match(/\/player\/([a-f0-9-]+)/)?.[1] || null
    const sourcesUrl = cfToken && playerUuid
      ? `https://video.vid3rb.com/player/${playerUuid}/sources?cf_token=${encodeURIComponent(cfToken)}`
      : null

    const collectFromSourcesApi = async (): Promise<DirectCandidate[]> => {
      if (!sourcesUrl) return []
      try {
        const sourcesResp = await fetch(sourcesUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': playerUrl,
            'Accept': 'application/json,*/*',
            'Origin': 'https://video.vid3rb.com',
          },
          signal: AbortSignal.timeout(15000),
        })
        console.log(`[Phase 2.0] Sources API returned status: ${sourcesResp.status}`)
        if (!sourcesResp.ok) return []
        const text = await sourcesResp.text()
        if (!text) return []
        try {
          const payload = JSON.parse(text)
          return collectDirectCandidatesFromPayload(payload)
        } catch {
          return []
        }
      } catch {
        return []
      }
    }

    if (sourcesUrl) {
      console.log(`[Phase 2.0] Trying sources API with cf_token: ${sourcesUrl.slice(0, 120)}...`)
      candidates.push(...(await collectFromSourcesApi()))
    } else {
      console.log(`[Phase 2.0] No cf_token or player UUID found in player HTML`)
    }

    const fromVideoSources = parseVideoSourceCandidatesFromHtml(html)
    candidates.push(...fromVideoSources)

    const foundUrls = extractVideoUrls(html)
    candidates.push(...directCandidatesFromUrls(foundUrls))

    let ranked = rankDirectCandidates(candidates)
    let chosen = pickPreferredCandidate(ranked)

    // Give sources endpoint extra time to surface 1080, same behavior as scraper flow.
    const has1080 = (items: DirectCandidate[]) => items.some((item) => {
      const res = Math.max(item.resolution || 0, getUrlResolution(item.url))
      return res >= 1080 || /(?:^|\/)1080p(?:\.mp4|[/?#]|$)/i.test(item.url)
    })

    if (sourcesUrl && !has1080(ranked)) {
      for (let attempt = 1; attempt <= 4; attempt++) {
        await sleep(1500)
        const retried = await collectFromSourcesApi()
        if (retried.length === 0) continue
        ranked = rankDirectCandidates([...ranked, ...retried])
        chosen = pickPreferredCandidate(ranked)
        if (has1080(ranked)) break
      }
    }

    if (!chosen) {
      console.log(`[Phase 2] No video URL found in player page. Found ${foundUrls.length} URLs total`)
      if (foundUrls.length > 0) console.log(`[Phase 2] Sample URLs:`, foundUrls.slice(0, 3))
      return null
    }

    const resolvedChosenUrl = await resolveSignedVideoToFinalUrl(chosen.url)
    console.log(`[Phase 2] Selected URL (${qualityFromUrl(resolvedChosenUrl)}): ${resolvedChosenUrl.slice(0, 140)}...`)
    return resolvedChosenUrl
  } catch (error: any) {
    console.error(`[Phase 2] Error fetching player page: ${error.message}`)
    return null
  }
}

// Extract video URLs from HTML content
function extractVideoUrls(html: string): string[] {
  const urls: string[] = []
  const normalize = (raw: string) => normalizeDirectUrl(raw)

  // Pattern 1: video.vid3rb.com/video/xxx?speed=...&token=... (primary video URL)
  const videoPattern = /https:\/\/video\.vid3rb\.com\/video\/[a-f0-9-]+\?[^\s"'<>]+/g
  const videoMatches = html.match(videoPattern) || []
  urls.push(...videoMatches.map(normalize))

  // Pattern 2: files*.vid3rb.com MP4 URLs
  const mp4Pattern = /https:\/\/files(?:-\d+)?\.vid3rb\.com\/[^\s"'<>]+\.mp4[^\s"'<>]*/g
  const mp4Matches = html.match(mp4Pattern) || []
  urls.push(...mp4Matches.map(normalize))

  // Pattern 3: Any vid3rb.com URLs (player, embed, etc.)
  const vid3rbPattern = /https:\/\/[^/]*vid3rb\.com\/[^\s"'<>]+/g
  const vid3rbMatches = html.match(vid3rbPattern) || []
  urls.push(...vid3rbMatches.map(normalize))

  // Pattern 4: iframe src with vid3rb
  const iframePattern = /<iframe[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = iframePattern.exec(html)) !== null) {
    if (match[1].includes('vid3rb')) {
      urls.push(normalize(match[1]))
    }
  }

  // Filter out thumbnails, images, and other non-video files
  const filteredUrls = [...new Set(urls)].filter(url => {
    if (!url) return false
    // Exclude thumbnails and image files
    if (url.match(/thumbnail\.(jpg|jpeg|png|webp|gif)/i)) return false
    if (url.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i)) return false
    // Exclude subtitles
    if (url.match(/\.(vtt|srt|ass|ssa)$/i)) return false
    return true
  })

  return filteredUrls
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('[Request] Body received:', JSON.stringify(body))

    const { url } = body
    if (!url) {
      console.error('[Request] No URL in body. Body keys:', Object.keys(body))
      return jsonResponse({ url: '', error: 'no url provided', debug: { bodyKeys: Object.keys(body) } })
    }

    console.log('[Request] Processing URL:', url)

    // Validate URL is from allowed hosts
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return jsonResponse({ url: '', error: 'invalid url format' })
    }

    const allowedHosts = ['anime3rb.com', 'www.anime3rb.com', 'witanime.life', 'witanime.com']
    if (!allowedHosts.some(h => parsedUrl.hostname === h || parsedUrl.hostname.endsWith('.' + h))) {
      return jsonResponse({ url: '', error: 'blocked host: ' + parsedUrl.hostname })
    }

    // Try Apify first (most reliable Cloudflare bypass) - Two-phase approach like ani3rbscrap
    const apifyToken = Deno.env.get('APIFY_TOKEN')
    if (apifyToken) {
      console.log('[Apify] Starting two-phase video extraction...')
      try {
        // Phase 1: Bypass Cloudflare on the episode page
        console.log('[Phase 1] Fetching episode page via Apify...')
        const apifyResult = await fetchWithApify(url, apifyToken)

        if (!apifyResult.error && apifyResult.html) {
          const html = apifyResult.html
          const pageTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1] || ''

          console.log('[Phase 1] Success! Page title:', pageTitle)

          // Check if it's still a Cloudflare challenge
          const isCfChallenge = html.length < 20000 && (
            html.includes('Just a moment') ||
            html.includes('Checking your browser') ||
            html.includes('cf-browser-verification')
          )

          if (isCfChallenge) {
            console.log('[Phase 1] Still got Cloudflare challenge, skipping Apify')
          } else {
            // Debug: count wire:snapshot attributes and check for vid3rb
            const wireSnapshots = (html.match(/wire:snapshot/g) || []).length
            const hasVid3rb = html.includes('vid3rb')
            const hasPlayerPath = html.includes('vid3rb.com/player')
            console.log(`[Phase 1] wire:snapshot count: ${wireSnapshots}, hasVid3rb: ${hasVid3rb}, hasPlayerPath: ${hasPlayerPath}`)

            // Extract player iframe URL first (most reliable)
            const playerUrl = extractPlayerIframeUrl(html)

            if (playerUrl) {
              console.log(`[Phase 1] Found player iframe: ${playerUrl.slice(0, 80)}...`)

              // Phase 2: Fetch player page and extract MP4 URL
              const videoUrl = await fetchPlayerAndExtract(playerUrl, url)

              if (videoUrl) {
                const quality = qualityFromUrl(videoUrl)
                return jsonResponse({
                  url: videoUrl,
                  urls: [{
                    url: videoUrl,
                    type: 'direct',
                    server_name: 'anime3rb',
                    quality
                  }],
                  debug: {
                    method: 'apify',
                    phase: '2-phase-extraction',
                    pageTitle,
                    playerUrl: playerUrl.slice(0, 100),
                    selectedQuality: quality,
                  }
                })
              }

              console.log('[Phase 2] Failed to extract video from player page')
            }

            // Fallback: try to find direct MP4 URLs in episode page HTML
            const foundUrls = extractVideoUrls(html)
            const fallbackCandidates = directCandidatesFromUrls(foundUrls)
            const fallbackChosen = pickPreferredCandidate(fallbackCandidates)
            if (fallbackChosen) {
              const resolvedFallback = await resolveSignedVideoToFinalUrl(fallbackChosen.url)
              const quality = qualityFromUrl(resolvedFallback)
              console.log('[Phase 1] Found direct MP4 URL in episode page')
              return jsonResponse({
                url: resolvedFallback,
                urls: fallbackCandidates.map((c) => ({
                  url: c.url,
                  type: 'direct',
                  server_name: 'anime3rb',
                  quality: qualityFromUrl(c.url)
                })),
                debug: {
                  method: 'apify',
                  phase: 'direct-extraction',
                  pageTitle,
                  foundCount: foundUrls.length,
                  selectedQuality: quality,
                }
              })
            }

            // Debug: show first wire:snapshot value (first 300 chars) to diagnose
            const snapshotMatch = /wire:snapshot\s*=\s*"([^"]{20,})/.exec(html)
            if (snapshotMatch) {
              console.log('[Apify] First wire:snapshot sample:', snapshotMatch[1].slice(0, 300))
            } else {
              console.log('[Apify] No wire:snapshot found in HTML')
            }
            console.log('[Apify] No player iframe or video URL found in HTML')
          }
        }

        console.log('[Apify] Failed, falling back to FlareSolverr...')
      } catch (error: any) {
        console.error('[Apify] Error:', error.message)
      }
    }

    // Try FlareSolverr second (better Cloudflare bypass)
    const flaresolverrUrl = Deno.env.get('FLARESOLVERR_URL')
    if (flaresolverrUrl) {
      console.log('Using FlareSolverr to bypass Cloudflare...')
      try {
        const flareResponse = await fetch(`${flaresolverrUrl}/v1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cmd: 'request.get',
            url: url,
            maxTimeout: 60000,
          }),
        })

        if (flareResponse.ok) {
          const flareData = await flareResponse.json()

          if (flareData.status === 'ok' && flareData.solution) {
            const html = flareData.solution.response
            const pageTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1] || ''

            console.log('FlareSolverr success! Page title:', pageTitle)

            // Extract video URLs from HTML
            const foundUrls = extractVideoUrls(html)

            const ranked = directCandidatesFromUrls(foundUrls)
            const preferred = pickPreferredCandidate(ranked)
            const videoUrl = preferred ? await resolveSignedVideoToFinalUrl(preferred.url) : ''

            if (videoUrl) {
              const quality = qualityFromUrl(videoUrl)
              return jsonResponse({
                url: videoUrl,
                urls: ranked.map((c) => ({
                  url: c.url,
                  type: 'embed',
                  server_name: 'anime3rb',
                  quality: qualityFromUrl(c.url)
                })),
                debug: {
                  method: 'flaresolverr',
                  pageTitle,
                  foundCount: foundUrls.length,
                  selectedQuality: quality,
                }
              })
            }
          }
        }

        console.log('FlareSolverr failed, falling back to Browserless...')
      } catch (error: any) {
        console.error('FlareSolverr error:', error.message)
      }
    }

    // Fallback to Browserless
    const browserlessToken = Deno.env.get('BROWSERLESS_TOKEN')
    if (!browserlessToken) {
      return jsonResponse({ url: '', error: 'No scraping service configured (APIFY_TOKEN, FLARESOLVERR_URL, or BROWSERLESS_TOKEN required)' })
    }

    // Puppeteer code with stealth techniques
    const puppeteerCode = `
export default async function({ page }) {
  const results = {
    found: [],
    iframes: [],
    success: false,
    error: null,
    debug: {}
  };

  try {

    // Set realistic viewport and user agent
    await page.setViewport({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });

    // Override navigator properties to appear more human
    await page.evaluateOnNewDocument(() => {
      // Remove webdriver flag
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });

      // Add realistic plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      // Add realistic languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en', 'ar'],
      });
    });

    // Intercept network requests to capture video URLs
    await page.setRequestInterception(true);

    page.on('request', (request) => {
      const url = request.url();
      // Capture vid3rb URLs (especially files.vid3rb.com MP4s)
      if (url.includes('vid3rb.com') || url.includes('.mp4') || url.includes('/player/') || url.includes('/embed/')) {
        results.found.push(url);
        console.log('Captured request:', url);
      }
      request.continue();
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('vid3rb.com') || url.includes('.mp4') || url.includes('/player/') || url.includes('/embed/')) {
        results.found.push(url);
        console.log('Captured response:', url);
      }
    });

    // Navigate with human-like behavior
    console.log('Navigating to:', ${JSON.stringify(url)});

    // Random delay before navigation (500-1500ms)
    await new Promise(r => setTimeout(r, Math.random() * 1000 + 500));

    await page.goto(${JSON.stringify(url)}, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    // Wait for Cloudflare challenge to complete
    console.log('Page title after navigation:', await page.title());

    // If we see Cloudflare challenge, wait for it to complete
    let attempts = 0;
    while (attempts < 20) {
      const title = await page.title();
      if (title.includes('Just a moment') || title.includes('Checking')) {
        console.log('Cloudflare challenge detected, waiting... (attempt', attempts + 1, ')');
        await new Promise(r => setTimeout(r, 2000));
        attempts++;
      } else {
        console.log('Cloudflare challenge passed! Page title:', title);
        break;
      }
    }

    // Wait for network to settle after challenge
    await new Promise(r => setTimeout(r, 5000));

    // Wait longer for video player to load
    console.log('Waiting for video player to load...');
    await new Promise(r => setTimeout(r, 5000));

    // Scroll down slowly like a human
    await page.evaluate(() => {
      window.scrollBy({
        top: Math.random() * 300 + 200,
        behavior: 'smooth'
      });
    });

    await new Promise(r => setTimeout(r, Math.random() * 1000 + 1000));

    // Extract iframes
    results.iframes = await page.$$eval('iframe', (iframes) =>
      iframes.map(iframe => iframe.src || iframe.getAttribute('data-src') || '').filter(Boolean)
    );

    // Get page HTML for debugging
    const html = await page.content();
    const hasVideo = html.includes('vid3rb') || html.includes('player') || html.includes('video');
    const pageTitle = await page.title();

    // Populate debug info
    results.debug = {
      pageTitle: pageTitle,
      hasVideoKeywords: hasVideo,
      htmlLength: html.length,
      foundUrlsCount: results.found.length,
      iframeCount: results.iframes.length,
      allFoundUrls: results.found,
      allIframes: results.iframes,
      htmlSample: html.slice(0, 500)
    };

    console.log('Page title:', pageTitle);
    console.log('Page has video keywords:', hasVideo);
    console.log('HTML length:', html.length);
    console.log('Found URLs:', results.found.length);
    console.log('Found iframes:', results.iframes.length);

    results.success = true;

    return results;
  } catch (error) {
    results.error = error.message;
    return results;
  }
}
`

    // Call Browserless /function endpoint with stealth mode
    const browserlessResponse = await fetch(
      `https://chrome.browserless.io/function?token=${browserlessToken}&stealth&blockAds`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: puppeteerCode,
          context: {
            timeout: 60000,
            waitForTimeout: 5000,
          }
        }),
      }
    )

    if (!browserlessResponse.ok) {
      const errorText = await browserlessResponse.text()
      console.error('Browserless error:', errorText)
      return jsonResponse({
        url: '',
        error: `Browserless failed: ${browserlessResponse.status}`,
        details: errorText.slice(0, 200)
      })
    }

    const browserlessData = await browserlessResponse.json()

    if (browserlessData.error) {
      console.error('Puppeteer error:', browserlessData.error)
      return jsonResponse({
        url: '',
        error: 'Puppeteer failed: ' + browserlessData.error
      })
    }

    // Extract video URL from captured URLs
    const allUrls = [...(browserlessData.found || []), ...(browserlessData.iframes || [])]
    const uniqueUrls = [...new Set(allUrls)].map((u) => normalizeDirectUrl(String(u || ''))).filter(Boolean)
    const ranked = directCandidatesFromUrls(uniqueUrls)
    const preferred = pickPreferredCandidate(ranked)
    const videoUrl = preferred ? await resolveSignedVideoToFinalUrl(preferred.url) : ''

    if (!videoUrl) {
      return jsonResponse({
        url: '',
        error: 'No video URL found',
        debug: browserlessData.debug || {
          foundCount: browserlessData.found?.length || 0,
          iframeCount: browserlessData.iframes?.length || 0,
          allUrls: uniqueUrls.slice(0, 5)
        }
      })
    }

    // Return the resolved URL(s)
    const quality = qualityFromUrl(videoUrl)
    return jsonResponse({
      url: videoUrl,
      urls: ranked.map((c) => ({
        url: c.url,
        type: 'embed',
        server_name: 'anime3rb',
        quality: qualityFromUrl(c.url)
      })),
      debug: {
        method: 'browserless',
        selectedQuality: quality,
        ...(browserlessData.debug || {})
      }
    })

  } catch (error: any) {
    console.error('Edge function error:', error)
    return jsonResponse({
      url: '',
      error: error.message || 'Unknown error'
    }, 500)
  }
})
