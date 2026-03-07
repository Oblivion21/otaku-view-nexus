const SCRAPER_API_URL =
  import.meta.env.VITE_SCRAPER_API_URL || "http://localhost:8000";

export interface ScraperResolveResponse {
  success: boolean;
  video_url: string | null;
  episode_page_url: string | null;
  error: string | null;
}

export async function resolveVideoByName(
  animeName: string,
  episodeNumber: number,
  methods?: string[]
): Promise<ScraperResolveResponse> {
  try {
    const response = await fetch(`${SCRAPER_API_URL}/api/resolve-by-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anime_name: animeName,
        episode_number: episodeNumber,
        methods,
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

    return (await response.json()) as ScraperResolveResponse;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to connect to scraper API";
    return {
      success: false,
      video_url: null,
      episode_page_url: null,
      error: message,
    };
  }
}
