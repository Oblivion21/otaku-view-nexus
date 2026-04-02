import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach, vi } from "vitest";
import type { JikanAnime } from "@/lib/jikan";

const hookMocks = vi.hoisted(() => ({
  useMultipleAnimeTmdbArtwork: vi.fn(),
}));

const animeCardSpy = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/useAnime", () => hookMocks);
vi.mock("@/components/AnimeCard", () => ({
  default: (props: any) => {
    animeCardSpy(props);
    return <div data-testid={`card-${props.anime.mal_id}`}>{props.anime.title}</div>;
  },
}));

import AnimeGrid from "@/components/AnimeGrid";

const animeList: JikanAnime[] = [
  {
    mal_id: 1,
    title: "Naruto",
    title_english: "Naruto",
    title_japanese: "ナルト",
    images: {
      jpg: { image_url: "", large_image_url: "" },
      webp: { image_url: "", large_image_url: "" },
    },
    trailer: { youtube_id: null, url: null, embed_url: null },
    synopsis: null,
    score: null,
    scored_by: null,
    rank: null,
    popularity: null,
    episodes: 220,
    status: "Finished Airing",
    rating: null,
    type: "TV",
    source: null,
    duration: null,
    aired: { from: null, to: null, string: "" },
    season: null,
    year: 2002,
    studios: [],
    genres: [],
  },
  {
    mal_id: 2,
    title: "Bleach",
    title_english: "Bleach",
    title_japanese: "ブリーチ",
    images: {
      jpg: { image_url: "https://jikan.example.com/bleach.jpg", large_image_url: "https://jikan.example.com/bleach-large.jpg" },
      webp: { image_url: "https://jikan.example.com/bleach.webp", large_image_url: "https://jikan.example.com/bleach-large.webp" },
    },
    trailer: { youtube_id: null, url: null, embed_url: null },
    synopsis: null,
    score: null,
    scored_by: null,
    rank: null,
    popularity: null,
    episodes: 366,
    status: "Finished Airing",
    rating: null,
    type: "TV",
    source: null,
    duration: null,
    aired: { from: null, to: null, string: "" },
    season: null,
    year: 2004,
    studios: [],
    genres: [],
  },
];

describe("AnimeGrid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map([
        [1, { posterUrl: "https://image.tmdb.org/t/p/w780/naruto-poster.jpg", backdropUrl: null }],
        [2, null],
      ]),
    });
  });

  it("uses one batched TMDB lookup and falls back to Jikan artwork when TMDB is missing", () => {
    render(<AnimeGrid title="Popular" anime={animeList} isLoading={false} />);

    expect(hookMocks.useMultipleAnimeTmdbArtwork).toHaveBeenCalledWith(animeList);
    expect(screen.getByTestId("card-1")).toBeInTheDocument();
    expect(screen.getByTestId("card-2")).toBeInTheDocument();
    expect(animeCardSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      anime: animeList[0],
      artworkUrl: "https://image.tmdb.org/t/p/w780/naruto-poster.jpg",
    }));
    expect(animeCardSpy.mock.calls[1][0]).toEqual(expect.objectContaining({
      anime: animeList[1],
      artworkUrl: "https://jikan.example.com/bleach-large.webp",
    }));
  });
});
