import type { AniListMedia } from "@/lib/anilist";

export const VIDEASY_COLOR_HEX = "00D0FF";
const VIDEASY_BASE_URL = "https://player.videasy.net";

export function buildVideasyAnimeEmbedUrl(
  media: AniListMedia | null | undefined,
  animeType: string | null | undefined,
  episodeNumber: number,
): string | null {
  if (!media?.id) {
    return null;
  }

  const params = new URLSearchParams({
    color: VIDEASY_COLOR_HEX,
  });

  if (animeType === "Movie") {
    return `${VIDEASY_BASE_URL}/anime/${media.id}?${params.toString()}`;
  }

  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) {
    return null;
  }

  return `${VIDEASY_BASE_URL}/anime/${media.id}/${episodeNumber}?${params.toString()}`;
}

export function getVideasyUnavailableReason(
  media: AniListMedia | null | undefined,
  animeType: string | null | undefined,
  episodeNumber: number,
): string {
  if (!media) {
    return "Main Player could not resolve this title. Switched to Backup Player.";
  }

  if (animeType !== "Movie" && (!Number.isFinite(episodeNumber) || episodeNumber <= 0)) {
    return "Main Player needs a valid episode number. Switched to Backup Player.";
  }

  return "Main Player is unavailable for this episode. Switched to Backup Player.";
}
