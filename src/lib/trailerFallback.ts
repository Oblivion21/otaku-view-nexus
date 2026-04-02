/**
 * Resolve the preferred trailer YouTube ID.
 * TMDB is the primary source; Jikan/MAL is only used when TMDB has no trailer.
 */
export function getTrailerYoutubeId(
  tmdbYoutubeId: string | null | undefined,
  jikanYoutubeId: string | null,
  embedUrl?: string | null,
): string | null {
  if (tmdbYoutubeId) {
    return tmdbYoutubeId;
  }

  if (jikanYoutubeId) {
    return jikanYoutubeId;
  }

  if (embedUrl) {
    const match = embedUrl.match(/embed\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}
