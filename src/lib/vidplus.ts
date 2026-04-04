import type { AniListMedia } from "@/lib/anilist";
import type { TmdbAnimeArtwork } from "@/lib/tmdb";

export const VIDPLUS_BASE_URL = "https://player.vidplus.to";

type VidplusServer = string;

type VidplusOptions = {
  autoplay?: boolean;
  dub?: boolean;
  title?: boolean;
  chromecast?: boolean;
  episodeList?: boolean;
  serverIcon?: boolean;
  pip?: boolean;
  nextButton?: boolean;
  poster?: boolean;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  iconColor?: string | null;
  server?: VidplusServer | null;
};

function buildVidplusParams(options: VidplusOptions = {}) {
  const params = new URLSearchParams();

  if (options.autoplay ?? true) {
    params.set("autoplay", "true");
  }

  if (typeof options.dub === "boolean") {
    params.set("dub", String(options.dub));
  }

  params.set("title", String(options.title ?? true));
  params.set("chromecast", String(options.chromecast ?? true));
  params.set("episodelist", String(options.episodeList ?? false));
  params.set("servericon", String(options.serverIcon ?? true));
  params.set("pip", String(options.pip ?? true));
  params.set("nextbutton", String(options.nextButton ?? false));
  params.set("poster", String(options.poster ?? true));

  if (options.primaryColor ?? "07D0FF") {
    params.set("primarycolor", options.primaryColor ?? "07D0FF");
  }

  if (options.secondaryColor ?? "FFFFFF") {
    params.set("secondarycolor", options.secondaryColor ?? "FFFFFF");
  }

  if (options.iconColor ?? "FFFFFF") {
    params.set("iconcolor", options.iconColor ?? "FFFFFF");
  }

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
    const animeUrl = buildVidplusAnimeEmbedUrl(media, episodeNumber, options);
    if (animeUrl) {
      return animeUrl;
    }

    return buildVidplusMovieEmbedUrl(artwork, options);
  }

  const tvUrl = buildVidplusTvEmbedUrl(artwork, artwork?.seasonNumber ?? null, episodeNumber, options);
  if (tvUrl) {
    return tvUrl;
  }

  return buildVidplusAnimeEmbedUrl(media, episodeNumber, options);
}
