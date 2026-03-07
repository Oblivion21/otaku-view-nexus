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

// Extract player iframe URL from HTML (same as ani3rbscrap)
function extractPlayerIframeUrl(html: string): string | null {
  // Pattern 1: iframe src pointing to vid3rb player
  const iframePattern = /(?:src|href)\s*=\s*["']?(https?:\/\/video\.vid3rb\.com\/player\/[^"'>\s]+)/i
  let match = iframePattern.exec(html)
  if (match) {
    return match[1].replace(/&amp;/g, '&')
  }

  // Pattern 2: video_url in Livewire JSON (JSON-escaped slashes)
  const livewirePattern = /"video_url"\s*:\s*"(https?:\\?\/\\?\/video\.vid3rb\.com\\?\/player\\?\/[^"]+)"/i
  match = livewirePattern.exec(html)
  if (match) {
    return match[1].replace(/\\\//g, '/').replace(/&amp;/g, '&')
  }

  return null
}

// Parse video_sources from player page HTML (same as ani3rbscrap)
function parseVideoSourcesFromHtml(html: string): string | null {
  // Extract video_sources = [{src: "...", ...}, ...];
  const matches = html.matchAll(/video_sources\s*=\s*(\[.*?\]);/gs)
  const allMatches = Array.from(matches)

  // Process matches in reverse order (last match is usually the real one)
  for (const match of allMatches.reverse()) {
    const raw = match[1]
    if (!raw || raw.length <= 5) continue

    try {
      const sources = JSON.parse(raw)
      if (!Array.isArray(sources)) continue

      // Filter out premium sources, sort by resolution
      const valid = sources.filter((s: any) => s.src && !s.premium)
      valid.sort((a: any, b: any) => {
        const resA = parseInt(a.res || a.label || '0')
        const resB = parseInt(b.res || b.label || '0')
        return resB - resA
      })

      if (valid.length > 0) {
        const best = valid[0].src.replace(/\\\//g, '/')
        console.log(`[Video Sources] Found ${valid.length} source(s), best: ${valid[0].label || valid[0].res || '?'}`)
        return best
      }
    } catch (error: any) {
      console.log(`[Video Sources] Failed to parse JSON: ${error.message}`)
    }
  }

  return null
}

// Fetch player page and extract MP4 URL (Phase 2 - same as ani3rbscrap)
async function fetchPlayerAndExtract(playerUrl: string, refererUrl: string): Promise<string | null> {
  console.log(`[Phase 2] Fetching player page: ${playerUrl.slice(0, 80)}...`)

  try {
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

    // Try to parse video_sources first
    const videoUrl = parseVideoSourcesFromHtml(html)
    if (videoUrl) {
      return videoUrl
    }

    // Fallback: extract direct MP4 URLs
    const foundUrls = extractVideoUrls(html)
    const mp4Url = foundUrls.find(u => u.includes('files.vid3rb.com') && u.includes('.mp4'))
    if (mp4Url) {
      console.log(`[Phase 2] Found MP4 URL in player HTML`)
      return mp4Url
    }

    console.log(`[Phase 2] No video URL found in player page`)
    return null
  } catch (error: any) {
    console.error(`[Phase 2] Error fetching player page: ${error.message}`)
    return null
  }
}

// Extract video URLs from HTML content
function extractVideoUrls(html: string): string[] {
  const urls: string[] = []

  // Pattern 1: files.vid3rb.com MP4 URLs
  const mp4Pattern = /https:\/\/files\.vid3rb\.com\/[^\s"'<>]+/g
  const mp4Matches = html.match(mp4Pattern) || []
  urls.push(...mp4Matches)

  // Pattern 2: Any vid3rb.com URLs (player, embed, etc.)
  const vid3rbPattern = /https:\/\/[^/]*vid3rb\.com\/[^\s"'<>]+/g
  const vid3rbMatches = html.match(vid3rbPattern) || []
  urls.push(...vid3rbMatches)

  // Pattern 3: iframe src with vid3rb
  const iframePattern = /<iframe[^>]+src=["']([^"']+)["']/gi
  let match
  while ((match = iframePattern.exec(html)) !== null) {
    if (match[1].includes('vid3rb')) {
      urls.push(match[1])
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
            // Extract player iframe URL first (most reliable)
            const playerUrl = extractPlayerIframeUrl(html)

            if (playerUrl) {
              console.log(`[Phase 1] Found player iframe: ${playerUrl.slice(0, 80)}...`)

              // Phase 2: Fetch player page and extract MP4 URL
              const videoUrl = await fetchPlayerAndExtract(playerUrl, url)

              if (videoUrl) {
                return jsonResponse({
                  url: videoUrl,
                  urls: [{
                    url: videoUrl,
                    type: 'direct',
                    server_name: 'anime3rb',
                    quality: '1080p'
                  }],
                  debug: {
                    method: 'apify',
                    phase: '2-phase-extraction',
                    pageTitle,
                    playerUrl: playerUrl.slice(0, 100),
                  }
                })
              }

              console.log('[Phase 2] Failed to extract video from player page')
            }

            // Fallback: try to find direct MP4 URLs in episode page HTML
            const foundUrls = extractVideoUrls(html)
            const mp4Url = foundUrls.find(u => u.includes('files.vid3rb.com') && u.includes('.mp4'))

            if (mp4Url) {
              console.log('[Phase 1] Found direct MP4 URL in episode page')
              return jsonResponse({
                url: mp4Url,
                urls: foundUrls.map(u => ({
                  url: u,
                  type: 'direct',
                  server_name: 'anime3rb',
                  quality: '720p'
                })),
                debug: {
                  method: 'apify',
                  phase: 'direct-extraction',
                  pageTitle,
                  foundCount: foundUrls.length,
                }
              })
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

            // Prioritize direct MP4 files
            const mp4Url = foundUrls.find(u => u.includes('files.vid3rb.com') && u.includes('.mp4'))
            const vid3rbUrl = foundUrls.find(u => u.includes('vid3rb.com'))
            const videoUrl = mp4Url || vid3rbUrl || foundUrls[0] || ''

            if (videoUrl) {
              return jsonResponse({
                url: videoUrl,
                urls: foundUrls.map(u => ({
                  url: u,
                  type: 'embed',
                  server_name: 'anime3rb',
                  quality: '720p'
                })),
                debug: {
                  method: 'flaresolverr',
                  pageTitle,
                  foundCount: foundUrls.length,
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
    const uniqueUrls = [...new Set(allUrls)].filter(Boolean)

    // Prioritize direct MP4 files from files.vid3rb.com, then any vid3rb URL
    const mp4Url = uniqueUrls.find((u: string) => u.includes('files.vid3rb.com') && u.includes('.mp4'))
    const vid3rbUrl = uniqueUrls.find((u: string) => u.includes('vid3rb.com'))
    const videoUrl = mp4Url || vid3rbUrl || uniqueUrls[0] || ''

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
    return jsonResponse({
      url: videoUrl,
      urls: uniqueUrls.map((u: string) => ({
        url: u,
        type: 'embed',
        server_name: 'anime3rb',
        quality: '720p'
      })),
      debug: {
        method: 'browserless',
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
