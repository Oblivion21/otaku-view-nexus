import type { TmdbAnimeArtwork } from "@/lib/tmdb";

export const VIDFAST_THEME_HEX = "#00D0FF";
const VIDFAST_BASE_URL = "https://vidfast.pro";

export function buildVidFastEmbedUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  episodeNumber: number,
): string | null {
  if (!artwork?.tmdbId) {
    return null;
  }

  const params = new URLSearchParams({
    autoPlay: "true",
    theme: VIDFAST_THEME_HEX,
  });

  if (artwork.mediaType === "movie") {
    return `${VIDFAST_BASE_URL}/movie/${artwork.tmdbId}?${params.toString()}`;
  }

  if (!artwork.seasonNumber || episodeNumber <= 0) {
    return null;
  }

  return `${VIDFAST_BASE_URL}/tv/${artwork.tmdbId}/${artwork.seasonNumber}/${episodeNumber}?${params.toString()}`;
}

export function getVidFastUnavailableReason(
  artwork: TmdbAnimeArtwork | null | undefined,
  episodeNumber: number,
): string {
  if (!artwork) {
    return "Main Player is unavailable for this episode. Switched to Backup Player.";
  }

  if (artwork.mediaType === "tv" && !artwork.seasonNumber) {
    return "Main Player could not map this anime season. Switched to Backup Player.";
  }

  if (artwork.mediaType === "tv" && episodeNumber <= 0) {
    return "Main Player needs a valid episode number. Switched to Backup Player.";
  }

  return "Main Player is unavailable for this episode. Switched to Backup Player.";
}
