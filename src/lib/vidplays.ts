import type { AniListMedia } from "@/lib/anilist";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";

export const VIDPLAYS_BASE_URL = "https://vidplays.fun";
export const VIDPLAYS_DEFAULT_ANIME_AUDIO_MODE = "sub";

type VidplaysServer = "core" | "fast" | "pro";

type VidplaysOptions = {
  autoplay?: boolean;
  startAt?: number | null;
  server?: VidplaysServer | null;
};

function buildVidplaysParams(options: VidplaysOptions = {}) {
  const params = new URLSearchParams();

  if (options.autoplay ?? true) {
    params.set("autoplay", "true");
  }

  if (typeof options.startAt === "number" && Number.isFinite(options.startAt) && options.startAt >= 0) {
    params.set("startAt", String(Math.floor(options.startAt)));
  }

  if (options.server) {
    params.set("server", options.server);
  }

  return params;
}

function withVidplaysParams(path: string, options?: VidplaysOptions) {
  const params = buildVidplaysParams(options);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function buildVidplaysMovieEmbedUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  options?: VidplaysOptions,
) {
  if (!artwork?.tmdbId || artwork.mediaType !== "movie") {
    return null;
  }

  return withVidplaysParams(`${VIDPLAYS_BASE_URL}/embed/movie/${artwork.tmdbId}`, options);
}

export function buildVidplaysTvEmbedUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  seasonNumber: number | null | undefined,
  episodeNumber: number,
  options?: VidplaysOptions,
) {
  if (!artwork?.tmdbId || artwork.mediaType !== "tv") {
    return null;
  }

  if (!Number.isFinite(seasonNumber) || !seasonNumber || seasonNumber <= 0) {
    return null;
  }

  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) {
    return null;
  }

  return withVidplaysParams(
    `${VIDPLAYS_BASE_URL}/embed/tv/${artwork.tmdbId}/${seasonNumber}/${episodeNumber}`,
    options,
  );
}

export function buildVidplaysAnimeEmbedUrl(
  media: AniListMedia | null | undefined,
  episodeNumber: number,
  audioMode: "sub" | "dub" = VIDPLAYS_DEFAULT_ANIME_AUDIO_MODE,
  options?: VidplaysOptions,
) {
  if (!media?.id) {
    return null;
  }

  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) {
    return null;
  }

  return withVidplaysParams(
    `${VIDPLAYS_BASE_URL}/embed/anime/${media.id}/${episodeNumber}/${audioMode}`,
    options,
  );
}

export function resolveVidplaysPlayerUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  media: AniListMedia | null | undefined,
  animeType: string | null | undefined,
  episodeNumber: number,
  options?: VidplaysOptions,
) {
  if (animeType === "Movie") {
    return buildVidplaysMovieEmbedUrl(artwork, options);
  }

  return buildVidplaysAnimeEmbedUrl(media, episodeNumber, VIDPLAYS_DEFAULT_ANIME_AUDIO_MODE, options);
}
