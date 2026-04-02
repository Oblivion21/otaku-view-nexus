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

    const featuredValue = data?.value
    const featuredIds = normalizeFeaturedAnimeIds(featuredValue)
    if (featuredIds.length === 0) {
      return jsonResponse({ items: [] })
    }

    const featuredAnime = Array.isArray(featuredValue)
      ? featuredValue
          .map((entry) => pickFeaturedCarouselAnime(entry))
          .filter((anime): anime is NonNullable<ReturnType<typeof pickFeaturedCarouselAnime>> => Boolean(anime))
      : []

    const animeById = new Map(featuredAnime.map((anime) => [anime.mal_id, anime] as const))
    const missingIds = featuredIds.filter((featuredId) => !animeById.has(featuredId))

    if (missingIds.length > 0) {
      console.info(
        `[featured-carousel] Skipping featured IDs without Supabase anime payload: ${missingIds.join(', ')}`,
      )
    }

    const items = orderFeaturedCarouselItems(featuredIds, animeById)
    return jsonResponse({ items })
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Unknown error', items: [] }, 500)
  }
})
