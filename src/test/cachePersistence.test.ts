import { describe, expect, it } from "vitest";
import {
  buildEpisodeCacheUpsertPayload,
  buildEpisodeRefreshFailureUpdate,
  resolveCanonicalEpisodePageUrl,
  type PersistedVideoSource,
} from "../../supabase/functions/scrape-anime3rb/cachePersistence";

const videoSources: PersistedVideoSource[] = [
  {
    url: "https://cdn.example.com/fresh.mp4",
    type: "direct",
    server_name: "anime3rb-direct",
    quality: "1080p",
  },
];

describe("scrape-anime3rb cache persistence helpers", () => {
  it("prefers the remote episode page url over the used candidate and existing db value", () => {
    expect(resolveCanonicalEpisodePageUrl({
      remoteEpisodePageUrl: "https://anime3rb.com/episode/fresh-remote",
      usedEpisodeUrl: "https://anime3rb.com/episode/used-candidate",
      existingEpisodePageUrl: "https://anime3rb.com/episode/existing-db",
    })).toBe("https://anime3rb.com/episode/fresh-remote");
  });

  it("falls back to the used episode url and then the existing db value", () => {
    expect(resolveCanonicalEpisodePageUrl({
      remoteEpisodePageUrl: null,
      usedEpisodeUrl: "https://anime3rb.com/episode/used-candidate",
      existingEpisodePageUrl: "https://anime3rb.com/episode/existing-db",
    })).toBe("https://anime3rb.com/episode/used-candidate");

    expect(resolveCanonicalEpisodePageUrl({
      remoteEpisodePageUrl: null,
      usedEpisodeUrl: null,
      existingEpisodePageUrl: "https://anime3rb.com/episode/existing-db",
    })).toBe("https://anime3rb.com/episode/existing-db");
  });

  it("builds a success payload that overwrites cached playback fields and persists the resolved page url", () => {
    expect(buildEpisodeCacheUpsertPayload({
      malId: 21,
      episodeNumber: 7,
      videoSources,
      resolvedEpisodePageUrl: "https://anime3rb.com/episode/fresh-remote",
      timestamp: "2026-04-02T10:00:00.000Z",
    })).toEqual({
      mal_id: 21,
      episode_number: 7,
      video_url: "https://cdn.example.com/fresh.mp4",
      video_sources: videoSources,
      quality: "1080p",
      subtitle_language: "ar",
      is_active: true,
      scraped_at: "2026-04-02T10:00:00.000Z",
      updated_at: "2026-04-02T10:00:00.000Z",
      episode_page_url: "https://anime3rb.com/episode/fresh-remote",
    });
  });

  it("clears stale cached playback fields only when an episode row already exists", () => {
    expect(buildEpisodeRefreshFailureUpdate({
      hasExistingEpisode: true,
      timestamp: "2026-04-02T10:00:00.000Z",
    })).toEqual({
      video_url: null,
      video_sources: null,
      scraped_at: null,
      updated_at: "2026-04-02T10:00:00.000Z",
    });

    expect(buildEpisodeRefreshFailureUpdate({
      hasExistingEpisode: false,
      timestamp: "2026-04-02T10:00:00.000Z",
    })).toBeNull();
  });
});
