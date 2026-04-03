import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JikanAnime } from "@/lib/jikan";

const hookMocks = vi.hoisted(() => ({
  useTopAnime: vi.fn(),
  useFeaturedCarousel: vi.fn(),
}));

const tmdbMocks = vi.hoisted(() => ({
  getMultipleAnimeTmdbArtwork: vi.fn(),
}));

vi.mock("@/hooks/useAnime", () => hookMocks);
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
    hookMocks.useTopAnime.mockReturnValue({
      data: { data: [anime] },
      isLoading: false,
    });
    hookMocks.useFeaturedCarousel.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });
  });

  it("uses the TMDB banner artwork when available", async () => {
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(
      new Map([
        [1, { posterUrl: null, backdropUrl: "https://image.tmdb.org/t/p/original/naruto-backdrop.jpg" }],
      ]),
    );

    const { container } = renderCarousel();

    await screen.findByRole("heading", { name: "Naruto" });
    await waitFor(() => {
      expect(tmdbMocks.getMultipleAnimeTmdbArtwork).toHaveBeenCalledWith([anime]);
    });
    expect(container.querySelector('[style*="naruto-backdrop.jpg"]')).not.toBeNull();
    expect(container.querySelector('[style*="jikan.example.com"]')).toBeNull();
  });

  it("falls back to Jikan artwork when TMDB artwork is missing", async () => {
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(new Map());

    const { container } = renderCarousel();

    await screen.findByRole("heading", { name: "Naruto" });
    expect(screen.queryByLabelText("Naruto artwork placeholder")).not.toBeInTheDocument();
    expect(container.querySelector('[style*="jikan.example.com/naruto-large.webp"]')).not.toBeNull();
  });

  it("shows the anime rating instead of the episode count", async () => {
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(new Map());

    renderCarousel();

    expect(await screen.findByText("PG-13")).toBeInTheDocument();
    expect(screen.queryByText("220 حلقة")).not.toBeInTheDocument();
  });

  it("waits for the featured payload instead of showing fallback hero data while pending", () => {
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(new Map());
    hookMocks.useFeaturedCarousel.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    renderCarousel();

    expect(screen.queryByRole("heading", { name: "Naruto" })).not.toBeInTheDocument();
    expect(tmdbMocks.getMultipleAnimeTmdbArtwork).not.toHaveBeenCalled();
  });

  it("swaps to featured carousel items when the payload resolves", async () => {
    const featuredAnime: JikanAnime = {
      ...anime,
      mal_id: 7,
      title: "Bleach",
      title_english: "Bleach",
      title_japanese: "ブリーチ",
      synopsis: "A soul reaper story.",
    };

    hookMocks.useFeaturedCarousel.mockReturnValue({
      data: [featuredAnime],
      isLoading: false,
      error: null,
    });
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(new Map());

    renderCarousel();

    await screen.findByRole("heading", { name: "Bleach" });
    expect(screen.queryByRole("heading", { name: "Naruto" })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(tmdbMocks.getMultipleAnimeTmdbArtwork).toHaveBeenCalledWith([featuredAnime]);
    });
  });

  it("skips hero entries that have no TMDB or Jikan artwork", async () => {
    const noArtAnime: JikanAnime = {
      ...anime,
      mal_id: 99,
      title: "No Art",
      images: {
        jpg: { image_url: "", large_image_url: "" },
        webp: { image_url: "", large_image_url: "" },
      },
    };

    hookMocks.useFeaturedCarousel.mockReturnValue({
      data: [noArtAnime],
      isLoading: false,
      error: null,
    });
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(new Map());

    renderCarousel();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Naruto" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("heading", { name: "No Art" })).not.toBeInTheDocument();
  });

  it("moves forward from the left button and backward from the right button", async () => {
    const featuredAnime: JikanAnime = {
      ...anime,
      mal_id: 7,
      title: "Bleach",
      title_english: "Bleach",
      title_japanese: "ブリーチ",
      synopsis: "A soul reaper story.",
    };

    hookMocks.useFeaturedCarousel.mockReturnValue({
      data: [anime, featuredAnime],
      isLoading: false,
      error: null,
    });
    tmdbMocks.getMultipleAnimeTmdbArtwork.mockResolvedValue(new Map());

    renderCarousel();

    await screen.findByRole("heading", { name: "Naruto" });

    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(await screen.findByRole("heading", { name: "Bleach" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Previous slide"));
    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
  });
});
