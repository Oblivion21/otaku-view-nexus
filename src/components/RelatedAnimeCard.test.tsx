import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const hookMocks = vi.hoisted(() => ({
  useAnimeById: vi.fn(),
  useAnimeTmdbArtwork: vi.fn(),
}));

vi.mock("@/hooks/useAnime", () => hookMocks);

import RelatedAnimeCard from "@/components/RelatedAnimeCard";

describe("RelatedAnimeCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps retrying after a failed fetch while rendering a fallback card", () => {
    vi.useFakeTimers();

    const refetch = vi.fn();
    hookMocks.useAnimeById.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      isFetching: false,
      refetch,
      failureCount: 1,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <RelatedAnimeCard mal_id={1} name="Naruto" relationLabel="تتمة" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/anime/naruto-1");
    expect(screen.getAllByText("Naruto").length).toBeGreaterThan(0);

    vi.advanceTimersByTime(2000);

    expect(refetch).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("renders the related anime link when the anime data loads", () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          mal_id: 1,
          title: "Naruto",
          title_english: "Naruto",
          title_japanese: "ナルト",
          score: 8.2,
          type: "TV",
          rating: "PG-13",
          year: 2002,
          genres: [{ mal_id: 1, name: "Action" }],
        },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
      failureCount: 0,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        posterUrl: "https://image.tmdb.org/t/p/w780/naruto.jpg",
      },
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <RelatedAnimeCard mal_id={1} name="Naruto" relationLabel="تتمة" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/anime/naruto-1");
    expect(screen.getByText("2002")).toBeInTheDocument();
  });

  it("falls back to the aired year when year is missing", () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          mal_id: 1,
          title: "Naruto",
          title_english: "Naruto",
          title_japanese: "ナルト",
          score: 8.2,
          type: "TV",
          rating: "PG-13",
          year: null,
          aired: {
            from: "2002-10-03",
          },
          genres: [{ mal_id: 1, name: "Action" }],
        },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
      failureCount: 0,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: {
        posterUrl: "https://image.tmdb.org/t/p/w780/naruto.jpg",
      },
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <RelatedAnimeCard mal_id={1} name="Naruto" relationLabel="تتمة" />
      </MemoryRouter>,
    );

    expect(screen.getByText("2002")).toBeInTheDocument();
  });

  it("keeps the related card visible when artwork is unavailable", () => {
    hookMocks.useAnimeById.mockReturnValue({
      data: {
        data: {
          mal_id: 1,
          title: "Naruto",
          title_english: "Naruto",
          title_japanese: "ナルト",
          score: null,
          type: "TV",
          rating: null,
          year: 2002,
          genres: [{ mal_id: 1, name: "Action" }],
          images: {
            jpg: { image_url: "", large_image_url: "" },
            webp: { image_url: "", large_image_url: "" },
          },
        },
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
      failureCount: 0,
    });
    hookMocks.useAnimeTmdbArtwork.mockReturnValue({
      data: null,
      isLoading: false,
    });

    render(
      <MemoryRouter>
        <RelatedAnimeCard mal_id={1} name="Naruto" relationLabel="تتمة" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("link")).toHaveAttribute("href", "/anime/naruto-1");
    expect(screen.getAllByText("Naruto").length).toBeGreaterThan(0);
  });
});
