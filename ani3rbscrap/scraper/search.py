"""
Search anime3rb.com for an anime by name and resolve episode URLs.

The anime3rb site uses slugs like:
  https://anime3rb.com/anime/<slug>
  https://anime3rb.com/episode/<slug>-episode-<number>

This module handles:
  1. Searching anime3rb.com for an anime by its title
  2. Building the correct episode URL from the slug + episode number
"""

import re
from typing import Optional
from urllib.parse import quote_plus

import config


async def search_anime3rb(anime_name: str) -> Optional[dict]:
    """Search anime3rb.com for an anime by name and return the best match.

    Returns dict with keys: title, slug, url, or None if not found.
    """
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        import requests as cffi_requests

    search_url = f"{config.BASE_URL}/search?q={quote_plus(anime_name)}"
    print(f"  [search] Searching anime3rb: {search_url}")

    try:
        resp = cffi_requests.get(
            search_url,
            impersonate="chrome" if hasattr(cffi_requests, 'get') and 'impersonate' in cffi_requests.get.__code__.co_varnames else None,
            timeout=config.PAGE_LOAD_TIMEOUT,
        )
    except TypeError:
        # Fallback if impersonate not supported
        import requests
        resp = requests.get(search_url, timeout=config.PAGE_LOAD_TIMEOUT)

    if resp.status_code != 200:
        print(f"  [search] Search returned status {resp.status_code}")
        return None

    html = resp.text

    # Extract anime entries from search results
    # anime3rb uses links like /anime/<slug> in search results
    # Pattern: <a href="/anime/<slug>" ...> with title nearby
    matches = re.findall(
        r'href=["\'](?:https?://anime3rb\.com)?/anime/([^"\'/?#]+)["\']',
        html,
    )

    if not matches:
        print(f"  [search] No anime found in search results")
        return None

    # Return the first (best) match
    slug = matches[0]
    print(f"  [search] Found anime slug: {slug}")

    return {
        "slug": slug,
        "url": f"{config.BASE_URL}/anime/{slug}",
    }


def build_episode_url(anime_slug: str, episode_number: int) -> str:
    """Build the anime3rb episode page URL from slug and episode number.

    anime3rb episode URL format: https://anime3rb.com/episode/<slug>-episode-<number>
    """
    return f"{config.BASE_URL}/episode/{anime_slug}-episode-{episode_number}"


async def search_and_build_episode_url(
    anime_name: str, episode_number: int
) -> Optional[str]:
    """Search for an anime by name and return the episode URL.

    Returns the full episode page URL, or None if the anime wasn't found.
    """
    result = await search_anime3rb(anime_name)
    if not result:
        return None

    episode_url = build_episode_url(result["slug"], episode_number)
    print(f"  [search] Episode URL: {episode_url}")
    return episode_url
