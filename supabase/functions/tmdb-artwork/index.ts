import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TMDB_API_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_FALLBACK_BASE_URL = 'https://image.tmdb.org/t/p/'
const DEFAULT_BACKDROP_SIZE = 'original'
const DEFAULT_POSTER_SIZE = 'w780'

type TmdbMediaType = 'movie' | 'tv'
type TmdbMatchConfidence = 'high' | 'medium' | 'low'

type AnimeArtworkLookup = {
  mal_id: number
  title: string
  title_english: string | null
  title_japanese: string | null
  type: string | null
  year: number | null
  aired?: {
    from?: string | null
  } | null
}

type TmdbAnimeArtwork = {
  tmdbId: number
  mediaType: TmdbMediaType
  posterUrl: string | null
  backdropUrl: string | null
  matchedTitle: string | null
  seasonNumber: number | null
  seasonName: string | null
  matchConfidence: TmdbMatchConfidence
}

type TmdbConfigurationResponse = {
  images: {
    secure_base_url: string
    backdrop_sizes: string[]
    poster_sizes: string[]
  }
}

type TmdbSearchResponse = {
  results: TmdbSearchResult[]
}

type TmdbSearchResult = {
  id: number
  name?: string
  original_name?: string
  title?: string
  original_title?: string
  backdrop_path: string | null
  poster_path: string | null
  first_air_date?: string
  release_date?: string
  original_language: string
  popularity: number
}

type TmdbTvSeason = {
  season_number: number
  name: string
  air_date?: string | null
  episode_count?: number | null
}

type TmdbTvDetailsResponse = {
  seasons?: TmdbTvSeason[]
}

type TmdbMatchCandidate = {
  mediaType: TmdbMediaType
  result: TmdbSearchResult
  score: number
}

type TmdbSeasonContext = {
  seasonNumber: number | null
  seasonName: string | null
  matchConfidence: TmdbMatchConfidence
}

let configurationPromise: Promise<TmdbConfigurationResponse['images']> | null = null
const artworkCache = new Map<number, Promise<TmdbAnimeArtwork | null>>()
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

function normalizeTitle(value: string) {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’"`~!@#$%^&*()_+\-=[\]{};:/\\|,.<>?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function getAnimeCandidateTitles(anime: AnimeArtworkLookup) {
  return Array.from(
    new Set(
      [anime.title_english, anime.title, anime.title_japanese]
        .filter((title): title is string => Boolean(title?.trim()))
        .map((title) => title.trim()),
    ),
  )
}

function getAnimeYear(anime: AnimeArtworkLookup) {
  if (anime.year) {
    return anime.year
  }

  const yearValue = anime.aired?.from?.slice(0, 4)
  const parsedYear = yearValue ? Number(yearValue) : Number.NaN
  return Number.isFinite(parsedYear) ? parsedYear : null
}

function getTmdbMatchConfidence(score: number): TmdbMatchConfidence {
  if (score >= 120) return 'high'
  if (score >= 75) return 'medium'
  return 'low'
}

function getSearchOrder(anime: AnimeArtworkLookup): TmdbMediaType[] {
  if (anime.type === 'Movie') {
    return ['movie', 'tv']
  }

  return ['tv', 'movie']
}

function getResultTitles(result: TmdbSearchResult) {
  return [result.name, result.original_name, result.title, result.original_title].filter(
    (value): value is string => Boolean(value?.trim()),
  )
}

function getResultYear(result: TmdbSearchResult) {
  const date = result.first_air_date || result.release_date
  if (!date || date.length < 4) {
    return null
  }

  const parsedYear = Number(date.slice(0, 4))
  return Number.isFinite(parsedYear) ? parsedYear : null
}

