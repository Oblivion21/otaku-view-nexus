import type { JikanAnime } from "@/lib/jikan";
import { supabase } from "@/lib/supabase";

type TmdbMediaType = "movie" | "tv";
export type TmdbMatchConfidence = "high" | "medium" | "low";
export type EpisodePreviewArtwork = {
  episodeNumber: number;
  stillUrl: string | null;
};

export type AnimeArtworkLookup = {
  mal_id: JikanAnime["mal_id"];
  title: JikanAnime["title"];
  title_english: JikanAnime["title_english"];
  title_japanese: JikanAnime["title_japanese"];
  type: JikanAnime["type"];
  year: JikanAnime["year"];
  aired?: {
    from?: JikanAnime["aired"]["from"];
  } | null;
};

export interface TmdbAnimeArtwork {
  tmdbId: number;
  mediaType: TmdbMediaType;
  posterUrl: string | null;
  backdropUrl: string | null;
  matchedTitle: string | null;
  seasonNumber: number | null;
  seasonName: string | null;
  matchConfidence: TmdbMatchConfidence;
}

interface TmdbArtworkResponse {
  results?: Record<string, TmdbAnimeArtwork | null>;
  error?: string;
}

interface TmdbEpisodeStillResponse {
  results?: Record<string, { stillUrl: string | null } | null>;
  error?: string;
}

const artworkCache = new Map<number, Promise<TmdbAnimeArtwork | null>>();

function normalizeAnimeList(animeList: AnimeArtworkLookup[]) {
  return Array.from(
    new Map(
      animeList
        .filter((anime) => anime?.mal_id)
        .map((anime) => [
          anime.mal_id,
          {
            mal_id: anime.mal_id,
            title: anime.title,
            title_english: anime.title_english,
            title_japanese: anime.title_japanese,
            type: anime.type,
            year: anime.year,
            aired: anime.aired ? { from: anime.aired.from } : null,
          },
        ]),
    ).values(),
  );
}

async function invokeTmdbArtwork(
  animeList: AnimeArtworkLookup[],
): Promise<Map<number, TmdbAnimeArtwork>> {
  if (!supabase || animeList.length === 0) {
    return new Map();
  }

  const requestAnimeList = normalizeAnimeList(animeList);
  if (!requestAnimeList.length) {
    return new Map();
  }

  const { data, error } = await supabase.functions.invoke("tmdb-artwork", {
    body: { animeList: requestAnimeList },
  });

  if (error) {
    throw new Error(error.message);
  }

  const payload = data as TmdbArtworkResponse | null;
  if (!payload?.results) {
    if (payload?.error) {
      throw new Error(payload.error);
    }
    return new Map();
  }

  return new Map(
    Object.entries(payload.results)
      .filter((entry): entry is [string, TmdbAnimeArtwork] => Boolean(entry[1]))
      .map(([malId, artwork]) => [Number(malId), artwork]),
  );
}

export async function getMultipleAnimeTmdbArtwork(animeList: AnimeArtworkLookup[]) {
  const uniqueAnime = normalizeAnimeList(animeList);
  const uncachedAnime = uniqueAnime.filter((anime) => !artworkCache.has(anime.mal_id));

  if (uncachedAnime.length > 0) {
    const batchRequest = invokeTmdbArtwork(uncachedAnime)
      .then((results) => {
        uncachedAnime.forEach((anime) => {
          const artwork = results.get(anime.mal_id) ?? null;
          artworkCache.set(anime.mal_id, Promise.resolve(artwork));
        });
        return results;
      })
      .catch((error) => {
        console.error("Failed to fetch TMDB artwork via Supabase function:", error);
        uncachedAnime.forEach((anime) => {
          artworkCache.set(anime.mal_id, Promise.resolve(null));
        });
        return new Map<number, TmdbAnimeArtwork>();
      });

    uncachedAnime.forEach((anime) => {
      const pendingArtwork = batchRequest.then((results) => results.get(anime.mal_id) ?? null);
      artworkCache.set(anime.mal_id, pendingArtwork);
    });
  }

  const resolvedEntries = await Promise.all(
    uniqueAnime.map(async (anime) => {
      const artwork = await artworkCache.get(anime.mal_id);
      return [anime.mal_id, artwork ?? null] as const;
    }),
  );

  return new Map(
    resolvedEntries.filter((entry): entry is readonly [number, TmdbAnimeArtwork] => Boolean(entry[1])),
  );
}

export async function getAnimeTmdbArtwork(anime: AnimeArtworkLookup | null | undefined) {
  if (!anime?.mal_id) {
    return null;
  }

  const artwork = await getMultipleAnimeTmdbArtwork([anime]);
  return artwork.get(anime.mal_id) ?? null;
}

export async function getAnimeEpisodeStills(
  artwork: TmdbAnimeArtwork | null | undefined,
  episodeNumbers: number[],
) {
  if (
    !supabase ||
    !artwork?.tmdbId ||
    artwork.mediaType !== "tv" ||
    !artwork.seasonNumber
  ) {
    return new Map<number, EpisodePreviewArtwork>();
  }

  const uniqueEpisodeNumbers = Array.from(
    new Set(
      episodeNumbers
        .map((episodeNumber) => Number(episodeNumber))
        .filter((episodeNumber) => Number.isInteger(episodeNumber) && episodeNumber > 0),
    ),
  );

  if (uniqueEpisodeNumbers.length === 0) {
    return new Map<number, EpisodePreviewArtwork>();
  }

  try {
    const { data, error } = await supabase.functions.invoke("tmdb-episode-stills", {
      body: {
        tmdbId: artwork.tmdbId,
        mediaType: artwork.mediaType,
        seasonNumber: artwork.seasonNumber,
        episodeNumbers: uniqueEpisodeNumbers,
      },
    });

    if (error) {
      throw new Error(error.message);
    }

    const payload = data as TmdbEpisodeStillResponse | null;
    if (!payload?.results) {
      if (payload?.error) {
        throw new Error(payload.error);
      }
      return new Map<number, EpisodePreviewArtwork>();
    }

    return new Map(
      Object.entries(payload.results).map(([episodeNumber, result]) => [
        Number(episodeNumber),
        {
          episodeNumber: Number(episodeNumber),
          stillUrl: result?.stillUrl ?? null,
        },
      ]),
    );
  } catch (error) {
    console.error("Failed to fetch TMDB episode stills via Supabase function:", error);
    return new Map<number, EpisodePreviewArtwork>();
  }
}
