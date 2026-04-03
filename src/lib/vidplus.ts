import type { AniListMedia } from "@/lib/anilist";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";

export const VIDPLUS_BASE_URL = "https://player.vidplus.to";

type VidplusServer = string;

type VidplusOptions = {
  autoplay?: boolean;
  dub?: boolean;
  chromecast?: boolean;
  episodeList?: boolean;
  server?: VidplusServer | null;
  serverIcon?: boolean;
};

function buildVidplusParams(options: VidplusOptions = {}) {
  const params = new URLSearchParams();

  if (options.autoplay ?? true) {
    params.set("autoplay", "true");
  }

  if (typeof options.dub === "boolean") {
    params.set("dub", String(options.dub));
  }

  params.set("episodelist", String(options.episodeList ?? false));
  params.set("servericon", String(options.serverIcon ?? false));
  params.set("chromecast", String(options.chromecast ?? false));

  if (options.server) {
    params.set("server", options.server);
  }

  return params;
}

function withVidplusParams(path: string, options?: VidplusOptions) {
  const params = buildVidplusParams(options);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

export function buildVidplusMovieEmbedUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  options?: VidplusOptions,
) {
  if (!artwork?.tmdbId || artwork.mediaType !== "movie") {
    return null;
  }

  return withVidplusParams(`${VIDPLUS_BASE_URL}/embed/movie/${artwork.tmdbId}`, options);
}

export function buildVidplusTvEmbedUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  seasonNumber: number | null | undefined,
  episodeNumber: number,
  options?: VidplusOptions,
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

  return withVidplusParams(
    `${VIDPLUS_BASE_URL}/embed/tv/${artwork.tmdbId}/${seasonNumber}/${episodeNumber}`,
    options,
  );
}

export function buildVidplusAnimeEmbedUrl(
  media: AniListMedia | null | undefined,
  episodeNumber: number,
  options?: VidplusOptions,
) {
  if (!media?.id) {
    return null;
  }

  if (!Number.isFinite(episodeNumber) || episodeNumber <= 0) {
    return null;
  }

  return withVidplusParams(`${VIDPLUS_BASE_URL}/embed/anime/${media.id}/${episodeNumber}`, {
    ...options,
    dub: options?.dub ?? false,
  });
}

export function resolveVidplusPlayerUrl(
  artwork: TmdbAnimeArtwork | null | undefined,
  media: AniListMedia | null | undefined,
  animeType: string | null | undefined,
  episodeNumber: number,
  options?: VidplusOptions,
) {
  if (animeType === "Movie") {
    return buildVidplusMovieEmbedUrl(artwork, options);
  }

  return (
    buildVidplusAnimeEmbedUrl(media, episodeNumber, options) ||
    buildVidplusTvEmbedUrl(artwork, artwork?.seasonNumber ?? null, episodeNumber, options)
  );
}
