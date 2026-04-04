function isValidScore(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score) && score > 0;
}

export function resolvePreferredScore(
  primaryScore: number | null | undefined,
  fallbackScore: number | null | undefined,
) {
  if (isValidScore(primaryScore)) {
    return primaryScore;
  }

  if (isValidScore(fallbackScore)) {
    return fallbackScore;
  }

  return null;
}

export function formatTenPointScoreLabel(score: number | null | undefined) {
  if (!isValidScore(score)) {
    return null;
  }

  return score.toFixed(1);
}

export function formatLegacyEpisodeScoreLabel(score: number | null | undefined) {
  if (!isValidScore(score)) {
    return null;
  }

  const normalizedScore = score <= 5 ? score * 2 : score;
  return normalizedScore.toFixed(1);
}

export function resolveEpisodeScoreLabel(
  imdbRating: number | null | undefined,
  fallbackScore: number | null | undefined,
) {
  const formattedImdbScore = formatTenPointScoreLabel(imdbRating);
  if (formattedImdbScore) {
    return formattedImdbScore;
  }

  return formatLegacyEpisodeScoreLabel(fallbackScore);
}
