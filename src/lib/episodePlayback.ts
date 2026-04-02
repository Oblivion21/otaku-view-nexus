import type { AnimeEpisode, VideoSource } from "@/lib/supabase";

type BuildEpisodeDataFromScrapeParams = {
  existingEpisode: AnimeEpisode | null;
  animeId: number;
  episodeNumber: number;
  videoSources: VideoSource[];
  episodePageUrl?: string | null;
  now?: string;
};

export function buildEpisodeDataFromScrape({
  existingEpisode,
  animeId,
  episodeNumber,
  videoSources,
  episodePageUrl,
  now = new Date().toISOString(),
}: BuildEpisodeDataFromScrapeParams): AnimeEpisode {
  const primarySource = videoSources[0];

  return {
    id: existingEpisode?.id || "",
    mal_id: animeId,
    episode_number: episodeNumber,
    episode_page_url: episodePageUrl ?? existingEpisode?.episode_page_url ?? null,
    video_url: primarySource.url,
    quality: primarySource.quality,
    video_sources: videoSources,
    subtitle_language: existingEpisode?.subtitle_language || "ar",
    is_active: existingEpisode?.is_active ?? true,
    category: existingEpisode?.category ?? null,
    tags: existingEpisode?.tags || [],
    scraped_at: now,
    created_at: existingEpisode?.created_at || now,
    updated_at: now,
  };
}
