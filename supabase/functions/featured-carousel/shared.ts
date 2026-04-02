export const MAX_FEATURED_CAROUSEL_ITEMS = 5
export const FEATURED_CAROUSEL_CACHE_CONTROL = 'public, max-age=300, s-maxage=300'

export type FeaturedCarouselGenre = {
  mal_id: number
  name: string
}

export type FeaturedCarouselAnime = {
  mal_id: number
  title: string
  title_japanese: string
  title_english: string | null
  images: {
    jpg: { image_url: string; large_image_url: string }
    webp: { image_url: string; large_image_url: string }
  }
  synopsis: string | null
  score: number | null
  episodes: number | null
  type: string | null
  year: number | null
  aired: {
    from: string | null
    to: string | null
    string: string
  }
  genres: FeaturedCarouselGenre[]
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function normalizeFeaturedAnimeIds(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return Array.from(
    new Set(
      value
        .map((entry) => Number(entry))
        .filter((entry) => Number.isInteger(entry) && entry > 0),
    ),
  ).slice(0, MAX_FEATURED_CAROUSEL_ITEMS)
}

export function pickFeaturedCarouselAnime(value: unknown): FeaturedCarouselAnime | null {
  if (!value || typeof value !== 'object') {
    return null
  }

  const anime = value as Record<string, any>
  const malId = Number(anime.mal_id)
  if (!Number.isInteger(malId) || malId <= 0) {
    return null
  }

  return {
    mal_id: malId,
    title: asString(anime.title),
    title_japanese: asString(anime.title_japanese),
    title_english: asNullableString(anime.title_english),
    images: {
      jpg: {
        image_url: asString(anime.images?.jpg?.image_url),
        large_image_url: asString(anime.images?.jpg?.large_image_url),
      },
      webp: {
        image_url: asString(anime.images?.webp?.image_url),
        large_image_url: asString(anime.images?.webp?.large_image_url),
      },
    },
    synopsis: asNullableString(anime.synopsis),
    score: asNullableNumber(anime.score),
    episodes: asNullableNumber(anime.episodes),
    type: asNullableString(anime.type),
    year: asNullableNumber(anime.year),
    aired: {
      from: asNullableString(anime.aired?.from),
      to: asNullableString(anime.aired?.to),
      string: asString(anime.aired?.string),
    },
    genres: Array.isArray(anime.genres)
      ? anime.genres
          .map((genre) => ({
            mal_id: Number(genre?.mal_id),
            name: asString(genre?.name),
          }))
          .filter((genre) => Number.isInteger(genre.mal_id) && genre.mal_id > 0 && genre.name)
      : [],
  }
}

export function orderFeaturedCarouselItems(
  featuredIds: number[],
  animeById: Map<number, FeaturedCarouselAnime | null>,
) {
  return featuredIds
    .map((id) => animeById.get(id) ?? null)
    .filter((anime): anime is FeaturedCarouselAnime => Boolean(anime))
}
