import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JikanAnime } from "@/lib/jikan";

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

function renderCarousel(items = [{
  anime,
  bannerImage: "https://image.tmdb.org/t/p/original/naruto-backdrop.jpg",
  scoreValue: null,
}]) {
  return render(
    <MemoryRouter>
      <HeroCarousel items={items} />
    </MemoryRouter>,
  );
}

describe("HeroCarousel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the TMDB banner artwork when available", async () => {
    const { container } = renderCarousel();

    await screen.findByRole("heading", { name: "Naruto" });
    expect(container.querySelector('[style*="naruto-backdrop.jpg"]')).not.toBeNull();
  });

  it("shows a loading skeleton while hero items are still being prepared", () => {
    const { container } = render(
      <MemoryRouter>
        <HeroCarousel items={[]} isLoading />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("heading", { name: "Naruto" })).not.toBeInTheDocument();
    expect(container.querySelector(".animate-pulse")).not.toBeNull();
  });

  it("renders a placeholder when the hero item has no banner image", async () => {
    renderCarousel([{ anime, bannerImage: null }]);

    expect(await screen.findByLabelText("Naruto artwork placeholder")).toBeInTheDocument();
  });

  it("shows the anime rating instead of the episode count", async () => {
    renderCarousel();

    expect(await screen.findByText("PG-13")).toBeInTheDocument();
    expect(screen.queryByText("220 حلقة")).not.toBeInTheDocument();
  });

  it("renders the provided hero items in order", async () => {
    const featuredAnime: JikanAnime = {
      ...anime,
      mal_id: 7,
      title: "Bleach",
      title_english: "Bleach",
      title_japanese: "ブリーチ",
      synopsis: "A soul reaper story.",
    };

    renderCarousel([
      { anime, bannerImage: "https://image.tmdb.org/t/p/original/naruto-backdrop.jpg" },
      { anime: featuredAnime, bannerImage: "https://image.tmdb.org/t/p/original/bleach-backdrop.jpg" },
    ]);

    await screen.findByRole("heading", { name: "Naruto" });
    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(await screen.findByRole("heading", { name: "Bleach" })).toBeInTheDocument();
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

    renderCarousel([
      { anime, bannerImage: "https://image.tmdb.org/t/p/original/naruto-backdrop.jpg" },
      { anime: featuredAnime, bannerImage: "https://image.tmdb.org/t/p/original/bleach-backdrop.jpg" },
    ]);

    await screen.findByRole("heading", { name: "Naruto" });

    fireEvent.click(screen.getByLabelText("Next slide"));
    expect(await screen.findByRole("heading", { name: "Bleach" })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Previous slide"));
    expect(await screen.findByRole("heading", { name: "Naruto" })).toBeInTheDocument();
  });
});
