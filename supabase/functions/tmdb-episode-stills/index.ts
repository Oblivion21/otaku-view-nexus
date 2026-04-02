import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_FALLBACK_BASE_URL = 'https://image.tmdb.org/t/p/'
const DEFAULT_STILL_SIZE = 'w780'
const MAX_EPISODE_STILLS = 24

type TmdbMediaType = 'movie' | 'tv'

type EpisodeStillResponse = {
  still_path?: string | null
}

type TmdbConfigurationResponse = {
  images: {
    secure_base_url: string
    still_sizes: string[]
  }
}

type EpisodeStillPayload = {
  tmdbId?: unknown
  mediaType?: unknown
  seasonNumber?: unknown
  episodeNumbers?: unknown
}

let configurationPromise: Promise<TmdbConfigurationResponse['images']> | null = null
let missingTokenLogged = false

function jsonResponse(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function getTmdbReadAccessToken() {
  return Deno.env.get('TMDB_READ_ACCESS_TOKEN')?.trim() || ''
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

async function getTmdbConfiguration() {
  if (!configurationPromise) {
    configurationPromise = fetchTmdb<TmdbConfigurationResponse>('/configuration')
      .then((response) => response.images)
      .catch((error) => {
        configurationPromise = null
        throw error
      })
  }

  return configurationPromise
}

async function buildStillUrl(filePath: string | null | undefined) {
  if (!filePath) {
    return null
  }

  try {
    const config = await getTmdbConfiguration()
    const baseUrl = config.secure_base_url || TMDB_IMAGE_FALLBACK_BASE_URL
    return `${baseUrl}${DEFAULT_STILL_SIZE}${filePath}`
  } catch {
    return `${TMDB_IMAGE_FALLBACK_BASE_URL}${DEFAULT_STILL_SIZE}${filePath}`
  }
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
  ).slice(0, MAX_EPISODE_STILLS)
}

function isValidRequestBody(value: unknown): value is EpisodeStillPayload {
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

async function getEpisodeStill(tmdbId: number, seasonNumber: number, episodeNumber: number) {
  try {
    const response = await fetchTmdb<EpisodeStillResponse>(
      `/tv/${tmdbId}/season/${seasonNumber}/episode/${episodeNumber}`,
      { language: 'en-US' },
    )
    return {
      episodeNumber,
      stillUrl: await buildStillUrl(response.still_path),
    }
  } catch (error) {
    console.warn(
      `[tmdb-episode-stills] Failed to load still for tmdb=${tmdbId} season=${seasonNumber} episode=${episodeNumber}:`,
      error,
    )
    return {
      episodeNumber,
      stillUrl: null,
    }
  }
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
      if (!missingTokenLogged) {
        missingTokenLogged = true
        console.warn('TMDB_READ_ACCESS_TOKEN secret is missing. Returning null still results.')
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

    const entries = await Promise.all(
      episodeNumbers.map(async (episodeNumber) => {
        const result = await getEpisodeStill(tmdbId, seasonNumber, episodeNumber)
        return [String(episodeNumber), { stillUrl: result.stillUrl }] as const
      }),
    )

    return jsonResponse({
      results: Object.fromEntries(entries),
    })
  } catch (error) {
    console.error('tmdb-episode-stills request failed:', error)
    return jsonResponse({ error: 'Invalid request body', results: {} }, 400)
  }
})
