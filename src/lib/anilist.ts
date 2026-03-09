// AniList GraphQL API client for fetching high-quality banner images

const ANILIST_API = 'https://graphql.anilist.co'

interface AniListMedia {
  id: number
  idMal: number
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

// Fetch media data from AniList by MAL ID
export async function fetchAniListByMAL(malId: number): Promise<AniListMedia | null> {
  const query = `
    query ($malId: Int) {
      Media(idMal: $malId, type: ANIME) {
        id
        idMal
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

// Fetch multiple anime by MAL IDs with rate limiting
export async function fetchMultipleAniListByMAL(malIds: number[]): Promise<Map<number, AniListMedia>> {
  const results = new Map<number, AniListMedia>()
  const uniqueMalIds = [...new Set(malIds)].filter(Boolean)
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
