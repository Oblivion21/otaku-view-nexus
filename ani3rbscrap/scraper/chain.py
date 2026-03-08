"""
Fallback chain orchestrator.

Tries each scraping method in order (cheapest/fastest first).
Stops and returns as soon as one method successfully extracts the video URL.
"""

import asyncio
from typing import Optional, Callable, Awaitable

from scraper.methods import camoufox_method
from scraper.methods.api_methods import (
    scrape_apify_bypasser,
    scrape_apify_scraper,
)
from scraper.utils import SkipMethod
import config


# Ordered list of (name, async scrape function)
METHODS: list[tuple[str, Callable[[str], Awaitable[Optional[str]]]]] = [
    # Allowed methods only
    ("apify_bypasser",  scrape_apify_bypasser),
    ("apify_scraper",   scrape_apify_scraper),
    ("camoufox",    camoufox_method.scrape),
]

# Accept common typo/alias from CLI or API callers.
METHOD_ALIASES = {
    "camoufix": "camoufox",
}


async def scrape_video_url(
    episode_url: str,
    methods: Optional[list[str]] = None,
) -> Optional[str]:
    """
    Try each scraping method in order. Return the first video URL found, or None.

    - SkipMethod exception  → method can't run at all, move to next immediately
    - None return           → method tried but failed, move to next immediately
    - Other exception       → transient error, retry up to MAX_RETRIES times
    """
    chain = METHODS
    if methods:
        normalized_methods = [METHOD_ALIASES.get(m, m) for m in methods]
        method_map = {name: fn for name, fn in METHODS}
        chain = [(name, method_map[name]) for name in normalized_methods if name in method_map]

    print(f"Scraping video URL from: {episode_url}")
    print(f"Methods to try: {[name for name, _ in chain]}")
    print()

    for name, scrape_fn in chain:
        print(f"--- Trying method: {name} ---")

        for attempt in range(1, config.MAX_RETRIES + 1):
            try:
                result = await scrape_fn(episode_url)
                if result:
                    print(f"\n✓ Success with method '{name}' (attempt {attempt})")
                    print(f"  Video URL: {result}")
                    return result
                # None = tried and definitively failed, no point retrying
                print(f"  [{name}] No result, moving on")
                break

            except SkipMethod as e:
                # Method can't run at all (not installed, no API key)
                print(f"  [{name}] Skipped: {e}")
                break

            except Exception as e:
                # Transient error — worth retrying
                print(f"  [{name}] Attempt {attempt} error: {e}")
                if attempt < config.MAX_RETRIES:
                    wait = 2 ** attempt
                    print(f"  [{name}] Retrying in {wait}s...")
                    await asyncio.sleep(wait)
                else:
                    print(f"  [{name}] All retries exhausted")

        print()

    print("✗ All methods failed. No video URL could be extracted.")
    return None
