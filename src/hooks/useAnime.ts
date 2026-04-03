import { useQuery } from "@tanstack/react-query";
import {
  getTopAnime,
  getSeasonNow,
  getAnimeById,
  getAnimeEpisodes,
  searchAnime,
  getGenres,
  getAnimeByGenre,
  getTopMovies,
  getAnimeRecommendations,
  getAnimeCharacters,
  getAnimeThemes,
  getAnimeRelations,
  getPersonById,
  getPersonVoices,
  hasAnimeSearchCriteria,
  normalizeAnimeSearchFilters,
  type JikanAnime,
  type AnimeSearchFilters,
} from "@/lib/jikan";
import { getAnimeAniListMedia } from "@/lib/anilist";
import { getAnimeTmdbArtwork } from "@/lib/tmdb";
import { getMultipleAnimeTmdbArtwork } from "@/lib/tmdb";
import { getAnimeEpisodeStills } from "@/lib/tmdb";
import { getAnimeEpisodePreviewImages } from "@/lib/tmdb";
import type { AnimeArtworkLookup } from "@/lib/tmdb";
import { getFeaturedCarouselItems } from "@/lib/featuredCarousel";

export function useTopAnime(page = 1, filter?: string) {
  return useQuery({
    queryKey: ["top-anime", page, filter],
    queryFn: () => getTopAnime(page, filter),
    staleTime: 5 * 60 * 1000,
  });
}

export function useFeaturedCarousel() {
  return useQuery({
    queryKey: ["featured-carousel"],
    queryFn: getFeaturedCarouselItems,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSeasonNow(page = 1) {
  return useQuery({
    queryKey: ["season-now", page],
    queryFn: () => getSeasonNow(page),
    staleTime: 5 * 60 * 1000,
  });
}

interface AnimeByIdOptions {
  enabled?: boolean;
  retry?: boolean | number;
  staleTime?: number;
}

export function useAnimeById(id: number, options?: AnimeByIdOptions) {
  return useQuery({
    queryKey: ["anime", id],
    queryFn: () => getAnimeById(id),
    enabled: options?.enabled ?? !!id,
    staleTime: options?.staleTime ?? 10 * 60 * 1000,
    retry: options?.retry ?? 3,
  });
}

export function useAnimeTmdbArtwork(
  anime: JikanAnime | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["anime-tmdb-artwork", anime?.mal_id],
    queryFn: () => getAnimeTmdbArtwork(anime),
    enabled: enabled && Boolean(anime?.mal_id),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useMultipleAnimeTmdbArtwork(
  animeList: AnimeArtworkLookup[] | null | undefined,
  enabled = true,
) {
  const malIds = (animeList || [])
    .map((anime) => anime?.mal_id)
    .filter((malId): malId is number => Boolean(malId))
    .sort((a, b) => a - b);

  return useQuery({
    queryKey: ["multiple-anime-tmdb-artwork", malIds],
    queryFn: () => getMultipleAnimeTmdbArtwork(animeList || []),
    enabled: enabled && malIds.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useAnimeEpisodeStills(
  artwork: Awaited<ReturnType<typeof getAnimeTmdbArtwork>>,
  episodeNumbers: number[],
  enabled = true,
) {
  const normalizedEpisodeNumbers = Array.from(
    new Set(
      episodeNumbers
        .map((episodeNumber) => Number(episodeNumber))
        .filter((episodeNumber) => Number.isInteger(episodeNumber) && episodeNumber > 0),
    ),
  ).sort((a, b) => a - b);

  return useQuery({
    queryKey: [
      "anime-episode-stills",
      artwork?.tmdbId,
      artwork?.mediaType,
      artwork?.seasonNumber,
      normalizedEpisodeNumbers,
    ],
    queryFn: () => getAnimeEpisodeStills(artwork, normalizedEpisodeNumbers),
    enabled: enabled
      && Boolean(artwork?.tmdbId)
      && artwork?.mediaType === "tv"
      && Boolean(artwork?.seasonNumber)
      && normalizedEpisodeNumbers.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useAnimeEpisodePreviewImages(
  animeId: number,
  artwork: Awaited<ReturnType<typeof getAnimeTmdbArtwork>>,
  episodeNumbers: number[],
  enabled = true,
) {
  const normalizedEpisodeNumbers = Array.from(
    new Set(
      episodeNumbers
        .map((episodeNumber) => Number(episodeNumber))
        .filter((episodeNumber) => Number.isInteger(episodeNumber) && episodeNumber > 0),
    ),
  ).sort((a, b) => a - b);

  return useQuery({
    queryKey: [
      "anime-episode-preview-images",
      animeId,
      artwork?.tmdbId,
      artwork?.mediaType,
      artwork?.seasonNumber,
      normalizedEpisodeNumbers,
    ],
    queryFn: () => getAnimeEpisodePreviewImages(animeId, artwork, normalizedEpisodeNumbers),
    enabled: enabled
      && Boolean(animeId)
      && normalizedEpisodeNumbers.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useAnimeAniListMedia(
  anime: JikanAnime | null | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["anime-anilist-media", anime?.mal_id],
    queryFn: () => getAnimeAniListMedia(anime?.mal_id),
    enabled: enabled && Boolean(anime?.mal_id),
    staleTime: 24 * 60 * 60 * 1000,
  });
}

export function useAnimeEpisodes(id: number, page = 1) {
  return useQuery({
    queryKey: ["anime-episodes", id, page],
    queryFn: () => getAnimeEpisodes(id, page),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useSearchAnime(filters: AnimeSearchFilters) {
  const normalizedFilters = normalizeAnimeSearchFilters(filters);

  return useQuery({
    queryKey: ["search-anime", normalizedFilters],
    queryFn: () => searchAnime(normalizedFilters),
    enabled: hasAnimeSearchCriteria(normalizedFilters)
      && ((normalizedFilters.query?.length ?? 0) >= 2 || hasAnimeSearchCriteria({
        ...normalizedFilters,
        query: undefined,
      })),
    staleTime: 3 * 60 * 1000,
  });
}

export function useGenres() {
  return useQuery({
    queryKey: ["genres"],
    queryFn: getGenres,
    staleTime: 60 * 60 * 1000,
  });
}

export function useAnimeByGenre(genreId: number, page = 1) {
  return useQuery({
    queryKey: ["anime-genre", genreId, page],
    queryFn: () => getAnimeByGenre(genreId, page),
    enabled: !!genreId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTopMovies(page = 1) {
  return useQuery({
    queryKey: ["top-movies", page],
    queryFn: () => getTopMovies(page),
    staleTime: 5 * 60 * 1000,
  });
}

export function useAnimeRecommendations(id: number) {
  return useQuery({
    queryKey: ["anime-recommendations", id],
    queryFn: () => getAnimeRecommendations(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useAnimeCharacters(id: number) {
  return useQuery({
    queryKey: ["anime-characters", id],
    queryFn: () => getAnimeCharacters(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useAnimeThemes(id: number) {
  return useQuery({
    queryKey: ["anime-themes", id],
    queryFn: () => getAnimeThemes(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function useAnimeRelations(id: number) {
  return useQuery({
    queryKey: ["anime-relations", id],
    queryFn: () => getAnimeRelations(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function usePersonById(id: number) {
  return useQuery({
    queryKey: ["person", id],
    queryFn: () => getPersonById(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}

export function usePersonVoices(id: number) {
  return useQuery({
    queryKey: ["person-voices", id],
    queryFn: () => getPersonVoices(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
  });
}
