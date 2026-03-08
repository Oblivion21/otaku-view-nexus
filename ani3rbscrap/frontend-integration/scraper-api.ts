/**
 * Client for the anime3rb scraper API.
 *
 * This module connects the otaku-view-nexus frontend to the Python scraper backend.
 * When a user opens an episode page, it sends the anime name + episode number
 * to the scraper API, which searches anime3rb.com and returns a playable video URL.
 *
 * Add this file to: src/lib/scraper-api.ts
 */

// The scraper API base URL — set via environment variable or default to localhost
const SCRAPER_API_URL =
  import.meta.env.VITE_SCRAPER_API_URL || "http://localhost:8000";

export interface ScraperResolveResponse {
  success: boolean;
  video_url: string | null;
  episode_page_url: string | null;
  error: string | null;
}

export interface ScraperSearchResponse {
  success: boolean;
  slug: string | null;
  url: string | null;
  error: string | null;
}

/**
 * Resolve a video URL by anime name and episode number.
 *
 * This is the primary function called from EpisodeWatch.tsx.
 * It sends the anime title (from Jikan/MAL API) and episode number
 * to the scraper, which:
 *   1. Searches anime3rb.com for the anime
 *   2. Builds the episode page URL
 *   3. Scrapes the page to extract the video URL
 *   4. Returns the playable .mp4 URL
 */
export async function resolveVideoByName(
  animeName: string,
  episodeNumber: number
): Promise<ScraperResolveResponse> {
  try {
    const response = await fetch(`${SCRAPER_API_URL}/api/resolve-by-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anime_name: animeName,
        episode_number: episodeNumber,
      }),
    });

    if (!response.ok) {
      return {
        success: false,
        video_url: null,
        episode_page_url: null,
        error: `Scraper API returned ${response.status}`,
      };
    }

    return await response.json();
  } catch (err: any) {
    return {
      success: false,
      video_url: null,
      episode_page_url: null,
      error: err.message || "Failed to connect to scraper API",
    };
  }
}

/**
 * Resolve a video URL from a direct anime3rb episode page URL.
 *
 * Use this when you already know the exact episode URL on anime3rb.com.
 */
export async function resolveVideoByUrl(
  episodeUrl: string
): Promise<ScraperResolveResponse> {
  try {
    const response = await fetch(`${SCRAPER_API_URL}/api/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: episodeUrl }),
    });

    if (!response.ok) {
      return {
        success: false,
        video_url: null,
        episode_page_url: null,
        error: `Scraper API returned ${response.status}`,
      };
    }

    return await response.json();
  } catch (err: any) {
    return {
      success: false,
      video_url: null,
      episode_page_url: null,
      error: err.message || "Failed to connect to scraper API",
    };
  }
}

/**
 * Search anime3rb.com for an anime by name (without scraping the video).
 * Useful for checking if the anime exists before attempting to resolve.
 */
export async function searchAnime3rb(
  animeName: string
): Promise<ScraperSearchResponse> {
  try {
    const response = await fetch(
      `${SCRAPER_API_URL}/api/search?q=${encodeURIComponent(animeName)}`
    );

    if (!response.ok) {
      return {
        success: false,
        slug: null,
        url: null,
        error: `Scraper API returned ${response.status}`,
      };
    }

    return await response.json();
  } catch (err: any) {
    return {
      success: false,
      slug: null,
      url: null,
      error: err.message || "Failed to connect to scraper API",
    };
  }
}