function scoreSearchResult(
  anime: AnimeArtworkLookup,
  queryTitle: string,
  mediaType: TmdbMediaType,
  result: TmdbSearchResult,
) {
  const animeTitles = getAnimeCandidateTitles(anime).map(normalizeTitle)
  const normalizedQuery = normalizeTitle(queryTitle)
  const resultTitles = getResultTitles(result).map(normalizeTitle)
  const animeYear = getAnimeYear(anime)
  const resultYear = getResultYear(result)

  let score = 0

  if (resultTitles.some((title) => title === normalizedQuery)) {
    score += 70
  }

  if (resultTitles.some((title) => animeTitles.includes(title))) {
    score += 80
  }

  if (resultTitles.some((title) => title.includes(normalizedQuery) || normalizedQuery.includes(title))) {
    score += 20
  }

  if (result.original_language === 'ja') {
    score += 10
  }

  if (result.backdrop_path) {
    score += 15
  }

  if (result.poster_path) {
    score += 10
  }

  if (animeYear && resultYear) {
    const yearDiff = Math.abs(animeYear - resultYear)

    if (yearDiff === 0) {
      score += 25
    } else if (yearDiff === 1) {
      score += 12
    } else if (yearDiff === 2) {
      score += 6
    }
  }

  if (anime.type === 'Movie' && mediaType === 'movie') {
    score += 5
  }

  if (anime.type !== 'Movie' && mediaType === 'tv') {
    score += 5
  }

  score += Math.min(result.popularity / 100, 8)

  return score
}

async function searchTmdb(
  queryTitle: string,
  mediaType: TmdbMediaType,
  animeYear: number | null,
) {
  const params: Record<string, string | number | undefined> = {
    query: queryTitle,
    include_adult: 'false',
    language: 'en-US',
  }

  if (animeYear) {
    if (mediaType === 'movie') {
      params.year = animeYear
    } else {
      params.first_air_date_year = animeYear
    }
  }

  return fetchTmdb<TmdbSearchResponse>(`/search/${mediaType}`, params)
}

async function findBestTmdbMatch(anime: AnimeArtworkLookup) {
  const candidateTitles = getAnimeCandidateTitles(anime)
  const animeYear = getAnimeYear(anime)
  const searchOrder = getSearchOrder(anime)
  const candidates = new Map<string, TmdbMatchCandidate>()

  for (const mediaType of searchOrder) {
    for (const title of candidateTitles) {
      const searches = animeYear
        ? [searchTmdb(title, mediaType, animeYear), searchTmdb(title, mediaType, null)]
        : [searchTmdb(title, mediaType, null)]

      for (const searchPromise of searches) {
        const response = await searchPromise

        response.results.forEach((result) => {
          const score = scoreSearchResult(anime, title, mediaType, result)
          const cacheKey = `${mediaType}:${result.id}`
          const current = candidates.get(cacheKey)

          if (!current || score > current.score) {
            candidates.set(cacheKey, { mediaType, result, score })
          }
        })

        const exactMatch = Array.from(candidates.values()).find(({ score, result }) => {
          const normalizedTitles = getResultTitles(result).map(normalizeTitle)
          return score >= 120 && normalizedTitles.includes(normalizeTitle(title))
        })

        if (exactMatch) {
          return exactMatch
        }
      }
    }
  }

  const bestMatch = Array.from(candidates.values()).sort((a, b) => b.score - a.score)[0]
  return bestMatch && bestMatch.score >= 55 ? bestMatch : null
}

function extractYear(value?: string | null) {
  if (!value || value.length < 4) return null
  const parsedYear = Number(value.slice(0, 4))
  return Number.isFinite(parsedYear) ? parsedYear : null
}

function romanToInt(value: string) {
  const normalized = value.toUpperCase()
  const numerals: Record<string, number> = {
    I: 1,
    V: 5,
    X: 10,
    L: 50,
    C: 100,
  }

  let result = 0
  let previous = 0
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    const current = numerals[normalized[index]]
    if (!current) return null
    if (current < previous) {
      result -= current
    } else {
      result += current
      previous = current
    }
  }
  return result > 0 ? result : null
}

function extractSeasonHint(anime: AnimeArtworkLookup) {
  const titles = getAnimeCandidateTitles(anime)

  const patterns: RegExp[] = [
    /\b(\d+)(?:st|nd|rd|th)?\s+season\b/i,
    /\bseason\s+(\d+)\b/i,
    /\bpart\s+(\d+)\b/i,
    /\bcour\s+(\d+)\b/i,
  ]

  for (const title of titles) {
    for (const pattern of patterns) {
      const match = title.match(pattern)
      if (match?.[1]) {
        const parsed = Number(match[1])
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed
        }
      }
    }

    const romanMatch = title.match(/\bseason\s+(i{1,3}|iv|v|vi{0,3}|ix|x)\b/i)
    if (romanMatch?.[1]) {
      const parsedRoman = romanToInt(romanMatch[1])
      if (parsedRoman) return parsedRoman
    }
  }

  return null
}

