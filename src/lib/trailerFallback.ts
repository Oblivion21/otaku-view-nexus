// Fallback trailer database for popular anime
// Maps MyAnimeList IDs to YouTube video IDs
// Use this when Jikan API doesn't have trailer data

export const TRAILER_FALLBACK: Record<number, string> = {
  // Attack on Titan
  16498: 'MGRm4IzK1SQ', // Attack on Titan Season 1
  25777: 'zLaVP8IhIuc', // Attack on Titan Season 2
  35760: 'hKHepjfj5Io', // Attack on Titan Season 3
  38524: 'M_OauHkUlL8', // Attack on Titan Season 3 Part 2
  40028: 'SlNpRThS9t8', // Attack on Titan: The Final Season
  48583: 'MUCN-JwUvbY', // Attack on Titan: The Final Season Part 2
  51535: 'sdVPPXOzEBo', // Attack on Titan: The Final Season Part 3

  // Demon Slayer (Kimetsu no Yaiba)
  38000: '6vMuWuWlW4I', // Demon Slayer Season 1
  49926: 'ATJYac_dORw', // Demon Slayer: Mugen Train
  47778: 'a9tq0aS5Zu8', // Demon Slayer Season 2
  51019: 'QwvLlnwRKAU', // Demon Slayer Season 3

  // Jujutsu Kaisen
  40748: 'pkKu9hLT-t8', // Jujutsu Kaisen Season 1
  51009: 'O6qVzbSNa1g', // Jujutsu Kaisen Season 2

  // My Hero Academia
  31964: 'DxmgHGshzxs', // My Hero Academia Season 2
  36456: 'JezE5GF7a4w', // My Hero Academia Season 3
  38408: 'v1KjRhXW4X4', // My Hero Academia Season 4
  41587: 'epIZFi5FeGM', // My Hero Academia Season 5
  50608: 'VQjEVDoLQ-g', // My Hero Academia Season 6

  // One Piece
  21: 'MCb13lbVGE0', // One Piece

  // Naruto
  20: 'j2hiC9BmJlQ', // Naruto
  1735: '1dy2zPPrKD0', // Naruto Shippuden

  // Death Note
  1535: 'd9rkCfuQIqU',

  // Fullmetal Alchemist: Brotherhood
  5114: 'O8mMmZ_Zaqo',

  // Spy x Family
  50265: 'U_rWZK-zkTY', // Spy x Family Season 1
  60663: 'I7vbIy_oUjw', // Spy x Family Season 2

  // Chainsaw Man
  44511: 'dFlDRhvM4L0',

  // Tokyo Ghoul
  22319: 'vGuQeQsoRgU',

  // Steins;Gate
  9253: 'uMYhjVwp0Fk',

  // Sword Art Online
  11757: 'C8Jl_-b7ju0',

  // Vinland Saga
  37521: 'Qe3JD72pSOU', // Vinland Saga Season 1
  49387: 'lWy0m0ULti4', // Vinland Saga Season 2

  // Blue Lock
  49596: 'G9zLe01Z-sI',

  // Frieren
  52991: '_s23vhN-5FI', // Frieren: Beyond Journey's End

  // The Apothecary Diaries
  54492: 'ztCpFl_CIbg',

  // Solo Leveling
  52299: 'q_U7x8fYaNI',
};

/**
 * Get YouTube trailer ID for an anime
 * First tries Jikan API data, then falls back to manual database
 */
export function getTrailerYoutubeId(
  malId: number,
  jikanYoutubeId: string | null,
  embedUrl?: string | null
): string | null {
  // If Jikan has trailer data, use it
  if (jikanYoutubeId) {
    return jikanYoutubeId;
  }

  // Try to extract YouTube ID from embed_url
  if (embedUrl) {
    const match = embedUrl.match(/embed\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return match[1];
    }
  }

  // Otherwise, check our fallback database
  return TRAILER_FALLBACK[malId] || null;
}
