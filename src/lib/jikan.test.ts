import { beforeEach, describe, expect, it, vi } from "vitest";
import { getGenres, getTopAnime, getVisibleGenres, isBlockedAnime, type JikanAnime } from "@/lib/jikan";

const baseAnime: JikanAnime = {
  mal_id: 1,
  title: "Naruto",
  title_japanese: "ナルト",
  title_english: "Naruto",
  images: {
    jpg: { image_url: "", large_image_url: "" },
    webp: { image_url: "", large_image_url: "" },
  },
  trailer: {
    youtube_id: null,
    url: null,
    embed_url: null,
  },
  synopsis: null,
  score: null,
  scored_by: null,
  rank: null,
  popularity: null,
  episodes: null,
  status: "Finished Airing",
  rating: null,
  type: "TV",
  source: null,
  duration: null,
  aired: {
    from: null,
    to: null,
    string: "",
  },
  season: null,
  year: null,
  studios: [],
  genres: [],
};

describe("jikan genre filtering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("blocks anime that have no genres from the configured allowlist", () => {
    expect(isBlockedAnime({
      ...baseAnime,
      genres: [{ mal_id: 1, name: "School" }],
    })).toBe(true);

    expect(isBlockedAnime({
      ...baseAnime,
      genres: [{ mal_id: 99, name: "Action" }],
    })).toBe(false);

    expect(isBlockedAnime({
      ...baseAnime,
      genres: [
        { mal_id: 99, name: "Action" },
        { mal_id: 100, name: "School" },
      ],
    })).toBe(false);

    expect(isBlockedAnime({
      ...baseAnime,
      genres: [],
    })).toBe(true);
  });

  it("filters anime with no allowed genres from top anime results", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            ...baseAnime,
            mal_id: 1,
            title: "Allowed Anime",
            genres: [{ mal_id: 1, name: "Action" }],
          },
          {
            ...baseAnime,
            mal_id: 2,
            title: "Blocked Anime",
            genres: [{ mal_id: 2, name: "School" }],
          },
        ],
        pagination: {
          last_visible_page: 1,
          has_next_page: false,
          current_page: 1,
        },
      }),
    } as Response);

    const result = await getTopAnime();

    expect(result.data).toHaveLength(1);
    expect(result.data[0].title).toBe("Allowed Anime");
  });

  it("filters non-allowed genres from the browse genre list", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { mal_id: 1, name: "Action", count: 10 },
          { mal_id: 2, name: "School", count: 4 },
          { mal_id: 3, name: "Award Winning", count: 2 },
        ],
      }),
    } as Response);

    const result = await getGenres();

    expect(result.data).toEqual([
      { mal_id: 1, name: "Action", count: 10 },
      { mal_id: 3, name: "Award Winning", count: 2 },
    ]);
  });

  it("returns only allowed visible genres for badges", () => {
    const visibleGenres = getVisibleGenres({
      ...baseAnime,
      genres: [
        { mal_id: 1, name: "Action" },
        { mal_id: 2, name: "School" },
        { mal_id: 3, name: "Mystery" },
      ],
    });

    expect(visibleGenres).toEqual([
      { mal_id: 1, name: "Action" },
      { mal_id: 3, name: "Mystery" },
    ]);
  });
});
