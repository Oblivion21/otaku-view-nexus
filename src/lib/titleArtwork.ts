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
  anime: Pick<JikanAnime, "images"> | null | undefined,
  variant: TitleArtworkVariant,
): string | null {
  return resolveTmdbTitleArtworkUrl(artwork, variant) || resolveJikanTitleArtworkUrl(anime, variant);
}

export function resolveJikanTitleArtworkUrl(
  anime: Pick<JikanAnime, "images"> | null | undefined,
  variant: TitleArtworkVariant,
): string | null {
  const preferredUrls = variant === "banner"
    ? [
        anime?.images?.webp?.large_image_url,
        anime?.images?.jpg?.large_image_url,
        anime?.images?.webp?.image_url,
        anime?.images?.jpg?.image_url,
      ]
    : [
        anime?.images?.webp?.large_image_url,
        anime?.images?.jpg?.large_image_url,
        anime?.images?.webp?.image_url,
        anime?.images?.jpg?.image_url,
      ];

  for (const url of preferredUrls) {
    if (typeof url === "string" && url.trim()) {
      return url;
    }
  }

  return null;
}

export function hasAnyTitleArtwork(
  anime: Pick<JikanAnime, "images"> | null | undefined,
  artwork: TmdbAnimeArtwork | null | undefined,
): boolean {
  return Boolean(
    resolveTitleArtworkUrl(artwork, anime, "poster") ||
    resolveTitleArtworkUrl(artwork, anime, "banner"),
  );
}
