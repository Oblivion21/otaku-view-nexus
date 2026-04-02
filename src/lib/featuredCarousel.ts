import type { JikanAnime } from "@/lib/jikan";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export type FeaturedCarouselAnime = Pick<
  JikanAnime,
  | "mal_id"
  | "title"
  | "title_japanese"
  | "title_english"
  | "images"
  | "synopsis"
  | "score"
  | "episodes"
  | "type"
  | "year"
  | "aired"
  | "genres"
>;

type FeaturedCarouselResponse = {
  items?: FeaturedCarouselAnime[];
  error?: string;
};

export async function getFeaturedCarouselItems(): Promise<FeaturedCarouselAnime[]> {
  if (!supabaseUrl || !supabaseAnonKey) {
    return [];
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/featured-carousel`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Featured carousel request failed: ${response.status}`);
  }

  const payload = await response.json() as FeaturedCarouselResponse;
  if (payload.error) {
    throw new Error(payload.error);
  }

  return Array.isArray(payload.items) ? payload.items : [];
}
