import { describe, expect, it } from "vitest";
import { buildVidFastEmbedUrl, getVidFastUnavailableReason } from "@/lib/vidfast";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";

const baseArtwork: TmdbAnimeArtwork = {
  tmdbId: 123,
  mediaType: "tv",
  posterUrl: null,
  backdropUrl: null,
  matchedTitle: "Naruto",
  seasonNumber: 1,
  seasonName: "Season 1",
  matchConfidence: "high",
};

describe("vidfast helpers", () => {
  it("builds a tv embed url with autoplay, autonext, next button, and theme", () => {
    expect(buildVidFastEmbedUrl(baseArtwork, 7)).toBe(
      "https://vidfast.pro/tv/123/1/7?autoPlay=true&theme=%2300D0FF&autoNext=true&nextButton=true",
    );
  });

  it("builds a movie embed url without season or episode segments", () => {
    expect(buildVidFastEmbedUrl({ ...baseArtwork, mediaType: "movie", seasonNumber: null }, 1)).toBe(
      "https://vidfast.pro/movie/123?autoPlay=true&theme=%2300D0FF",
    );
  });

  it("returns null when a tv season mapping is missing", () => {
    expect(buildVidFastEmbedUrl({ ...baseArtwork, seasonNumber: null }, 3)).toBeNull();
  });

  it("returns a fallback reason when artwork is missing", () => {
    expect(getVidFastUnavailableReason(null, 1)).toMatch("Switched to Backup Player");
  });
});
