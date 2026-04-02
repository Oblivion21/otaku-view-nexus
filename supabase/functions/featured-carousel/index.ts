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

    const featuredIds = normalizeFeaturedAnimeIds(data?.value)
    if (featuredIds.length === 0) {
      return jsonResponse({ items: [] })
    }

    const animeEntries = await Promise.all(
      featuredIds.map(async (featuredId) => {
        try {
          const response = await fetch(`https://api.jikan.moe/v4/anime/${featuredId}`, {
            headers: {
              Accept: 'application/json',
            },
          })

          if (!response.ok) {
            return [featuredId, null] as const
          }

          const payload = await response.json() as { data?: unknown }
          return [featuredId, pickFeaturedCarouselAnime(payload.data)] as const
        } catch {
          return [featuredId, null] as const
        }
      }),
    )

    const items = orderFeaturedCarouselItems(featuredIds, new Map(animeEntries))
    return jsonResponse({ items })
  } catch (error: any) {
    return jsonResponse({ error: error?.message || 'Unknown error', items: [] }, 500)
  }
})
