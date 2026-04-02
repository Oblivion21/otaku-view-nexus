import { describe, expect, it } from "vitest";
import { buildEpisodeDataFromScrape } from "@/lib/episodePlayback";
import type { AnimeEpisode, VideoSource } from "@/lib/supabase";

const videoSources: VideoSource[] = [
  {
    url: "https://cdn.example.com/fresh.mp4",
    type: "direct",
    server_name: "anime3rb-direct",
    quality: "1080p",
  },
];

const existingEpisode: AnimeEpisode = {
  id: "episode-1",
  mal_id: 21,
  episode_number: 7,
  episode_page_url: "https://anime3rb.com/episode/stale",
  video_url: "https://cdn.example.com/stale.mp4",
  quality: "720p",
  video_sources: [
    {
      url: "https://cdn.example.com/stale.mp4",
      type: "direct",
      server_name: "anime3rb-direct",
      quality: "720p",
    },
  ],
  subtitle_language: "ar",
  is_active: true,
  category: null,
  tags: ["special"],
  scraped_at: "2026-04-01T10:00:00.000Z",
  created_at: "2026-04-01T09:00:00.000Z",
  updated_at: "2026-04-01T10:00:00.000Z",
};

describe("buildEpisodeDataFromScrape", () => {
  it("prefers the fresh episode page url returned by the scraper response", () => {
    expect(buildEpisodeDataFromScrape({
      existingEpisode,
      animeId: 21,
      episodeNumber: 7,
      videoSources,
      episodePageUrl: "https://anime3rb.com/episode/fresh",
      now: "2026-04-02T10:00:00.000Z",
    })).toMatchObject({
      episode_page_url: "https://anime3rb.com/episode/fresh",
      video_url: "https://cdn.example.com/fresh.mp4",
      video_sources: videoSources,
      scraped_at: "2026-04-02T10:00:00.000Z",
      updated_at: "2026-04-02T10:00:00.000Z",
      tags: ["special"],
    });
  });

  it("falls back to the existing episode page url when the fresh response omits it", () => {
    expect(buildEpisodeDataFromScrape({
      existingEpisode,
      animeId: 21,
      episodeNumber: 7,
      videoSources,
      episodePageUrl: null,
      now: "2026-04-02T10:00:00.000Z",
    }).episode_page_url).toBe("https://anime3rb.com/episode/stale");
  });
});
