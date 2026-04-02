const BASE_URL = "https://api.jikan.moe/v4";

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_japanese: string;
  title_english: string | null;
  images: {
    jpg: { image_url: string; large_image_url: string };
    webp: { image_url: string; large_image_url: string };
  };
  trailer: {
    youtube_id: string | null;
    url: string | null;
    embed_url: string | null;
  };
  synopsis: string | null;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  episodes: number | null;
  status: string;
  rating: string | null;
  type: string | null;
  source: string | null;
  duration: string | null;
  aired: {
    from: string | null;
    to: string | null;
    string: string;
  };
  season: string | null;
  year: number | null;
  studios: { mal_id: number; name: string }[];
  genres: { mal_id: number; name: string }[];
}

export interface JikanEpisode {
  mal_id: number;
  title: string;
  title_japanese: string | null;
  title_romanji: string | null;
  aired: string | null;
  filler: boolean;
  recap: boolean;
}

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
}

interface JikanResponse<T> {
  data: T;
  pagination?: JikanPagination;
}

const BLOCKED_GENRE_NAMES = new Set([
  "Ecchi",
  "Hentai",
  "Boys Love",
  "Girls Love",
  "Avant Garde",
  "Erotica",
]);

type GenreLike = {
  mal_id: number;
  name: string;
};

async function fetchJikan<T>(endpoint: string): Promise<JikanResponse<T>> {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) throw new Error(`Jikan API error: ${res.status}`);
  return res.json();
}

export function isBlockedAnime(anime: { genres?: GenreLike[] } | null | undefined): boolean {
  if (!anime?.genres?.length) return false;
  return anime.genres.some((genre) => BLOCKED_GENRE_NAMES.has(genre.name));
}

function filterAnimeList<T extends { genres?: GenreLike[] }>(animeList: T[]): T[] {
  return animeList.filter((anime) => !isBlockedAnime(anime));
}

export async function getTopAnime(page = 1, filter?: string) {
  const params = new URLSearchParams({ page: String(page), limit: "24" });
  if (filter) params.set("filter", filter);
  const response = await fetchJikan<JikanAnime[]>(`/top/anime?${params}`);
  return { ...response, data: filterAnimeList(response.data) };
}

export async function getSeasonNow(page = 1) {
  const response = await fetchJikan<JikanAnime[]>(`/seasons/now?page=${page}&limit=24`);
  return { ...response, data: filterAnimeList(response.data) };
}

export async function getAnimeById(id: number) {
  return fetchJikan<JikanAnime>(`/anime/${id}/full`);
}

export async function getAnimeEpisodes(id: number, page = 1) {
  return fetchJikan<JikanEpisode[]>(`/anime/${id}/episodes?page=${page}`);
}

export async function searchAnime(query: string, page = 1) {
  const response = await fetchJikan<JikanAnime[]>(`/anime?q=${encodeURIComponent(query)}&page=${page}&limit=24&sfw=true`);
  return { ...response, data: filterAnimeList(response.data) };
}

export async function getAnimeByGenre(genreId: number, page = 1) {
  const response = await fetchJikan<JikanAnime[]>(`/anime?genres=${genreId}&page=${page}&limit=24&order_by=score&sort=desc&sfw=true`);
  return { ...response, data: filterAnimeList(response.data) };
}

export async function getTopMovies(page = 1) {
  const response = await fetchJikan<JikanAnime[]>(`/top/anime?type=movie&page=${page}&limit=24`);
  return { ...response, data: filterAnimeList(response.data) };
}

export async function getAnimeRecommendations(id: number) {
  const response = await fetchJikan<{ entry: JikanAnime; votes: number }[]>(`/anime/${id}/recommendations`);
  return {
    ...response,
    data: response.data.filter((item) => !isBlockedAnime(item.entry)),
  };
}

export async function getGenres() {
  const response = await fetchJikan<{ mal_id: number; name: string; count: number }[]>("/genres/anime");
  return {
    ...response,
    data: response.data.filter((genre) => !BLOCKED_GENRE_NAMES.has(genre.name)),
  };
}

export interface JikanCharacterEntry {
  character: {
    mal_id: number;
    name: string;
    images: { jpg: { image_url: string }; webp: { image_url: string; small_image_url: string } };
  };
  role: string;
  voice_actors: {
    person: {
      mal_id: number;
      name: string;
      images: { jpg: { image_url: string } };
    };
    language: string;
  }[];
}

export interface JikanThemes {
  openings: string[];
  endings: string[];
}

export async function getAnimeCharacters(id: number) {
  return fetchJikan<JikanCharacterEntry[]>(`/anime/${id}/characters`);
}

export async function getAnimeThemes(id: number) {
  return fetchJikan<JikanThemes>(`/anime/${id}/themes`);
}

export interface JikanRelationEntry {
  relation: string;
  entry: { mal_id: number; type: string; name: string; url: string }[];
}

export async function getAnimeRelations(id: number) {
  return fetchJikan<JikanRelationEntry[]>(`/anime/${id}/relations`);
}

export const RELATION_TYPE_AR: Record<string, string> = {
  Sequel: "تتمة",
  Prequel: "ما قبل",
  "Side Story": "قصة جانبية",
  "Alternative Version": "نسخة بديلة",
  "Alternative Setting": "إطار بديل",
  Summary: "ملخص",
  "Full Story": "القصة الكاملة",
  "Spin-off": "عمل مشتق",
  "Parent Story": "القصة الأصلية",
  Character: "شخصية",
  Other: "أخرى",
};

export const STATUS_MAP: Record<string, string> = {
  "Currently Airing": "يعرض حالياً",
  "Finished Airing": "مكتمل",
  "Not yet aired": "لم يعرض بعد",
};

export const TYPE_MAP: Record<string, string> = {
  TV: "مسلسل",
  Movie: "فيلم",
  OVA: "أوفا",
  ONA: "أونا",
  Special: "خاص",
  Music: "موسيقى",
};

export const GENRE_AR: Record<string, string> = {
  Action: "أكشن",
  Adventure: "مغامرة",
  Comedy: "كوميدي",
  Drama: "دراما",
  Fantasy: "فانتازيا",
  Horror: "رعب",
  Mystery: "غموض",
  Romance: "رومانسي",
  "Sci-Fi": "خيال علمي",
  "Slice of Life": "شريحة من الحياة",
  Sports: "رياضة",
  Supernatural: "خارق",
  Thriller: "إثارة",
  Ecchi: "إيتشي",
  Mecha: "ميكا",
  Music: "موسيقى",
  Psychological: "نفسي",
  School: "مدرسي",
  Historical: "تاريخي",
};

// Voice Actor / Person interfaces and functions
export interface JikanPerson {
  mal_id: number;
  name: string;
  given_name: string | null;
  family_name: string | null;
  images: {
    jpg: { image_url: string };
  };
  birthday: string | null;
  favorites: number;
  about: string | null;
}

export interface JikanVoiceActingRole {
  role: string; // e.g., "Main", "Supporting"
  anime: {
    mal_id: number;
    title: string;
    images: {
      jpg: { image_url: string; large_image_url: string };
      webp: { image_url: string; large_image_url: string };
    };
  };
  character: {
    mal_id: number;
    name: string;
    images: {
      jpg: { image_url: string };
      webp: { image_url: string };
    };
  };
}

export async function getPersonById(id: number) {
  return fetchJikan<JikanPerson>(`/people/${id}`);
}

export async function getPersonVoices(id: number) {
  return fetchJikan<JikanVoiceActingRole[]>(`/people/${id}/voices`);
}
