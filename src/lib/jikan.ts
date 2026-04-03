const BASE_URL = "https://api.jikan.moe/v4";

const SEARCH_ANIME_TYPES = ["tv", "movie", "ova", "special", "ona", "music"] as const;
const SEARCH_ANIME_STATUSES = ["airing", "complete", "upcoming"] as const;
const SEARCH_ANIME_ORDER_BY = ["score", "popularity", "start_date"] as const;
const SEARCH_ANIME_SORTS = ["desc", "asc"] as const;

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
  score?: number | null;
  filler: boolean;
  recap: boolean;
}

export interface JikanVideoEpisode {
  mal_id: number;
  title: string;
  episode: string;
  url: string;
  images: {
    jpg: {
      image_url: string;
    };
  };
}

export interface JikanPagination {
  last_visible_page: number;
  has_next_page: boolean;
  current_page: number;
}

export type AnimeSearchType = (typeof SEARCH_ANIME_TYPES)[number];
export type AnimeSearchStatus = (typeof SEARCH_ANIME_STATUSES)[number];
export type AnimeSearchOrderBy = (typeof SEARCH_ANIME_ORDER_BY)[number];
export type AnimeSearchSort = (typeof SEARCH_ANIME_SORTS)[number];

export interface AnimeSearchFilters {
  query?: string;
  page?: number;
  type?: AnimeSearchType;
  status?: AnimeSearchStatus;
  genreId?: number;
  yearFrom?: number;
  yearTo?: number;
  minScore?: number;
  maxScore?: number;
  orderBy?: AnimeSearchOrderBy;
  sort?: AnimeSearchSort;
}

interface JikanResponse<T> {
  data: T;
  pagination?: JikanPagination;
}

type JikanVideoEpisodesPayload = {
  episodes?: unknown;
};

