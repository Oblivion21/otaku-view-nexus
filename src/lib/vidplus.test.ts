import { describe, expect, it } from "vitest";
import type { AniListMedia } from "@/lib/anilist";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";
import {
  buildVidplusAnimeEmbedUrl,
  buildVidplusMovieEmbedUrl,
  buildVidplusTvEmbedUrl,
  resolveVidplusPlayerUrl,
} from "@/lib/vidplus";

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

describe("vidplus helpers", () => {
  it("builds an anime episode embed from AniList id and episode number", () => {
    expect(buildVidplusAnimeEmbedUrl(baseMedia, 1)).toBe(
      "https://player.vidplus.to/embed/anime/172463/1?autoplay=true&dub=false&title=true&chromecast=true&episodelist=false&servericon=true&pip=true&nextbutton=false&poster=true&primarycolor=07D0FF&secondarycolor=FFFFFF&iconcolor=FFFFFF",
    );
  });

  it("builds a tmdb movie embed url", () => {
    expect(buildVidplusMovieEmbedUrl(movieArtwork)).toBe(
      "https://player.vidplus.to/embed/movie/533535?autoplay=true&title=true&chromecast=true&episodelist=false&servericon=true&pip=true&nextbutton=false&poster=true&primarycolor=07D0FF&secondarycolor=FFFFFF&iconcolor=FFFFFF",
    );
  });

  it("builds a tmdb tv embed url with season and episode", () => {
    expect(buildVidplusTvEmbedUrl(tvArtwork, 1, 1)).toBe(
      "https://player.vidplus.to/embed/tv/66732/1/1?autoplay=true&title=true&chromecast=true&episodelist=false&servericon=true&pip=true&nextbutton=false&poster=true&primarycolor=07D0FF&secondarycolor=FFFFFF&iconcolor=FFFFFF",
    );
  });

  it("returns null when required ids are missing", () => {
    expect(buildVidplusAnimeEmbedUrl(null, 1)).toBeNull();
    expect(buildVidplusMovieEmbedUrl(null)).toBeNull();
    expect(buildVidplusTvEmbedUrl(null, 1, 1)).toBeNull();
  });

  it("resolves anime series through tmdb tv when available", () => {
    expect(resolveVidplusPlayerUrl(tvArtwork, baseMedia, "TV", 7)).toBe(
      "https://player.vidplus.to/embed/tv/66732/1/7?autoplay=true&title=true&chromecast=true&episodelist=false&servericon=true&pip=true&nextbutton=false&poster=true&primarycolor=07D0FF&secondarycolor=FFFFFF&iconcolor=FFFFFF",
    );
  });

  it("falls back to AniList anime embeds for series when tmdb tv metadata is unavailable", () => {
    expect(resolveVidplusPlayerUrl(null, baseMedia, "TV", 7)).toBe(
      "https://player.vidplus.to/embed/anime/172463/7?autoplay=true&dub=false&title=true&chromecast=true&episodelist=false&servericon=true&pip=true&nextbutton=false&poster=true&primarycolor=07D0FF&secondarycolor=FFFFFF&iconcolor=FFFFFF",
    );
  });

  it("resolves anime movies through AniList when available", () => {
    expect(resolveVidplusPlayerUrl(movieArtwork, baseMedia, "Movie", 1)).toBe(
      "https://player.vidplus.to/embed/anime/172463/1?autoplay=true&dub=false&title=true&chromecast=true&episodelist=false&servericon=true&pip=true&nextbutton=false&poster=true&primarycolor=07D0FF&secondarycolor=FFFFFF&iconcolor=FFFFFF",
    );
  });

  it("falls back to the tv embed when AniList is unavailable but tmdb tv metadata exists", () => {
    expect(resolveVidplusPlayerUrl(tvArtwork, null, "TV", 3)).toBe(
      "https://player.vidplus.to/embed/tv/66732/1/3?autoplay=true&title=true&chromecast=true&episodelist=false&servericon=true&pip=true&nextbutton=false&poster=true&primarycolor=07D0FF&secondarycolor=FFFFFF&iconcolor=FFFFFF",
    );
  });

  it("falls back to the movie embed when AniList is unavailable for movies", () => {
    expect(resolveVidplusPlayerUrl(movieArtwork, null, "Movie", 1)).toBe(
      "https://player.vidplus.to/embed/movie/533535?autoplay=true&title=true&chromecast=true&episodelist=false&servericon=true&pip=true&nextbutton=false&poster=true&primarycolor=07D0FF&secondarycolor=FFFFFF&iconcolor=FFFFFF",
    );
  });
});
