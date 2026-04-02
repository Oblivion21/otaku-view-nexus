import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  FEATURED_CAROUSEL_CACHE_CONTROL,
  normalizeFeaturedAnimeIds,
  orderFeaturedCarouselItems,
  pickFeaturedCarouselAnime,
} from './shared.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const FEATURED_FETCH_RETRY_ATTEMPTS = 3
const FEATURED_FETCH_BASE_DELAY_MS = 1200

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': FEATURED_CAROUSEL_CACHE_CONTROL,
    },
  })
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000
  }

  const retryAt = Date.parse(value)
  if (!Number.isFinite(retryAt)) {
    return null
  }

  return Math.max(retryAt - Date.now(), 0)
}

async function fetchFeaturedAnimeByMalId(featuredId: number) {
  for (let attempt = 0; attempt < FEATURED_FETCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`https://api.jikan.moe/v4/anime/${featuredId}`, {
        headers: {
          Accept: 'application/json',
        },
      })

      if (response.ok) {
        const payload = await response.json() as { data?: unknown }
        return pickFeaturedCarouselAnime(payload.data)
      }

      const shouldRetry = response.status === 429 || response.status >= 500
      if (!shouldRetry || attempt === FEATURED_FETCH_RETRY_ATTEMPTS - 1) {
        console.warn(`[featured-carousel] Failed to fetch MAL ${featuredId}: HTTP ${response.status}`)
        return null
      }

      const retryDelayMs =
        parseRetryAfterMs(response.headers.get('retry-after'))
        ?? FEATURED_FETCH_BASE_DELAY_MS * (attempt + 1)
      await sleep(retryDelayMs)
    } catch (error) {
      if (attempt === FEATURED_FETCH_RETRY_ATTEMPTS - 1) {
        console.warn(`[featured-carousel] Failed to fetch MAL ${featuredId}:`, error)
        return null
      }

      await sleep(FEATURED_FETCH_BASE_DELAY_MS * (attempt + 1))
    }
  }

  return null
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        ...corsHeaders,
        'Cache-Control': FEATURED_CAROUSEL_CACHE_CONTROL,
      },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Supabase is not configured', items: [] }, 500)
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    const { data, error } = await supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'featured_anime_ids')
      .maybeSingle()

    if (error) {
      return jsonResponse({ error: error.message, items: [] }, 500)
    }

    const featuredIds = normalizeFeaturedAnimeIds(data?.value)
    if (featuredIds.length === 0) {
      return jsonResponse({ items: [] })
    }

    const animeEntries: Array<readonly [number, ReturnType<typeof pickFeaturedCarouselAnime>]> = []
    for (const featuredId of featuredIds) {
      const anime = await fetchFeaturedAnimeByMalId(featuredId)
      animeEntries.push([featuredId, anime] as const)
    }

    const items = orderFeaturedCarouselItems(featuredIds, new Map(animeEntries))
    return jsonResponse({ items })
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Unknown error', items: [] }, 500)
  }
})
