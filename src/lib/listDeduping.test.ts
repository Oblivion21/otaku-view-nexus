import { describe, expect, it } from "vitest";
import { dedupeAnimeList, dedupeJikanEpisodes, dedupeRelationEntries, dedupeSupabaseEpisodes } from "@/lib/listDeduping";

describe("list deduping helpers", () => {
  it("dedupes anime lists by MAL id while keeping first occurrence", () => {
    expect(
      dedupeAnimeList([
        { mal_id: 1, title: "Naruto" },
        { mal_id: 2, title: "Bleach" },
        { mal_id: 1, title: "Naruto duplicate" },
      ]),
    ).toEqual([
      { mal_id: 1, title: "Naruto" },
      { mal_id: 2, title: "Bleach" },
    ]);
  });

  it("dedupes Jikan episodes by episode number", () => {
    expect(
      dedupeJikanEpisodes([
        { mal_id: 1, title: "Ep 1" },
        { mal_id: 2, title: "Ep 2" },
        { mal_id: 1, title: "Ep 1 duplicate" },
      ] as any),
    ).toEqual([
      { mal_id: 1, title: "Ep 1" },
      { mal_id: 2, title: "Ep 2" },
    ]);
  });

  it("dedupes Supabase episodes by episode_number", () => {
    expect(
      dedupeSupabaseEpisodes([
        { episode_number: 1, id: "a" },
        { episode_number: 2, id: "b" },
        { episode_number: 1, id: "c" },
      ] as any),
    ).toEqual([
      { episode_number: 1, id: "a" },
      { episode_number: 2, id: "b" },
    ]);
  });

  it("dedupes relation entries by MAL id", () => {
    expect(
      dedupeRelationEntries([
        { mal_id: 10, type: "anime", name: "One", url: "#" },
        { mal_id: 20, type: "anime", name: "Two", url: "#" },
        { mal_id: 10, type: "anime", name: "One duplicate", url: "#" },
      ]),
    ).toEqual([
      { mal_id: 10, type: "anime", name: "One", url: "#" },
      { mal_id: 20, type: "anime", name: "Two", url: "#" },
    ]);
  });
});
