import { describe, expect, it } from "vitest";
import type { AniListMedia } from "@/lib/anilist";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";
import {
  buildVideasyAnimeEmbedUrl,
  buildVideasyMovieEmbedUrl,
  getVideasyUnavailableReason,
  resolveVideasyMainPlayerUrl,
} from "@/lib/videasy";

const baseMedia: AniListMedia = {
  id: 21,
  idMal: 1,
  format: "TV",
  title: {
    romaji: "One Piece",
    english: "One Piece",
    native: "ONE PIECE",
  },
  bannerImage: null,
  coverImage: {
    extraLarge: "",
    large: "",
    color: null,
  },
};

const movieArtwork: TmdbAnimeArtwork = {
  tmdbId: 299534,
  mediaType: "movie",
  posterUrl: null,
  backdropUrl: null,
  matchedTitle: "Avengers: Endgame",
  seasonNumber: null,
  seasonName: null,
  matchConfidence: "high",
};

describe("videasy helpers", () => {
  it("builds a tmdb movie embed url with color", () => {
    expect(buildVideasyMovieEmbedUrl(movieArtwork)).toBe(
      "https://player.videasy.net/movie/299534?color=00D0FF",
    );
  });

  it("builds a show embed url with an AniList id, episode, and color", () => {
    expect(buildVideasyAnimeEmbedUrl(baseMedia, "TV", 7)).toBe(
      "https://player.videasy.net/anime/21/7?color=00D0FF",
    );
  });

  it("builds a movie embed url without an episode segment", () => {
    expect(buildVideasyAnimeEmbedUrl(baseMedia, "Movie", 1)).toBe(
      "https://player.videasy.net/anime/21?color=00D0FF",
    );
  });

  it("prefers the tmdb movie path for anime movies when available", () => {
    expect(resolveVideasyMainPlayerUrl(movieArtwork, baseMedia, "Movie", 1)).toBe(
      "https://player.videasy.net/movie/299534?color=00D0FF",
    );
  });

  it("falls back to the anilist anime-movie path when tmdb movie data is missing", () => {
    expect(resolveVideasyMainPlayerUrl(null, baseMedia, "Movie", 1)).toBe(
      "https://player.videasy.net/anime/21?color=00D0FF",
    );
  });

  it("returns null when a show episode number is invalid", () => {
    expect(buildVideasyAnimeEmbedUrl(baseMedia, "TV", 0)).toBeNull();
  });

  it("returns a fallback reason when AniList media is missing", () => {
    expect(getVideasyUnavailableReason(null, null, "TV", 1)).toMatch("Switched to Backup Player");
  });
});
