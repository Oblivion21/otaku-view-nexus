import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAnimeVideoEpisodes,
  getAnimeRecommendations,
  getGenres,
  getTopAnime,
  getVisibleGenres,
  isBlockedAnime,
  searchAnime,
  type JikanAnime,
} from "@/lib/jikan";

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

  it("normalizes video episode thumbnails from the Jikan videos endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          promo: [],
          episodes: [
            {
              mal_id: 220,
              title: "Departure",
              episode: "Episode 220",
              url: "https://myanimelist.net/anime/20/Naruto/episode/220",
              images: {
                jpg: {
                  image_url: "https://img.example.com/episode-220.jpg",
                },
              },
            },
            {
              mal_id: "bad",
              title: "Invalid",
            },
          ],
        },
      }),
    } as Response);

    const result = await getAnimeVideoEpisodes(20);

    expect(result).toEqual([
      {
        mal_id: 220,
        title: "Departure",
        episode: "Episode 220",
        url: "https://myanimelist.net/anime/20/Naruto/episode/220",
        images: {
          jpg: {
            image_url: "https://img.example.com/episode-220.jpg",
          },
        },
      },
    ]);
  });

  it("keeps recommendation entries that omit genres in the Jikan payload", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            entry: {
              ...baseAnime,
              mal_id: 2,
              title: "Partial Recommendation",
              genres: [],
            },
            votes: 42,
          },
          {
            entry: {
              ...baseAnime,
              mal_id: 3,
              title: "Blocked Recommendation",
              genres: [{ mal_id: 2, name: "School" }],
            },
            votes: 8,
          },
        ],
      }),
    } as Response);

    const result = await getAnimeRecommendations(1);

    expect(result.data).toEqual([
      {
        entry: {
          ...baseAnime,
          mal_id: 2,
          title: "Partial Recommendation",
          genres: [],
        },
        votes: 42,
      },
    ]);
  });

  it("builds a query-only anime search request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [],
        pagination: {
          last_visible_page: 1,
          has_next_page: false,
          current_page: 2,
        },
      }),
    } as Response);

    await searchAnime({ query: "Naruto", page: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requestedUrl.pathname).toBe("/v4/anime");
    expect(requestedUrl.searchParams.get("q")).toBe("Naruto");
    expect(requestedUrl.searchParams.get("page")).toBe("2");
    expect(requestedUrl.searchParams.get("limit")).toBe("24");
    expect(requestedUrl.searchParams.get("sfw")).toBe("true");
    expect(requestedUrl.searchParams.get("genres")).toBeNull();
  });

  it("supports filter-only anime search requests with year and score bounds", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [],
        pagination: {
          last_visible_page: 1,
          has_next_page: false,
          current_page: 1,
        },
      }),
    } as Response);

    await searchAnime({
      type: "movie",
      genreId: 10,
      yearFrom: 2005,
      yearTo: 2012,
      minScore: 7,
      maxScore: 9,
      orderBy: "score",
      sort: "desc",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requestedUrl.searchParams.get("q")).toBeNull();
    expect(requestedUrl.searchParams.get("type")).toBe("movie");
    expect(requestedUrl.searchParams.get("genres")).toBe("10");
    expect(requestedUrl.searchParams.get("start_date")).toBe("2005-01-01");
    expect(requestedUrl.searchParams.get("end_date")).toBe("2012-12-31");
    expect(requestedUrl.searchParams.get("min_score")).toBe("7");
    expect(requestedUrl.searchParams.get("max_score")).toBe("9");
    expect(requestedUrl.searchParams.get("order_by")).toBe("score");
    expect(requestedUrl.searchParams.get("sort")).toBe("desc");
  });

  it("omits empty params and normalizes inverted ranges in anime search requests", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [],
        pagination: {
          last_visible_page: 1,
          has_next_page: false,
          current_page: 1,
        },
      }),
    } as Response);

    await searchAnime({
      query: "   ",
      yearFrom: 2022,
      yearTo: 2018,
      minScore: 9,
      maxScore: 4,
      sort: "asc",
    });

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requestedUrl.searchParams.get("q")).toBeNull();
    expect(requestedUrl.searchParams.get("start_date")).toBe("2018-01-01");
    expect(requestedUrl.searchParams.get("end_date")).toBe("2022-12-31");
    expect(requestedUrl.searchParams.get("min_score")).toBe("4");
    expect(requestedUrl.searchParams.get("max_score")).toBe("9");
    expect(requestedUrl.searchParams.get("sort")).toBeNull();
  });
});