function scoreSeasonCandidate(anime: AnimeArtworkLookup, season: TmdbTvSeason, seasonHint: number | null) {
  let score = 0
  const animeYear = getAnimeYear(anime)
  const seasonYear = extractYear(season.air_date)
  const seasonName = normalizeTitle(season.name || '')
  const animeTitles = getAnimeCandidateTitles(anime).map(normalizeTitle)
  const animeTokens = new Set(
    animeTitles.flatMap((title) => title.split(' ').filter((token) => token.length > 2)),
  )
  const seasonTokens = new Set(seasonName.split(' ').filter((token) => token.length > 2))

  if (season.season_number > 0) {
    score += 10
  }

  if (anime.type === 'Special' && season.season_number === 0) {
    score += 35
  } else if (season.season_number === 0) {
    score -= 35
  }

  if ((season.episode_count || 0) > 0) {
    score += 6
  }

  if (seasonHint) {
    if (season.season_number === seasonHint) {
      score += 90
    } else {
      score -= Math.min(Math.abs(season.season_number - seasonHint) * 18, 54)
    }
  }

  if (animeYear && seasonYear) {
    const yearDiff = Math.abs(animeYear - seasonYear)
    if (yearDiff === 0) {
      score += 30
    } else if (yearDiff === 1) {
      score += 18
    } else if (yearDiff === 2) {
      score += 8
    } else {
      score -= Math.min(yearDiff * 4, 20)
    }
  }

  if (animeTitles.some((title) => seasonName.includes(title) || title.includes(seasonName))) {
    score += 26
  }

  const tokenOverlap = Array.from(animeTokens).reduce(
    (count, token) => count + (seasonTokens.has(token) ? 1 : 0),
    0,
  )
  score += Math.min(tokenOverlap * 7, 28)

  if (!seasonHint && season.season_number === 1) {
    score += 8
  }

  return score
}

async function resolveTvSeasonContext(anime: AnimeArtworkLookup, tmdbId: number): Promise<TmdbSeasonContext> {
  try {
    const details = await fetchTmdb<TmdbTvDetailsResponse>(`/tv/${tmdbId}`, {
      language: 'en-US',
    })
    const seasons = Array.isArray(details.seasons) ? details.seasons : []
    const seasonHint = extractSeasonHint(anime)

    if (!seasons.length) {
      return {
        seasonNumber: 1,
        seasonName: 'Season 1',
        matchConfidence: 'low',
      }
    }

    const rankedSeasons = seasons
      .map((season) => ({
        season,
        score: scoreSeasonCandidate(anime, season, seasonHint),
      }))
      .sort((a, b) => b.score - a.score)

    const bestMatch = rankedSeasons[0]
    const fallbackSeason = seasons.find((season) => season.season_number === 1)

    if (!bestMatch || bestMatch.score < 35) {
      return {
        seasonNumber: fallbackSeason?.season_number ?? 1,
        seasonName: fallbackSeason?.name || 'Season 1',
        matchConfidence: 'low',
      }
    }

    const matchConfidence: TmdbMatchConfidence = bestMatch.score >= 95
      ? 'high'
      : bestMatch.score >= 60
        ? 'medium'
        : 'low'

    if (matchConfidence === 'low') {
      return {
        seasonNumber: fallbackSeason?.season_number ?? 1,
        seasonName: fallbackSeason?.name || 'Season 1',
        matchConfidence,
      }
    }

    return {
      seasonNumber: bestMatch.season.season_number,
      seasonName: bestMatch.season.name || `Season ${bestMatch.season.season_number}`,
      matchConfidence,
    }
  } catch (error) {
    console.error(`Failed to resolve TMDB season for anime ${anime.mal_id}:`, error)
    return {
      seasonNumber: 1,
      seasonName: 'Season 1',
      matchConfidence: 'low',
    }
  }
}

