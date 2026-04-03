import { describe, expect, it } from "vitest";

import { getTrailerYoutubeId } from "@/lib/trailerFallback";

describe("getTrailerYoutubeId", () => {
  it("prefers TMDB trailers over Jikan data", () => {
    expect(getTrailerYoutubeId("tmdb123", "jikan456", "https://www.youtube.com/embed/embed789", "https://www.youtube.com/watch?v=watch123")).toBe("tmdb123");
  });

  it("falls back to the Jikan youtube id when TMDB has no trailer", () => {
    expect(getTrailerYoutubeId(null, "jikan456", "https://www.youtube.com/embed/embed789", "https://www.youtube.com/watch?v=watch123")).toBe("jikan456");
  });

  it("extracts the Jikan embed youtube id when the direct id is missing", () => {
    expect(getTrailerYoutubeId(null, null, "https://www.youtube.com/embed/embed789?autoplay=1", null)).toBe("embed789");
  });

  it("falls back to the Jikan watch url when embed and direct id are missing", () => {
    expect(getTrailerYoutubeId(null, null, null, "https://www.youtube.com/watch?v=watch789&feature=youtu.be")).toBe("watch789");
  });

  it("falls back to youtu.be short urls when needed", () => {
    expect(getTrailerYoutubeId(null, null, null, "https://youtu.be/short789?t=15")).toBe("short789");
  });

  it("returns null when neither TMDB nor Jikan has a trailer", () => {
    expect(getTrailerYoutubeId(null, null, null, null)).toBeNull();
  });
});
