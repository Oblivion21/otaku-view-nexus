import { beforeEach, describe, expect, it, vi } from "vitest";

const supabaseMocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

const jikanMocks = vi.hoisted(() => ({
  getAnimeVideoEpisodes: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    functions: {
      invoke: supabaseMocks.invoke,
    },
  },
}));

vi.mock("@/lib/jikan", async () => {
  const actual = await vi.importActual<typeof import("@/lib/jikan")>("@/lib/jikan");
  return {
    ...actual,
    getAnimeVideoEpisodes: jikanMocks.getAnimeVideoEpisodes,
  };
});

import { getAnimeEpisodePreviewImages, type TmdbAnimeArtwork } from "@/lib/tmdb";

const artwork: TmdbAnimeArtwork = {
  tmdbId: 123,
  mediaType: "tv",
  posterUrl: null,
  backdropUrl: null,
  trailerYoutubeId: null,
  matchedTitle: "Naruto",
  seasonNumber: 1,
  seasonName: "Season 1",
  matchConfidence: "high",
};

describe("getAnimeEpisodePreviewImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers TMDB stills and falls back to Jikan thumbnails for unresolved episodes", async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        results: {
          "1": { stillUrl: "https://image.tmdb.org/t/p/w780/episode-1.jpg" },
          "2": { stillUrl: null },
          "3": { stillUrl: null },
        },
      },
      error: null,
    });
    jikanMocks.getAnimeVideoEpisodes.mockResolvedValue([
      {
        mal_id: 2,
        title: "Episode 2",
        episode: "Episode 2",
        url: "https://myanimelist.net/anime/20/Naruto/episode/2",
        images: {
          jpg: {
            image_url: "https://cdn.jikan.moe/episode-2.jpg",
          },
        },
      },
      {
        mal_id: 3,
        title: "Episode 3",
        episode: "Episode 3",
        url: "https://myanimelist.net/anime/20/Naruto/episode/3",
        images: {
          jpg: {
            image_url: "",
          },
        },
      },
    ]);

    const result = await getAnimeEpisodePreviewImages(20, artwork, [1, 2, 3]);

    expect(result.get(1)).toEqual({
      episodeNumber: 1,
      imageUrl: "https://image.tmdb.org/t/p/w780/episode-1.jpg",
      fallbackImageUrl: null,
      source: "tmdb",
    });
    expect(result.get(2)).toEqual({
      episodeNumber: 2,
      imageUrl: "https://cdn.jikan.moe/episode-2.jpg",
      fallbackImageUrl: null,
      source: "jikan",
    });
    expect(result.get(3)).toEqual({
      episodeNumber: 3,
      imageUrl: null,
      fallbackImageUrl: null,
      source: "none",
    });
  });

  it("stores a Jikan thumbnail as a render-time fallback when TMDB still exists", async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        results: {
          "1": { stillUrl: "https://image.tmdb.org/t/p/w780/episode-1.jpg" },
        },
      },
      error: null,
    });
    jikanMocks.getAnimeVideoEpisodes.mockResolvedValue([
      {
        mal_id: 1,
        title: "Episode 1",
        episode: "Episode 1",
        url: "https://myanimelist.net/anime/20/Naruto/episode/1",
        images: {
          jpg: {
            image_url: "https://cdn.jikan.moe/episode-1.jpg",
          },
        },
      },
    ]);

    const result = await getAnimeEpisodePreviewImages(20, artwork, [1]);

    expect(result.get(1)).toEqual({
      episodeNumber: 1,
      imageUrl: "https://image.tmdb.org/t/p/w780/episode-1.jpg",
      fallbackImageUrl: "https://cdn.jikan.moe/episode-1.jpg",
      source: "tmdb",
    });
  });
});
