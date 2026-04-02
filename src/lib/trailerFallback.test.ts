import { describe, expect, it } from "vitest";

import { getTrailerYoutubeId } from "@/lib/trailerFallback";

describe("getTrailerYoutubeId", () => {
  it("prefers TMDB trailers over Jikan data", () => {
    expect(getTrailerYoutubeId("tmdb123", "jikan456", "https://www.youtube.com/embed/embed789")).toBe("tmdb123");
  });

  it("falls back to the Jikan youtube id when TMDB has no trailer", () => {
    expect(getTrailerYoutubeId(null, "jikan456", "https://www.youtube.com/embed/embed789")).toBe("jikan456");
  });

  it("extracts the Jikan embed youtube id when the direct id is missing", () => {
    expect(getTrailerYoutubeId(null, null, "https://www.youtube.com/embed/embed789?autoplay=1")).toBe("embed789");
  });

  it("returns null when neither TMDB nor Jikan has a trailer", () => {
    expect(getTrailerYoutubeId(null, null, null)).toBeNull();
  });
});
