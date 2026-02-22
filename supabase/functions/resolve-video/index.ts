// Improved Supabase Edge Function with Cloudflare Bypass Techniques
// Deploy to: Supabase Dashboard → Edge Functions → resolve-video

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    // Get Browserless token
    const browserlessToken = Deno.env.get('BROWSERLESS_TOKEN')
    if (!browserlessToken) {
      return jsonResponse({ url: '', error: 'BROWSERLESS_TOKEN not configured' })
    }

    // Initialize Supabase client for cookie persistence
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null

    // Load saved cookies for this domain
    let savedCookies: any[] = []
    if (supabase) {
      const { data } = await supabase
        .from('cloudflare_cookies')
        .select('cookies')
        .eq('domain', parsedUrl.hostname)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (data?.cookies) {
        savedCookies = data.cookies
        console.log(`Loaded ${savedCookies.length} saved cookies for ${parsedUrl.hostname}`)
      }
    }

    // Puppeteer code with stealth techniques
    const puppeteerCode = `
export default async function({ page, context }) {
  const results = {
    found: [],
    iframes: [],
    cookies: [],
    success: false,
    error: null
  };

  try {
    // Restore saved cookies
    const savedCookies = ${JSON.stringify(savedCookies)};
    if (savedCookies.length > 0) {
      await context.addCookies(savedCookies);
      console.log('Restored cookies from previous session');
    }

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
      // Capture vid3rb URLs and player embeds
      if (url.includes('vid3rb.com') || url.includes('/player/') || url.includes('/embed/')) {
        results.found.push(url);
        console.log('Captured request:', url);
      }
      request.continue();
    });

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('vid3rb.com') || url.includes('/player/') || url.includes('/embed/')) {
        results.found.push(url);
        console.log('Captured response:', url);
      }
    });

    // Navigate with human-like behavior
    console.log('Navigating to:', ${JSON.stringify(url)});

    // Random delay before navigation (500-1500ms)
    await new Promise(r => setTimeout(r, Math.random() * 1000 + 500));

    await page.goto(${JSON.stringify(url)}, {
      waitUntil: 'networkidle2',
      timeout: 45000
    });

    // Wait for Cloudflare challenge to complete (if present)
    // Look for common Cloudflare elements
    const cfChallenge = await page.$('#challenge-running, .cf-browser-verification');
    if (cfChallenge) {
      console.log('Cloudflare challenge detected, waiting...');
      await page.waitForTimeout(8000);
    }

    // Random human-like delays and scrolling
    await page.waitForTimeout(Math.random() * 2000 + 2000);

    // Scroll down slowly like a human
    await page.evaluate(() => {
      window.scrollBy({
        top: Math.random() * 300 + 200,
        behavior: 'smooth'
      });
    });

    await page.waitForTimeout(Math.random() * 1000 + 1000);

    // Extract iframes
    results.iframes = await page.$$eval('iframe', (iframes) =>
      iframes.map(iframe => iframe.src || iframe.getAttribute('data-src') || '').filter(Boolean)
    );

    // Wait for any lazy-loaded content
    await page.waitForTimeout(3000);

    // Save cookies for next time
    const cookies = await context.cookies();
    results.cookies = cookies;

    results.success = true;
    console.log('Found URLs:', results.found.length);
    console.log('Found iframes:', results.iframes.length);

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

    // Save cookies for future use
    if (supabase && browserlessData.cookies?.length > 0) {
      await supabase.from('cloudflare_cookies').upsert({
        domain: parsedUrl.hostname,
        cookies: browserlessData.cookies,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'domain'
      })
      console.log(`Saved ${browserlessData.cookies.length} cookies for future use`)
    }

    // Extract video URL from captured URLs
    const allUrls = [...(browserlessData.found || []), ...(browserlessData.iframes || [])]
    const uniqueUrls = [...new Set(allUrls)].filter(Boolean)

    // Prioritize vid3rb.com URLs
    const vid3rbUrl = uniqueUrls.find((u: string) => u.includes('vid3rb.com'))
    const videoUrl = vid3rbUrl || uniqueUrls[0] || ''

    if (!videoUrl) {
      return jsonResponse({
        url: '',
        error: 'No video URL found',
        debug: {
          foundCount: browserlessData.found?.length || 0,
          iframeCount: browserlessData.iframes?.length || 0,
          allUrls: uniqueUrls.slice(0, 5) // Show first 5 for debugging
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
      }))
    })

  } catch (error: any) {
    console.error('Edge function error:', error)
    return jsonResponse({
      url: '',
      error: error.message || 'Unknown error'
    }, 500)
  }
})
