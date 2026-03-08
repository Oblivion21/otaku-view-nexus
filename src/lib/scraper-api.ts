const SCRAPER_API_URL =
  import.meta.env.VITE_SCRAPER_API_URL || "http://localhost:8000";

export interface ScraperResolveResponse {
  success: boolean;
  video_url: string | null;
  episode_page_url: string | null;
  error: string | null;
}

function normalizeEpisodeNumber(input: number): number | null {
  if (!Number.isFinite(input)) return null;
  const n = Math.trunc(input);
  return n > 0 ? n : null;
}

async function buildHttpError(prefix: string, response: Response): Promise<string> {
  let details = "";
  try {
    const text = (await response.text()).trim();
    if (text) details = `: ${text.slice(0, 200)}`;
  } catch {
    // Ignore body-read errors.
  }
  return `${prefix} ${response.status}${details}`;
}

export async function resolveVideoByName(
  animeName: string,
  episodeNumber: number,
  methods?: string[]
): Promise<ScraperResolveResponse> {
  const normalizedEpisode = normalizeEpisodeNumber(episodeNumber);
  if (!normalizedEpisode) {
    return {
      success: false,
      video_url: null,
      episode_page_url: null,
      error: `Invalid episode number: ${String(episodeNumber)}`,
    };
  }

  try {
    const response = await fetch(`${SCRAPER_API_URL}/api/resolve-by-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        anime_name: animeName,
        episode_number: normalizedEpisode,
        methods,
      }),
    });

    if (response.ok) {
      return (await response.json()) as ScraperResolveResponse;
    }

    // Fallback: this endpoint also supports GET, which can bypass strict body parsing/proxy issues.
    if (response.status === 400 || response.status === 422) {
      const params = new URLSearchParams({
        anime_name: animeName,
        episode_number: String(normalizedEpisode),
      });
      if (methods && methods.length > 0) {
        params.set("methods", methods.join(","));
      }

      const getResponse = await fetch(`${SCRAPER_API_URL}/api/resolve-by-name?${params.toString()}`, {
        method: "GET",
      });

      if (getResponse.ok) {
        return (await getResponse.json()) as ScraperResolveResponse;
      }

      return {
        success: false,
        video_url: null,
        episode_page_url: null,
        error: await buildHttpError("Scraper API returned", getResponse),
      };
    }

    return {
      success: false,
      video_url: null,
      episode_page_url: null,
      error: await buildHttpError("Scraper API returned", response),
    };
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
