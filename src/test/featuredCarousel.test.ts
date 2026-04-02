import { describe, expect, it } from "vitest";
import {
  FEATURED_CAROUSEL_CACHE_CONTROL,
  normalizeFeaturedAnimeIds,
  orderFeaturedCarouselItems,
  pickFeaturedCarouselAnime,
} from "../../supabase/functions/featured-carousel/shared";

describe("featured carousel helpers", () => {
  it("normalizes featured ids, preserves order, and removes duplicates", () => {
    expect(normalizeFeaturedAnimeIds([10, "20", 10, "bad", -1, 30])).toEqual([10, 20, 30]);
  });

  it("normalizes featured ids from embedded Supabase anime payloads", () => {
    expect(
      normalizeFeaturedAnimeIds([
        { mal_id: 7, title: "Bleach" },
        { mal_id: "1", title: "Naruto" },
        { mal_id: 7, title: "Bleach duplicate" },
        { title: "Missing id" },
      ]),
    ).toEqual([7, 1]);
  });

  it("picks the compact hero payload from a Jikan anime response", () => {
    expect(
      pickFeaturedCarouselAnime({
        mal_id: 1,
        title: "Naruto",
        title_japanese: "ナルト",
        title_english: "Naruto",
        images: {
          jpg: { image_url: "jpg", large_image_url: "jpg-large" },
          webp: { image_url: "webp", large_image_url: "webp-large" },
        },
        synopsis: "A ninja story.",
        score: 8.2,
        episodes: 220,
        type: "TV",
        year: 2002,
        aired: { from: "2002-10-03", to: null, string: "2002" },
        genres: [{ mal_id: 1, name: "Action" }],
      }),
    ).toEqual({
      mal_id: 1,
      title: "Naruto",
      title_japanese: "ナルト",
      title_english: "Naruto",
      images: {
        jpg: { image_url: "jpg", large_image_url: "jpg-large" },
        webp: { image_url: "webp", large_image_url: "webp-large" },
      },
      synopsis: "A ninja story.",
      score: 8.2,
      episodes: 220,
      type: "TV",
      year: 2002,
      aired: { from: "2002-10-03", to: null, string: "2002" },
      genres: [{ mal_id: 1, name: "Action" }],
    });
  });

  it("orders featured items by the configured ids and skips missing entries", () => {
    const bleach = pickFeaturedCarouselAnime({
      mal_id: 7,
      title: "Bleach",
      title_japanese: "ブリーチ",
      title_english: "Bleach",
      images: {
        jpg: { image_url: "bleach-jpg", large_image_url: "bleach-jpg-large" },
        webp: { image_url: "bleach-webp", large_image_url: "bleach-webp-large" },
      },
      synopsis: "A soul reaper story.",
      score: 7.9,
      episodes: 366,
      type: "TV",
      year: 2004,
      aired: { from: "2004-10-05", to: null, string: "2004" },
      genres: [{ mal_id: 1, name: "Action" }],
    });
    const naruto = pickFeaturedCarouselAnime({
      mal_id: 1,
      title: "Naruto",
      title_japanese: "ナルト",
      title_english: "Naruto",
      images: {
        jpg: { image_url: "naruto-jpg", large_image_url: "naruto-jpg-large" },
        webp: { image_url: "naruto-webp", large_image_url: "naruto-webp-large" },
      },
      synopsis: "A ninja story.",
      score: 8.2,
      episodes: 220,
      type: "TV",
      year: 2002,
      aired: { from: "2002-10-03", to: null, string: "2002" },
      genres: [{ mal_id: 1, name: "Action" }],
    });

    expect(
      orderFeaturedCarouselItems(
        [7, 1, 99],
        new Map([
          [1, naruto],
          [7, bleach],
          [99, null],
        ]),
      ),
    ).toEqual([bleach, naruto]);
  });

  it("uses the expected 5-minute cache header value", () => {
    expect(FEATURED_CAROUSEL_CACHE_CONTROL).toBe("public, max-age=300, s-maxage=300");
  });
});
