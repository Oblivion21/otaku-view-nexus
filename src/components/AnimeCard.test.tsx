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
  it("renders the artwork url when provided", () => {
    renderCard("https://image.tmdb.org/t/p/w780/naruto-poster.jpg");

    expect(screen.getByAltText("Naruto")).toHaveAttribute(
      "src",
      expect.stringContaining("image.tmdb.org/t/p/w780/naruto-poster.jpg"),
    );
    expect(screen.queryByLabelText("Naruto artwork placeholder")).not.toBeInTheDocument();
  });

  it("falls back to Jikan artwork when no parent artwork url is provided", () => {
    renderCard(null);

    expect(screen.getByAltText("Naruto")).toHaveAttribute(
      "src",
      expect.stringContaining("jikan.example.com/naruto-large.webp"),
    );
    expect(screen.queryByLabelText("Naruto artwork placeholder")).not.toBeInTheDocument();
  });

  it("shows the anime rating instead of the episode count", () => {
    renderCard("https://image.tmdb.org/t/p/w780/naruto-poster.jpg");

    expect(screen.getByText("PG-13")).toBeInTheDocument();
    expect(screen.queryByText("220 حلقة")).not.toBeInTheDocument();
  });

  it("renders nothing when no artwork url is available from TMDB or Jikan", () => {
    const animeWithoutArtwork: JikanAnime = {
      ...anime,
      images: {
        jpg: {
          image_url: "",
          large_image_url: "",
        },
        webp: {
          image_url: "",
          large_image_url: "",
        },
      },
    };

    const { container } = render(
      <MemoryRouter>
        <AnimeCard anime={animeWithoutArtwork} artworkUrl={null} />
      </MemoryRouter>,
    );

    expect(screen.queryByAltText("Naruto")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
