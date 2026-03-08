"""
Fallback chain orchestrator.

Tries each scraping method in order (cheapest/fastest first).
Stops and returns as soon as one method successfully extracts the video URL.
"""

import asyncio
from typing import Optional, Callable, Awaitable

from scraper.methods import curl_method
from scraper.methods.api_methods import (
    scrape_apify_bypasser,
    scrape_apify_scraper,
)
from scraper.utils import SkipMethod
import config


# Ordered list of (name, async scrape function)
METHODS: list[tuple[str, Callable[[str], Awaitable[Optional[str]]]]] = [
    ("curl_cffi", curl_method.scrape),
    ("apify_bypasser",  scrape_apify_bypasser),
    ("apify_scraper",   scrape_apify_scraper),
]

SUPPORTED_METHOD_NAMES = tuple(name for name, _ in METHODS)


def validate_requested_methods(methods: Optional[list[str]]) -> Optional[list[str]]:
    """Normalize and validate requested method names."""
    if methods is None:
        return None

    normalized = [method.strip() for method in methods if isinstance(method, str) and method.strip()]
    invalid = [method for method in normalized if method not in SUPPORTED_METHOD_NAMES]
    if invalid:
        raise ValueError(f"Unsupported methods: {', '.join(invalid)}")
    return normalized


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
    requested_methods = validate_requested_methods(methods)
    chain = METHODS
    if requested_methods:
        chain = [(name, fn) for name, fn in METHODS if name in requested_methods]

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
