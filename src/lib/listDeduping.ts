import type { JikanAnime, JikanEpisode, JikanRelationEntry } from "@/lib/jikan";
import type { AnimeEpisode } from "@/lib/supabase";

function dedupeByKey<T, K>(items: T[] | null | undefined, getKey: (item: T) => K): T[] {
  if (!items?.length) {
    return [];
  }

  const seen = new Set<K>();
  const output: T[] = [];

  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }

  return output;
}

export function dedupeAnimeList<T extends Pick<JikanAnime, "mal_id">>(animeList: T[] | null | undefined): T[] {
  return dedupeByKey(animeList, (anime) => anime.mal_id);
}

export function dedupeSupabaseEpisodes(episodes: AnimeEpisode[] | null | undefined): AnimeEpisode[] {
  return dedupeByKey(episodes, (episode) => episode.episode_number);
}

export function dedupeJikanEpisodes(episodes: JikanEpisode[] | null | undefined): JikanEpisode[] {
  return dedupeByKey(episodes, (episode) => episode.mal_id);
}

export function dedupeRelationEntries(
  entries: JikanRelationEntry["entry"] | null | undefined,
): JikanRelationEntry["entry"] {
  return dedupeByKey(entries, (entry) => entry.mal_id);
}
