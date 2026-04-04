import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const OMDB_API_URL = 'https://www.omdbapi.com/'

type TmdbMediaType = 'movie' | 'tv'

type EpisodeRatingsPayload = {
  tmdbId?: unknown
  mediaType?: unknown
  seasonNumber?: unknown
  episodeNumbers?: unknown
}

type TmdbExternalIdsResponse = {
  imdb_id?: string | null
}

type OmdbSeasonEpisode = {
  Episode?: string
  imdbRating?: string
}

type OmdbSeasonResponse = {
  Episodes?: OmdbSeasonEpisode[]
}

let missingTmdbTokenLogged = false
let missingOmdbKeyLogged = false
const imdbIdCache = new Map<number, Promise<string | null>>()
const seasonRatingsCache = new Map<string, Promise<Map<number, number | null>>>()

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getTmdbReadAccessToken() {
  return Deno.env.get('TMDB_READ_ACCESS_TOKEN')?.trim() || ''
}

function getOmdbApiKey() {
  return Deno.env.get('OMDB_API_KEY')?.trim() || ''
}

async function fetchTmdb<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const readAccessToken = getTmdbReadAccessToken()

  if (!readAccessToken) {
    throw new Error('Missing TMDB_READ_ACCESS_TOKEN')
  }

  const url = new URL(`${TMDB_API_URL}${path}`)
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${readAccessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`TMDB API error: ${response.status}`)
  }

  return response.json()
}

async function fetchOmdb(params: Record<string, string | number | undefined>) {
  const apiKey = getOmdbApiKey()

  if (!apiKey) {
    if (!missingOmdbKeyLogged) {
      missingOmdbKeyLogged = true
      console.warn('OMDB_API_KEY secret is missing. Returning null episode IMDb ratings.')
    }
    return null
  }

  const url = new URL(OMDB_API_URL)
  url.searchParams.set('apikey', apiKey)

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`OMDb API error: ${response.status}`)
  }

  const payload = await response.json() as Record<string, unknown>
  if (payload.Response === 'False') {
    return null
  }

  return payload as OmdbSeasonResponse
}

function parseEpisodeNumbers(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry > 0),
    ),
  )
}

function parseOmdbRating(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  if (!normalized || normalized === 'N/A') {
    return null
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function isValidRequestBody(value: unknown): value is EpisodeRatingsPayload {
  if (!value || typeof value !== 'object') {
    return false
  }

  const body = value as Record<string, unknown>
  const mediaType = body.mediaType

  return (
    typeof body.tmdbId === 'number' &&
    Number.isFinite(body.tmdbId) &&
    body.tmdbId > 0 &&
    (mediaType === 'tv' || mediaType === 'movie') &&
    (body.seasonNumber === null || body.seasonNumber === undefined || (typeof body.seasonNumber === 'number' && Number.isFinite(body.seasonNumber))) &&
    Array.isArray(body.episodeNumbers)
  )
}

async function getTmdbImdbId(tmdbId: number, mediaType: TmdbMediaType) {
  if (mediaType !== 'tv') {
    return null
  }

  const cached = imdbIdCache.get(tmdbId)
  if (cached) {
    return cached
  }

  const request = fetchTmdb<TmdbExternalIdsResponse>(`/${mediaType}/${tmdbId}/external_ids`)
    .then((response) => response.imdb_id?.trim() || null)
    .catch((error) => {
      imdbIdCache.delete(tmdbId)
      console.error(`Failed to load TMDB external ids for tv:${tmdbId}:`, error)
      return null
    })

  imdbIdCache.set(tmdbId, request)
  return request
}

async function getSeasonRatings(tmdbId: number, seasonNumber: number) {
  const cacheKey = `${tmdbId}:${seasonNumber}`
  const cached = seasonRatingsCache.get(cacheKey)
  if (cached) {
    return cached
  }

  const request = (async () => {
    const imdbId = await getTmdbImdbId(tmdbId, 'tv')
    if (!imdbId) {
      return new Map<number, number | null>()
    }

    const payload = await fetchOmdb({
      i: imdbId,
      Season: seasonNumber,
    })

    const episodes = Array.isArray(payload?.Episodes) ? payload.Episodes : []
    return new Map(
      episodes
        .map((episode) => {
          const episodeNumber = Number(episode.Episode)
          if (!Number.isInteger(episodeNumber) || episodeNumber <= 0) {
            return null
          }

          return [episodeNumber, parseOmdbRating(episode.imdbRating)] as const
        })
        .filter((entry): entry is readonly [number, number | null] => Boolean(entry)),
    )
  })().catch((error) => {
    seasonRatingsCache.delete(cacheKey)
    console.error(`Failed to load season IMDb ratings for ${cacheKey}:`, error)
    return new Map<number, number | null>()
  })

  seasonRatingsCache.set(cacheKey, request)
  return request
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    if (!isValidRequestBody(body)) {
      return jsonResponse({ error: 'Invalid request body', results: {} }, 400)
    }

    const readAccessToken = getTmdbReadAccessToken()
    if (!readAccessToken) {
      if (!missingTmdbTokenLogged) {
        missingTmdbTokenLogged = true
        console.warn('TMDB_READ_ACCESS_TOKEN secret is missing. Returning null episode IMDb ratings.')
      }
      return jsonResponse({ results: {} })
    }

    const tmdbId = Number(body.tmdbId)
    const mediaType = body.mediaType as TmdbMediaType
    const seasonNumber = typeof body.seasonNumber === 'number' ? body.seasonNumber : null
    const episodeNumbers = parseEpisodeNumbers(body.episodeNumbers)

    if (mediaType !== 'tv' || !seasonNumber || episodeNumbers.length === 0) {
      return jsonResponse({ results: {} })
    }

    const ratingMap = await getSeasonRatings(tmdbId, seasonNumber)
    const entries = episodeNumbers.map((episodeNumber) => [
      String(episodeNumber),
      { imdbRating: ratingMap.get(episodeNumber) ?? null },
    ] as const)

    return jsonResponse({
      results: Object.fromEntries(entries),
    })
  } catch (error) {
    console.error('tmdb-episode-ratings request failed:', error)
    return jsonResponse({ error: 'Invalid request body', results: {} }, 400)
  }
})
