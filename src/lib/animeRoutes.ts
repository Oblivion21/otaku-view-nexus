type AnimeRouteInput = {
  mal_id: number;
  title?: string | null;
  title_english?: string | null;
  title_japanese?: string | null;
};

export function slugifyAnimeTitle(title: string | null | undefined) {
  const normalized = (title || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "anime";
}

export function getAnimeDetailPath(anime: AnimeRouteInput) {
  const title = anime.title_english || anime.title || anime.title_japanese || "anime";
  return `/anime/${slugifyAnimeTitle(title)}-${anime.mal_id}`;
}

export function getAnimeIdFromRouteParam(value: string | undefined) {
  if (!value) return null;

  const directId = Number(value);
  if (Number.isInteger(directId) && directId > 0) {
    return directId;
  }

  const matchedId = value.match(/(\d+)$/)?.[1];
  if (!matchedId) {
    return null;
  }

  const parsedId = Number(matchedId);
  return Number.isInteger(parsedId) && parsedId > 0 ? parsedId : null;
}
