import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JikanAnime } from "@/lib/jikan";

const hookMocks = vi.hoisted(() => ({
  useAnimeById: vi.fn(),
  useAnimeEpisodes: vi.fn(),
  useAnimeRecommendations: vi.fn(),
  useAnimeCharacters: vi.fn(),
  useAnimeThemes: vi.fn(),
  useAnimeRelations: vi.fn(),
  useAnimeTmdbArtwork: vi.fn(),
  useMultipleAnimeTmdbArtwork: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  getAnimeEpisodes: vi.fn(),
}));

const trailerFallbackMocks = vi.hoisted(() => ({
  getTrailerYoutubeId: vi.fn(),
}));

const animeCardSpy = vi.hoisted(() => vi.fn());

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: any }) => <div>{children}</div>,
}));
vi.mock("@/components/AnimeCard", () => ({
  default: (props: any) => {
    animeCardSpy(props);
    return (
      <div data-testid={`recommendation-${props.anime.mal_id}`} data-artwork-url={props.artworkUrl || ""}>
        {props.anime.title}
      </div>
    );
  },
}));
vi.mock("@/components/RelatedAnimeCard", () => ({
  default: () => <div>Related Anime</div>,
}));
vi.mock("@/hooks/useAnime", () => hookMocks);
vi.mock("@/lib/supabase", () => supabaseMocks);
vi.mock("@/lib/trailerFallback", () => trailerFallbackMocks);

import AnimeDetail from "@/pages/AnimeDetail";

const anime: JikanAnime = {
  mal_id: 1,
  title: "Naruto",
  title_english: "Naruto",
  title_japanese: "ナルト",
  images: {
    jpg: {
      image_url: "https://jikan.example.com/naruto.jpg",
      large_image_url: "https://jikan.example.com/naruto-large.jpg",
    },
    webp: {
      image_url: "https://jikan.example.com/naruto.webp",
      large_image_url: "https://jikan.example.com/naruto-large.webp",
    },
  },
  trailer: { youtube_id: null, url: null, embed_url: null },
  synopsis: "A ninja story.",
  score: 8.2,
  scored_by: 1000,
  rank: 1,
  popularity: 1,
  episodes: 220,
  status: "Finished Airing",
  rating: "PG-13",
  type: "TV",
  source: "Manga",
  duration: "24 min",
  aired: { from: "2002-10-03", to: "2007-02-08", string: "2002-2007" },
  season: "fall",
  year: 2002,
  studios: [{ mal_id: 1, name: "Studio Pierrot" }],
  genres: [{ mal_id: 1, name: "Action" }],
};

const recommendation = {
  entry: {
    ...anime,
    mal_id: 2,
    title: "Bleach",
  },
  votes: 120,
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/anime/1"]}>
      <Routes>
        <Route path="/anime/:id" element={<AnimeDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AnimeDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hookMocks.useAnimeById.mockReturnValue({
      data: { data: anime },
      isLoading: false,
    });
    hookMocks.useAnimeEpisodes.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    hookMocks.useAnimeRecommendations.mockReturnValue({
      data: { data: [recommendation] },
      isLoading: false,
    });
    hookMocks.useAnimeCharacters.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    hookMocks.useAnimeThemes.mockReturnValue({
      data: { openings: [], endings: [] },
      isLoading: false,
    });
    hookMocks.useAnimeRelations.mockReturnValue({
      data: { data: [] },
      isLoading: false,
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map([
        [2, { posterUrl: "https://image.tmdb.org/t/p/w780/bleach-poster.jpg", backdropUrl: null }],
      ]),
    });
    supabaseMocks.getAnimeEpisodes.mockResolvedValue([]);
    trailerFallbackMocks.getTrailerYoutubeId.mockReturnValue(null);
  });

  it("uses TMDB banner and poster artwork on the detail page and recommendations", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        tmdbId: 1,
        mediaType: "tv",
        posterUrl: "https://image.tmdb.org/t/p/w780/naruto-poster.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/original/naruto-backdrop.jpg",
        matchedTitle: "Naruto",
        seasonNumber: null,
        seasonName: null,
        matchConfidence: "high",
      },
    });

    const { container } = renderPage();

    expect(await screen.findByText("Naruto")).toBeInTheDocument();
    expect(screen.getByAltText("Naruto")).toHaveAttribute(
      "src",
      expect.stringContaining("naruto-poster.jpg"),
    );
    expect(container.querySelector('[style*="naruto-backdrop.jpg"]')).not.toBeNull();
    expect(animeCardSpy.mock.calls[0][0]).toEqual(expect.objectContaining({
      artworkUrl: "https://image.tmdb.org/t/p/w780/bleach-poster.jpg",
    }));
    expect(container.querySelector('[src*="jikan.example.com"]')).toBeNull();
  });

  it("renders placeholders instead of falling back to Jikan artwork when TMDB is missing", async () => {
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
    });
    hookMocks.useMultipleAnimeTmdbArtwork.mockReturnValue({
      data: new Map(),
    });

    const { container } = renderPage();

    await waitFor(() => {
      expect(screen.getAllByLabelText("Naruto artwork placeholder").length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.queryByAltText("Naruto")).not.toBeInTheDocument();
    expect(container.querySelector('[src*="jikan.example.com"]')).toBeNull();
  });
});
