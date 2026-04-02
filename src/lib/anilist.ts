// AniList GraphQL API client for fetching anime metadata and artwork

const ANILIST_API = 'https://graphql.anilist.co'

export interface AniListMedia {
  id: number
  idMal: number
  format: string | null
  title: {
    romaji: string
    english: string | null
    native: string
  }
  bannerImage: string | null
  coverImage: {
    extraLarge: string
    large: string
    color: string | null
  }
}

const mediaCache = new Map<number, Promise<AniListMedia | null>>()

function normalizeMalIds(malIds: number[]): number[] {
  return [...new Set(malIds.filter((malId) => Number.isInteger(malId) && malId > 0))]
}

// Fetch media data from AniList by MAL ID
export async function fetchAniListByMAL(malId: number): Promise<AniListMedia | null> {
  const query = `
    query ($malId: Int) {
      Media(idMal: $malId, type: ANIME) {
        id
        idMal
        format
        title {
          romaji
          english
          native
        }
        bannerImage
        coverImage {
          extraLarge
          large
          color
        }
      }
    }
  `

  try {
    const response = await fetch(ANILIST_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: { malId }
      })
    })

    const data = await response.json()

    if (data.errors) {
      console.error('AniList API error:', data.errors)
      return null
    }

    return data.data?.Media || null
  } catch (error) {
    console.error('Failed to fetch from AniList:', error)
    return null
  }
}

// Fetch multiple anime by MAL IDs
export async function fetchMultipleAniListByMAL(malIds: number[]): Promise<Map<number, AniListMedia>> {
  const results = new Map<number, AniListMedia>()
  const uniqueMalIds = normalizeMalIds(malIds)
  const mediaResults = await Promise.allSettled(
    uniqueMalIds.map((malId) => fetchAniListByMAL(malId))
  )

  for (let i = 0; i < uniqueMalIds.length; i++) {
    const malId = uniqueMalIds[i]
    const result = mediaResults[i]
    if (result.status === 'fulfilled' && result.value) {
      results.set(malId, result.value)
    }
  }

  return results
}

export async function getMultipleAnimeAniListMedia(malIds: number[]): Promise<Map<number, AniListMedia>> {
  const uniqueMalIds = normalizeMalIds(malIds)
  const uncachedMalIds = uniqueMalIds.filter((malId) => !mediaCache.has(malId))

  if (uncachedMalIds.length > 0) {
    const batchRequest = fetchMultipleAniListByMAL(uncachedMalIds)
      .then((results) => {
        uncachedMalIds.forEach((malId) => {
          const media = results.get(malId) ?? null
          mediaCache.set(malId, Promise.resolve(media))
        })
        return results
      })
      .catch((error) => {
        console.error('Failed to fetch AniList media:', error)
        uncachedMalIds.forEach((malId) => {
          mediaCache.set(malId, Promise.resolve(null))
        })
        return new Map<number, AniListMedia>()
      })

    uncachedMalIds.forEach((malId) => {
      const pendingMedia = batchRequest.then((results) => results.get(malId) ?? null)
      mediaCache.set(malId, pendingMedia)
    })
  }

  const resolvedEntries = await Promise.all(
    uniqueMalIds.map(async (malId) => {
      const media = await mediaCache.get(malId)
      return [malId, media ?? null] as const
    }),
  )

  return new Map(
    resolvedEntries.filter((entry): entry is readonly [number, AniListMedia] => Boolean(entry[1])),
  )
}

export async function getAnimeAniListMedia(malId: number | null | undefined): Promise<AniListMedia | null> {
  if (!malId) {
    return null
  }

  const mediaMap = await getMultipleAnimeAniListMedia([malId])
  return mediaMap.get(malId) ?? null
}

// Get the best image for carousel banner
export function getBestBannerImage(media: AniListMedia | null, jikanImageUrl?: string): string {
  if (!media) {
    return jikanImageUrl || ''
  }

  // Prefer AniList banner image (1900x400) for wide carousel
  if (media.bannerImage) {
    return media.bannerImage
  }

  // Fallback to extra large cover image
  if (media.coverImage.extraLarge) {
    return media.coverImage.extraLarge
  }

  // Last fallback to Jikan image
  return jikanImageUrl || media.coverImage.large || ''
}
