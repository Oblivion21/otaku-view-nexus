import { describe, expect, it } from "vitest";
import type { JikanAnime } from "@/lib/jikan";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";
import { hasAnyTitleArtwork, resolveTitleArtworkUrl } from "@/lib/titleArtwork";

const anime: Pick<JikanAnime, "images"> = {
  images: {
    jpg: {
      image_url: "https://jikan.example.com/poster.jpg",
      large_image_url: "https://jikan.example.com/poster-large.jpg",
    },
    webp: {
      image_url: "https://jikan.example.com/poster.webp",
      large_image_url: "https://jikan.example.com/poster-large.webp",
    },
  },
};

describe("titleArtwork", () => {
  it("prefers TMDB artwork when available", () => {
    const artwork: TmdbAnimeArtwork = {
      tmdbId: 1,
      mediaType: "tv",
      posterUrl: "https://image.tmdb.org/t/p/w780/poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/original/backdrop.jpg",
      matchedTitle: "Naruto",
      seasonNumber: null,
      seasonName: null,
      matchConfidence: "high",
    };

    expect(resolveTitleArtworkUrl(artwork, anime, "poster")).toBe(artwork.posterUrl);
    expect(resolveTitleArtworkUrl(artwork, anime, "banner")).toBe(artwork.backdropUrl);
  });

  it("falls back to Jikan artwork when TMDB artwork is missing", () => {
    expect(resolveTitleArtworkUrl(null, anime, "poster")).toBe("https://jikan.example.com/poster-large.webp");
    expect(resolveTitleArtworkUrl(null, anime, "banner")).toBe("https://jikan.example.com/poster-large.webp");
  });

  it("reports no artwork only when TMDB and Jikan are both missing", () => {
    const animeWithoutArtwork: Pick<JikanAnime, "images"> = {
      images: {
        jpg: { image_url: "", large_image_url: "" },
        webp: { image_url: "", large_image_url: "" },
      },
    };

    expect(resolveTitleArtworkUrl(null, animeWithoutArtwork, "poster")).toBeNull();
    expect(hasAnyTitleArtwork(animeWithoutArtwork, null)).toBe(false);
    expect(hasAnyTitleArtwork(anime, null)).toBe(true);
  });
});
