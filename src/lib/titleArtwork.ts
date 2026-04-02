import type { TmdbAnimeArtwork } from "@/lib/tmdb";

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
