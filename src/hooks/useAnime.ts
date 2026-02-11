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
} from "@/lib/jikan";

export function useTopAnime(page = 1, filter?: string) {
  return useQuery({
    queryKey: ["top-anime", page, filter],
    queryFn: () => getTopAnime(page, filter),
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

export function useAnimeById(id: number) {
  return useQuery({
    queryKey: ["anime", id],
    queryFn: () => getAnimeById(id),
    enabled: !!id,
    staleTime: 10 * 60 * 1000,
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

export function useSearchAnime(query: string, page = 1) {
  return useQuery({
    queryKey: ["search-anime", query, page],
    queryFn: () => searchAnime(query, page),
    enabled: query.length >= 2,
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
