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

  it("requests and resolves episode preview images beyond episode 24", async () => {
    supabaseMocks.invoke.mockResolvedValue({
      data: {
        results: {
          "25": { stillUrl: "https://image.tmdb.org/t/p/w780/episode-25.jpg" },
        },
      },
      error: null,
    });
    jikanMocks.getAnimeVideoEpisodes.mockResolvedValue([]);

    const result = await getAnimeEpisodePreviewImages(20, artwork, Array.from({ length: 30 }, (_, index) => index + 1));

    expect(supabaseMocks.invoke).toHaveBeenCalledWith(
      "tmdb-episode-stills",
      expect.objectContaining({
        body: expect.objectContaining({
          episodeNumbers: Array.from({ length: 30 }, (_, index) => index + 1),
        }),
      }),
    );
    expect(result.get(25)).toEqual({
      episodeNumber: 25,
      imageUrl: "https://image.tmdb.org/t/p/w780/episode-25.jpg",
      fallbackImageUrl: null,
      source: "tmdb",
    });
  });
});

describe("getMultipleAnimeTmdbArtwork", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries a timed-out artwork request on the next call instead of caching null forever", async () => {
    vi.resetModules();
    const { getMultipleAnimeTmdbArtwork } = await import("@/lib/tmdb");

    supabaseMocks.invoke
      .mockRejectedValueOnce(new Error("TMDB artwork request timed out"))
      .mockResolvedValueOnce({
        data: {
          results: {
            "1": {
              tmdbId: 10,
              mediaType: "tv",
              posterUrl: "https://image.tmdb.org/t/p/w780/naruto.jpg",
              backdropUrl: null,
              trailerYoutubeId: null,
              matchedTitle: "Naruto",
              seasonNumber: 1,
              seasonName: "Season 1",
              matchConfidence: "high",
            },
          },
        },
        error: null,
      });

    const anime = [{
      mal_id: 1,
      title: "Naruto",
      title_english: "Naruto",
      title_japanese: "ナルト",
      type: "TV",
      year: 2002,
      aired: { from: "2002-10-03" },
    }];

    await expect(getMultipleAnimeTmdbArtwork(anime)).resolves.toEqual(new Map());
    const retriedResult = await getMultipleAnimeTmdbArtwork(anime);

    expect(supabaseMocks.invoke).toHaveBeenCalledTimes(2);
    expect(retriedResult.get(1)).toEqual(
      expect.objectContaining({
        tmdbId: 10,
        posterUrl: "https://image.tmdb.org/t/p/w780/naruto.jpg",
      }),
    );
  });
});
