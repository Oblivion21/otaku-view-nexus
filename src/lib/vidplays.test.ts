import { describe, expect, it } from "vitest";
import type { AniListMedia } from "@/lib/anilist";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";
import {
  buildVidplaysAnimeEmbedUrl,
  buildVidplaysMovieEmbedUrl,
  buildVidplaysTvEmbedUrl,
  resolveVidplaysPlayerUrl,
} from "@/lib/vidplays";

const baseMedia: AniListMedia = {
  id: 172463,
  idMal: 21,
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
  tmdbId: 533535,
  mediaType: "movie",
  posterUrl: null,
  backdropUrl: null,
  trailerYoutubeId: null,
  matchedTitle: "Deadpool & Wolverine",
  seasonNumber: null,
  seasonName: null,
  matchConfidence: "high",
};

const tvArtwork: TmdbAnimeArtwork = {
  tmdbId: 66732,
  mediaType: "tv",
  posterUrl: null,
  backdropUrl: null,
  trailerYoutubeId: null,
  matchedTitle: "Stranger Things",
  seasonNumber: 1,
  seasonName: "Season 1",
  matchConfidence: "high",
};

describe("vidplays helpers", () => {
  it("builds an anime episode embed from AniList id and episode number", () => {
    expect(buildVidplaysAnimeEmbedUrl(baseMedia, 1)).toBe(
      "https://vidplays.fun/embed/anime/172463/1/sub?autoplay=true",
    );
  });

  it("builds a tmdb movie embed url", () => {
    expect(buildVidplaysMovieEmbedUrl(movieArtwork)).toBe(
      "https://vidplays.fun/embed/movie/533535?autoplay=true",
    );
  });

  it("builds a tmdb tv embed url with season and episode", () => {
    expect(buildVidplaysTvEmbedUrl(tvArtwork, 1, 1)).toBe(
      "https://vidplays.fun/embed/tv/66732/1/1?autoplay=true",
    );
  });

  it("returns null when required ids are missing", () => {
    expect(buildVidplaysAnimeEmbedUrl(null, 1)).toBeNull();
    expect(buildVidplaysMovieEmbedUrl(null)).toBeNull();
    expect(buildVidplaysTvEmbedUrl(null, 1, 1)).toBeNull();
  });

  it("resolves anime series through AniList and movies through tmdb", () => {
    expect(resolveVidplaysPlayerUrl(null, baseMedia, "TV", 7)).toBe(
      "https://vidplays.fun/embed/anime/172463/7/sub?autoplay=true",
    );
    expect(resolveVidplaysPlayerUrl(movieArtwork, baseMedia, "Movie", 1)).toBe(
      "https://vidplays.fun/embed/movie/533535?autoplay=true",
    );
  });
});
