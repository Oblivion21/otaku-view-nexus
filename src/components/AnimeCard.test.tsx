import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import AnimeCard from "@/components/AnimeCard";
import type { JikanAnime } from "@/lib/jikan";

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
  trailer: {
    youtube_id: null,
    url: null,
    embed_url: null,
  },
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
  aired: {
    from: "2002-10-03",
    to: "2007-02-08",
    string: "2002-2007",
  },
  season: "fall",
  year: 2002,
  studios: [],
  genres: [{ mal_id: 1, name: "Action" }],
};

function renderCard(artworkUrl?: string | null) {
  return render(
    <MemoryRouter>
      <AnimeCard anime={anime} artworkUrl={artworkUrl} />
    </MemoryRouter>,
  );
}

describe("AnimeCard", () => {
  it("renders the TMDB artwork url when provided", () => {
    renderCard("https://image.tmdb.org/t/p/w780/naruto-poster.jpg");

    expect(screen.getByAltText("Naruto")).toHaveAttribute(
      "src",
      expect.stringContaining("image.tmdb.org/t/p/w780/naruto-poster.jpg"),
    );
    expect(screen.queryByLabelText("Naruto artwork placeholder")).not.toBeInTheDocument();
  });

  it("renders a placeholder and never falls back to Jikan artwork when TMDB is missing", () => {
    const { container } = renderCard(null);

    expect(screen.getByLabelText("Naruto artwork placeholder")).toBeInTheDocument();
    expect(screen.queryByAltText("Naruto")).not.toBeInTheDocument();
    expect(container.querySelector('img[src*="jikan.example.com"]')).toBeNull();
  });
});
