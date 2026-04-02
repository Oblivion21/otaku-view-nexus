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

function resolveJikanTitleArtworkUrl(
  anime: JikanAnime | null | undefined,
  variant: TitleArtworkVariant,
): string | null {
  if (!anime) {
    return null;
  }

  const posterCandidates = [
    anime.images?.webp?.large_image_url,
    anime.images?.jpg?.large_image_url,
    anime.images?.webp?.image_url,
    anime.images?.jpg?.image_url,
  ];

  const posterUrl = posterCandidates.find(Boolean) || null;
  if (!posterUrl) {
    return null;
  }

  if (variant === "banner") {
    return posterUrl;
  }

  return posterUrl;
}

export function resolveTitleArtworkUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  anime: JikanAnime | null | undefined,
  variant: TitleArtworkVariant,
): string | null {
  return resolveTmdbTitleArtworkUrl(artwork, variant) || resolveJikanTitleArtworkUrl(anime, variant);
}
