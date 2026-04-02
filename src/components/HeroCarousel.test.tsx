import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JikanAnime } from "@/lib/jikan";

const hookMocks = vi.hoisted(() => ({
  useTopAnime: vi.fn(),
}));

const supabaseMocks = vi.hoisted(() => ({
  getFeaturedAnimeIds: vi.fn(),
}));

const tmdbMocks = vi.hoisted(() => ({
  getMultipleAnimeTmdbArtwork: vi.fn(),
}));

vi.mock("@/hooks/useAnime", () => hookMocks);
vi.mock("@/lib/supabase", () => supabaseMocks);
vi.mock("@/lib/tmdb", () => tmdbMocks);

import HeroCarousel from "@/components/HeroCarousel";

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
  studios: [],
  genres: [{ mal_id: 1, name: "Action" }],
};

function renderCarousel() {
  return render(
    <MemoryRouter>
      <HeroCarousel />
    </MemoryRouter>,
  );
}

describe("HeroCarousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.getFeaturedAnimeIds.mockResolvedValue([]);
    hookMocks.useTopAnime.mockReturnValue({
      data: { data: [anime] },
      isLoading: false,
    });
  });

  it("uses the TMDB banner artwork when available", async () => {
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(
      new Map([
        [1, { posterUrl: null, backdropUrl: "https://image.tmdb.org/t/p/original/naruto-backdrop.jpg" }],
      ]),
    );

    const { container } = renderCarousel();

    await screen.findByText("Naruto");
    await waitFor(() => {
      expect(tmdbMocks.getMultipleAnimeTmdbArtwork).toHaveBeenCalledWith([anime]);
    });
    expect(container.querySelector('[style*="naruto-backdrop.jpg"]')).not.toBeNull();
    expect(container.querySelector('[style*="jikan.example.com"]')).toBeNull();
  });

  it("falls back to Jikan artwork when TMDB artwork is missing", async () => {
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(new Map());

    const { container } = renderCarousel();

    await screen.findByText("Naruto");
    expect(screen.queryByLabelText("Naruto artwork placeholder")).not.toBeInTheDocument();
    expect(container.querySelector('[style*="jikan.example.com/naruto-large.webp"]')).not.toBeNull();
  });
});
