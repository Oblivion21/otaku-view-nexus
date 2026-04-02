import type { AniListMedia } from "@/lib/anilist";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";

export const VIDEASY_COLOR_HEX = "00D0FF";
const VIDEASY_BASE_URL = "https://player.videasy.net";

function buildVideasyParams() {
  return new URLSearchParams({
    color: VIDEASY_COLOR_HEX,
    autoplay: "1",
  });
}

export function buildVideasyMovieEmbedUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
): string | null {
  if (!artwork?.tmdbId || artwork.mediaType !== "movie") {
    return null;
  }

  return `${VIDEASY_BASE_URL}/movie/${artwork.tmdbId}?${buildVideasyParams().toString()}`;
}

export function buildVideasyAnimeEmbedUrl(
  media: AniListMedia | null | undefined,
  animeType: string | null | undefined,
  episodeNumber: number,
): string | null {
  if (!media?.id) {
    return null;
  }

  const params = buildVideasyParams();

  if (animeType === "Movie") {
    return `${VIDEASY_BASE_URL}/anime/${media.id}?${params.toString()}`;
  }

  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) {
    return null;
  }

  return `${VIDEASY_BASE_URL}/anime/${media.id}/${episodeNumber}?${params.toString()}`;
}

export function resolveVideasyMainPlayerUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  media: AniListMedia | null | undefined,
  animeType: string | null | undefined,
  episodeNumber: number,
): string | null {
  if (animeType === "Movie") {
    return buildVideasyMovieEmbedUrl(artwork) ?? buildVideasyAnimeEmbedUrl(media, animeType, episodeNumber);
  }

  return buildVideasyAnimeEmbedUrl(media, animeType, episodeNumber);
}

export function getVideasyUnavailableReason(
  artwork: TmdbAnimeArtwork | null | undefined,
  media: AniListMedia | null | undefined,
  animeType: string | null | undefined,
  episodeNumber: number,
): string {
  if (animeType === "Movie") {
    if (artwork?.tmdbId && artwork.mediaType === "movie") {
      return "Main Player is unavailable for this movie. Switched to Backup Player.";
    }

    if (media?.id) {
      return "Main Player could not resolve a movie source, using AniList fallback. Switched to Backup Player.";
    }
  }

  if (!media && !(artwork?.tmdbId && artwork.mediaType === "movie")) {
    return "Main Player could not resolve this title. Switched to Backup Player.";
  }

  if (animeType !== "Movie" && (!Number.isFinite(episodeNumber) || episodeNumber <= 0)) {
    return "Main Player needs a valid episode number. Switched to Backup Player.";
  }

  return "Main Player is unavailable for this episode. Switched to Backup Player.";
}
