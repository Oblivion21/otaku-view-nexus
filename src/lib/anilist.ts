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

  // AniList has rate limits, so we add delays between requests
  for (let i = 0; i < malIds.length; i++) {
    const malId = malIds[i]

    // Add 600ms delay between requests to respect rate limits (90 requests per minute)
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 700))
    }

    const media = await fetchAniListByMAL(malId)
    if (media) {
      results.set(malId, media)
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
