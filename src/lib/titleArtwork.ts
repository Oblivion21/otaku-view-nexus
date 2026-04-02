import type { TmdbAnimeArtwork } from "@/lib/tmdb";
import type { JikanAnime } from "@/lib/jikan";

export type TitleArtworkVariant = "banner" | "poster";

export function resolveTmdbTitleArtworkUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  variant: TitleArtworkVariant,
): string | null {
  if (!artwork) {
    return null;
  }

  if (variant === "banner") {
    return artwork.backdropUrl || artwork.posterUrl || null;
  }

  return artwork.posterUrl || artwork.backdropUrl || null;
}

export function resolveTitleArtworkUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  _anime: Pick<JikanAnime, "images"> | null | undefined,
  variant: TitleArtworkVariant,
): string | null {
  return resolveTmdbTitleArtworkUrl(artwork, variant);
}