const ALLOWED_GENRE_NAMES = new Set([
  "Action",
  "Adventure",
  "Award Winning",
  "Comedy",
  "Drama",
  "Fantasy",
  "Gourmet",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Suspense",
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

function parsePositiveInt(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function parseYear(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1900 && parsed <= 2100 ? parsed : undefined;
}

function parseScore(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return Math.min(Math.max(parsed, 0), 10);
}

function isSearchAnimeType(value: unknown): value is AnimeSearchType {
  return typeof value === "string" && SEARCH_ANIME_TYPES.includes(value as AnimeSearchType);
}

function isSearchAnimeStatus(value: unknown): value is AnimeSearchStatus {
  return typeof value === "string" && SEARCH_ANIME_STATUSES.includes(value as AnimeSearchStatus);
}

function isSearchAnimeOrderBy(value: unknown): value is AnimeSearchOrderBy {
  return typeof value === "string" && SEARCH_ANIME_ORDER_BY.includes(value as AnimeSearchOrderBy);
}

function isSearchAnimeSort(value: unknown): value is AnimeSearchSort {
  return typeof value === "string" && SEARCH_ANIME_SORTS.includes(value as AnimeSearchSort);
}

export function normalizeAnimeSearchFilters(filters: AnimeSearchFilters = {}): AnimeSearchFilters {
  const query = typeof filters.query === "string" ? filters.query.trim() : "";
  const page = parsePositiveInt(filters.page) ?? 1;
  const type = isSearchAnimeType(filters.type) ? filters.type : undefined;
  const status = isSearchAnimeStatus(filters.status) ? filters.status : undefined;
  const genreId = parsePositiveInt(filters.genreId);
  let yearFrom = parseYear(filters.yearFrom);
  let yearTo = parseYear(filters.yearTo);
  let minScore = parseScore(filters.minScore);
  let maxScore = parseScore(filters.maxScore);
  const orderBy = isSearchAnimeOrderBy(filters.orderBy) ? filters.orderBy : undefined;
  const sort = isSearchAnimeSort(filters.sort) ? filters.sort : undefined;

  if (yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo) {
    [yearFrom, yearTo] = [yearTo, yearFrom];
  }

  if (minScore !== undefined && maxScore !== undefined && minScore > maxScore) {
    [minScore, maxScore] = [maxScore, minScore];
  }

  return {
    ...(query ? { query } : {}),
    page,
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    ...(genreId ? { genreId } : {}),
    ...(yearFrom !== undefined ? { yearFrom } : {}),
    ...(yearTo !== undefined ? { yearTo } : {}),
    ...(minScore !== undefined ? { minScore } : {}),
    ...(maxScore !== undefined ? { maxScore } : {}),
    ...(orderBy ? { orderBy } : {}),
    ...(sort ? { sort } : {}),
  };
}

export function hasAnimeSearchCriteria(filters: AnimeSearchFilters = {}) {
  const normalized = normalizeAnimeSearchFilters(filters);
  return Object.entries(normalized).some(([key, value]) => key !== "page" && value !== undefined && value !== "");
}

function normalizeJikanVideoEpisode(value: unknown): JikanVideoEpisode | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const episode = value as Record<string, unknown>;
  const malId = Number(episode.mal_id);
  if (!Number.isInteger(malId) || malId <= 0) {
    return null;
  }

  return {
    mal_id: malId,
    title: typeof episode.title === "string" ? episode.title : "",
    episode: typeof episode.episode === "string" ? episode.episode : "",
    url: typeof episode.url === "string" ? episode.url : "",
    images: {
      jpg: {
        image_url: typeof episode.images === "object" && episode.images !== null
          && typeof (episode.images as { jpg?: { image_url?: unknown } }).jpg?.image_url === "string"
          ? (episode.images as { jpg: { image_url: string } }).jpg.image_url
          : "",
      },
    },
  };
}

export function isBlockedAnime(anime: { genres?: GenreLike[] } | null | undefined): boolean {
  if (!anime?.genres?.length) return true;
  return !anime.genres.some((genre) => ALLOWED_GENRE_NAMES.has(genre.name));
}

function filterAnimeList<T extends { genres?: GenreLike[] }>(animeList: T[]): T[] {
  return animeList.filter((anime) => !isBlockedAnime(anime));
}

export function getVisibleGenres<T extends { genres?: GenreLike[] } | null | undefined>(
  anime: T,
): GenreLike[] {
  return (anime?.genres || []).filter((genre) => ALLOWED_GENRE_NAMES.has(genre.name));
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

export async function getAnimeVideoEpisodes(id: number) {
  const response = await fetchJikan<JikanVideoEpisodesPayload>(`/anime/${id}/videos`);
  const episodes = Array.isArray(response.data?.episodes) ? response.data.episodes : [];
  return episodes
    .map(normalizeJikanVideoEpisode)
    .filter((episode): episode is JikanVideoEpisode => Boolean(episode));
}

export async function searchAnime(filters: AnimeSearchFilters = {}) {
  const normalized = normalizeAnimeSearchFilters(filters);
  const params = new URLSearchParams({
    page: String(normalized.page ?? 1),
    limit: "24",
    sfw: "true",
  });

  if (normalized.query) params.set("q", normalized.query);
  if (normalized.type) params.set("type", normalized.type);
  if (normalized.status) params.set("status", normalized.status);
  if (normalized.genreId) params.set("genres", String(normalized.genreId));
  if (normalized.yearFrom) params.set("start_date", `${normalized.yearFrom}-01-01`);
  if (normalized.yearTo) params.set("end_date", `${normalized.yearTo}-12-31`);
  if (normalized.minScore !== undefined) params.set("min_score", String(normalized.minScore));
  if (normalized.maxScore !== undefined) params.set("max_score", String(normalized.maxScore));
  if (normalized.orderBy) params.set("order_by", normalized.orderBy);
  if (normalized.orderBy && normalized.sort) params.set("sort", normalized.sort);

  const response = await fetchJikan<JikanAnime[]>(`/anime?${params.toString()}`);
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
    data: response.data.filter((item) => {
      const genres = item.entry?.genres;
      if (!Array.isArray(genres) || genres.length === 0) {
        return true;
      }
      return !isBlockedAnime(item.entry);
    }),
  };
}

export async function getGenres() {
  const response = await fetchJikan<{ mal_id: number; name: string; count: number }[]>("/genres/anime");
  return {
    ...response,
    data: response.data.filter((genre) => ALLOWED_GENRE_NAMES.has(genre.name)),
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
  "Award Winning": "Award Winning",
  Comedy: "كوميدي",
  Drama: "دراما",
  Fantasy: "فانتازيا",
  Gourmet: "Gourmet",
  Horror: "رعب",
  Mystery: "غموض",
  Romance: "رومانسي",
  "Sci-Fi": "خيال علمي",
  "Slice of Life": "شريحة من الحياة",
  Sports: "رياضة",
  Suspense: "Suspense",
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