async function buildImageUrl(filePath: string | null, size: string) {
  if (!filePath) {
    return null
  }

  try {
    const config = await getTmdbConfiguration()
    const baseUrl = config.secure_base_url || TMDB_IMAGE_FALLBACK_BASE_URL
    return `${baseUrl}${size}${filePath}`
  } catch {
    return `${TMDB_IMAGE_FALLBACK_BASE_URL}${size}${filePath}`
  }
}

async function loadAnimeArtwork(anime: AnimeArtworkLookup): Promise<TmdbAnimeArtwork | null> {
  const readAccessToken = getTmdbReadAccessToken()
  if (!readAccessToken) {
    if (!missingTokenLogged) {
      missingTokenLogged = true
      console.warn('TMDB_READ_ACCESS_TOKEN secret is missing. Returning null artwork results.')
    }
    return null
  }

  try {
    const match = await findBestTmdbMatch(anime)
    if (!match) {
      return null
    }

    const seasonContext = match.mediaType === 'tv'
      ? await resolveTvSeasonContext(anime, match.result.id)
      : {
          seasonNumber: null,
          seasonName: null,
          matchConfidence: getTmdbMatchConfidence(match.score),
        }

    const [posterUrl, backdropUrl] = await Promise.all([
      buildImageUrl(match.result.poster_path, DEFAULT_POSTER_SIZE),
      buildImageUrl(match.result.backdrop_path, DEFAULT_BACKDROP_SIZE),
    ])

    return {
      tmdbId: match.result.id,
      mediaType: match.mediaType,
      posterUrl,
      backdropUrl,
      matchedTitle: getResultTitles(match.result)[0] || null,
      seasonNumber: seasonContext.seasonNumber,
      seasonName: seasonContext.seasonName,
      matchConfidence: seasonContext.matchConfidence,
    }
  } catch (error) {
    console.error(`Failed to load TMDB artwork for anime ${anime.mal_id}:`, error)
    return null
  }
}

function getAnimeArtwork(anime: AnimeArtworkLookup) {
  const cached = artworkCache.get(anime.mal_id)
  if (cached) {
    return cached
  }

  const request = loadAnimeArtwork(anime).catch((error) => {
    artworkCache.delete(anime.mal_id)
    console.error(`Unexpected TMDB artwork error for anime ${anime.mal_id}:`, error)
    return null
  })

  artworkCache.set(anime.mal_id, request)
  return request
}

function isAnimeArtworkLookup(value: unknown): value is AnimeArtworkLookup {
  if (!value || typeof value !== 'object') {
    return false
  }

  const entry = value as Record<string, unknown>
  if (typeof entry.mal_id !== 'number' || !Number.isFinite(entry.mal_id) || entry.mal_id <= 0) {
    return false
  }

  const isNullableString = (field: unknown) => field === null || field === undefined || typeof field === 'string'
  const isNullableNumber = (field: unknown) => field === null || field === undefined || typeof field === 'number'

  if (typeof entry.title !== 'string') {
    return false
  }

  if (!isNullableString(entry.title_english) || !isNullableString(entry.title_japanese) || !isNullableString(entry.type)) {
    return false
  }

  if (!isNullableNumber(entry.year)) {
    return false
  }

  if (entry.aired !== undefined && entry.aired !== null) {
    if (typeof entry.aired !== 'object') {
      return false
    }

    const aired = entry.aired as Record<string, unknown>
    if (!isNullableString(aired.from)) {
      return false
    }
  }

  return true
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const animeList = body?.animeList

    if (!Array.isArray(animeList) || !animeList.every(isAnimeArtworkLookup)) {
      return jsonResponse({
        error: 'animeList must be an array of anime artwork lookup objects',
      }, 400)
    }

    const uniqueAnime = Array.from(
      new Map(animeList.map((anime) => [anime.mal_id, anime])).values(),
    )

    const entries = await Promise.all(
      uniqueAnime.map(async (anime) => [String(anime.mal_id), await getAnimeArtwork(anime)] as const),
    )

    return jsonResponse({
      results: Object.fromEntries(entries),
    })
  } catch (error) {
    console.error('tmdb-artwork request failed:', error)
    return jsonResponse({ error: 'Invalid request body' }, 400)
  }
})
