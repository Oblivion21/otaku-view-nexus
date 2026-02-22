// Supabase Edge Function with FlareSolverr and Browserless Support
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

  return [...new Set(urls)].filter(Boolean)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    if (!url) return jsonResponse({ url: '', error: 'no url provided' })

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

    // Try FlareSolverr first (better Cloudflare bypass)
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
      return jsonResponse({ url: '', error: 'No scraping service configured (FLARESOLVERR_URL or BROWSERLESS_TOKEN required)' })
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
