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

async function fetchJikan<T>(endpoint: string): Promise<JikanResponse<T>> {
  const res = await fetch(`${BASE_URL}${endpoint}`);
  if (!res.ok) throw new Error(`Jikan API error: ${res.status}`);
  return res.json();
}

export async function getTopAnime(page = 1, filter?: string) {
  const params = new URLSearchParams({ page: String(page), limit: "24" });
  if (filter) params.set("filter", filter);
  return fetchJikan<JikanAnime[]>(`/top/anime?${params}`);
}

export async function getSeasonNow(page = 1) {
  return fetchJikan<JikanAnime[]>(`/seasons/now?page=${page}&limit=24`);
}

export async function getAnimeById(id: number) {
  return fetchJikan<JikanAnime>(`/anime/${id}/full`);
}

export async function getAnimeEpisodes(id: number, page = 1) {
  return fetchJikan<JikanEpisode[]>(`/anime/${id}/episodes?page=${page}`);
}

export async function searchAnime(query: string, page = 1) {
  return fetchJikan<JikanAnime[]>(`/anime?q=${encodeURIComponent(query)}&page=${page}&limit=24&sfw=true`);
}

export async function getAnimeByGenre(genreId: number, page = 1) {
  return fetchJikan<JikanAnime[]>(`/anime?genres=${genreId}&page=${page}&limit=24&order_by=score&sort=desc&sfw=true`);
}

export async function getGenres() {
  return fetchJikan<{ mal_id: number; name: string; count: number }[]>("/genres/anime");
}

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
