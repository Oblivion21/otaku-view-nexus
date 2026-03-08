"""Shared utilities for scraper methods."""

import re
from typing import Optional

import config


class SkipMethod(Exception):
    """Raised when a method cannot run at all (not installed, no API key, etc.).

    The chain catches this and moves to the next method immediately — no retries.
    """
    pass


def is_cloudflare_challenge(html: str) -> bool:
    """Return True if the HTML is a Cloudflare challenge page, not real content.

    We require BOTH a challenge marker AND the absence of real page content.
    The CF challenge-platform script can appear on valid pages (passive bot
    detection), so we only flag the page when it looks like ONLY a challenge.
    """
    # A real anime3rb page will have significant content — if it's short, it's
    # likely a bare challenge interstitial.
    if len(html) > 20_000:
        return False

    challenge_markers = [
        "Just a moment",
        "Checking your browser",
        "cf-browser-verification",
        "challenge-platform",
        "cf-turnstile",
    ]
    return any(marker in html for marker in challenge_markers)


def _video_url_patterns() -> list[str]:
    """Return regex patterns that match vid3rb *playable* video URLs.

    Matches two formats:
      1. files.vid3rb.com/.../*.mp4  — legacy direct MP4 links
      2. video.vid3rb.com/video/<uuid>?speed=...&token=...&expires=... — new streaming URLs
    """
    return [
        # Format 1: files.vid3rb.com MP4 files (legacy)
        rf'https?://[^\s"\'<>]*{re.escape(config.VIDEO_HOST_PATTERN)}[^\s"\'<>]*{re.escape(config.VIDEO_FILE_EXTENSION)}[^\s"\'<>]*',
        # Format 2: video.vid3rb.com/video/<uuid>?speed=...&token=...&expires=... (new format)
        rf'https?://video\.vid3rb\.com/video/[a-f0-9-]{{36}}(?:\?[^\s"\'<>]*)?',
    ]


def extract_video_url(text: str) -> Optional[str]:
    """Extract the vid3rb video URL from raw text (HTML, HAR, network log, etc.)."""
    for pattern in _video_url_patterns():
        match = re.search(pattern, text)
        if match:
            return match.group(0)
    return None


def extract_all_video_urls(text: str) -> list[str]:
    """Extract all vid3rb video URLs from text."""
    urls: set[str] = set()
    for pattern in _video_url_patterns():
        urls.update(re.findall(pattern, text))
    return list(urls)


def _decode_html_entities(text: str) -> str:
    """Decode common HTML entities in a string."""
    return (text
            .replace("&quot;", '"')
            .replace("&amp;", "&")
            .replace("&#39;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">"))


def _find_vid3rb_player_url(text: str) -> Optional[str]:
    """Find the first vid3rb player URL in plain (decoded) text."""
    pattern = r'https?://video\.vid3rb\.com/player/[a-f0-9-]{36}[^\s"\'<>]*'
    match = re.search(pattern, text)
    if match:
        return match.group(0).replace("\\/", "/").replace("&amp;", "&")
    return None


def _extract_from_wire_snapshot(html: str) -> Optional[str]:
    """Parse Livewire wire:snapshot attributes and search for vid3rb player URL.

    Livewire v3 stores component state in HTML like:
        <div wire:snapshot="{&quot;data&quot;:{&quot;video_url&quot;:&quot;https:\\/\\/video.vid3rb.com\\/player\\/UUID?token=...&quot;}}">

    The JSON is HTML-entity-encoded (" → &quot;, & → &amp;).
    We decode it and parse as JSON to find any vid3rb player URL.
    """
    import json as _json

    # Find all wire:snapshot attribute values
    snapshot_pattern = r'wire:snapshot\s*=\s*"((?:[^"\\]|\\.)*)"|wire:snapshot\s*=\s*\'((?:[^\'\\]|\\.)*)\'|wire:initial-data\s*=\s*"((?:[^"\\]|\\.)*)"'
    for m in re.finditer(snapshot_pattern, html, re.DOTALL):
        raw = m.group(1) or m.group(2) or m.group(3)
        if not raw:
            continue

        # Decode HTML entities to get real JSON
        decoded = _decode_html_entities(raw)

        # Quick check before expensive JSON parse
        if "vid3rb" not in decoded:
            continue

        # Try to find the URL directly in decoded text
        url = _find_vid3rb_player_url(decoded)
        if url:
            return url

        # Try full JSON parse as fallback
        try:
            data = _json.loads(decoded)
            # Recursively search JSON for vid3rb player URLs
            url = _search_json_for_player_url(data)
            if url:
                return url
        except Exception:
            pass

    return None


def _search_json_for_player_url(obj, depth: int = 0) -> Optional[str]:
    """Recursively search a parsed JSON object for vid3rb player URLs."""
    if depth > 10:
        return None
    if isinstance(obj, str):
        url = _find_vid3rb_player_url(obj)
        return url
    if isinstance(obj, dict):
        for v in obj.values():
            result = _search_json_for_player_url(v, depth + 1)
            if result:
                return result
    if isinstance(obj, list):
        for item in obj:
            result = _search_json_for_player_url(item, depth + 1)
            if result:
                return result
    return None


def extract_player_iframe_url(html: str) -> Optional[str]:
    """Extract the vid3rb player iframe URL from HTML.

    The episode page embeds the video player URL in multiple ways:
      1. <iframe src="https://video.vid3rb.com/player/<uuid>?token=...&expires=...">
      2. Livewire wire:snapshot (HTML-entity-encoded JSON): parsed recursively
      3. Livewire wire:snapshot JSON with JSON-escaped slashes (literal quotes)
      4. data-src / data-url / data-iframe attributes
      5. JavaScript variables or object literals
      6. Catch-all: any occurrence of the player URL pattern anywhere in the page
    """
    # 1. Match iframe/link src or href pointing to vid3rb player
    pattern1 = r'(?:src|href|data-src|data-url|data-iframe)\s*=\s*["\']?(https?://video\.vid3rb\.com/player/[^"\'>\s]+)'
    match = re.search(pattern1, html, re.IGNORECASE)
    if match:
        url = match.group(1).replace("&amp;", "&")
        return url

    # 2. Parse Livewire wire:snapshot (HTML-entity-encoded JSON) — most likely location
    url = _extract_from_wire_snapshot(html)
    if url:
        return url

    # 3. Match video_url in Livewire wire:snapshot JSON (JSON-escaped slashes, literal quotes)
    pattern3 = r'"video_url"\s*:\s*"(https?:\\?/\\?/video\.vid3rb\.com\\?/player\\?/[^"]+)"'
    match3 = re.search(pattern3, html)
    if match3:
        url = match3.group(1).replace("\\/", "/").replace("&amp;", "&")
        return url

    # 4. Match in JavaScript object literals or variable assignments
    pattern4 = r'''(?:url|src|href|iframe|player|video_url|videoUrl)\s*[=:]\s*['"](https?://video\.vid3rb\.com/player/[^'"]+)'''
    match4 = re.search(pattern4, html, re.IGNORECASE)
    if match4:
        url = match4.group(1).replace("&amp;", "&")
        return url

    # 5. Catch-all: find the player UUID anywhere in the page regardless of encoding.
    # Handles normal slashes (/), JSON-escaped slashes (\/), and HTML entities (&amp;)
    pattern5 = r'https?:(?://|\\?/\\?/)video\.vid3rb\.com(?:\\?/)player(?:\\?/)([a-f0-9-]{36}(?:[?&][^\s"\'<>\\]*)?)'
    match5 = re.search(pattern5, html)
    if match5:
        raw = match5.group(0)
        url = raw.replace("\\/", "/").replace("&amp;", "&")
        if not url.startswith("https://"):
            url = "https://video.vid3rb.com/player/" + match5.group(1).replace("\\/", "/").replace("&amp;", "&")
        return url

    return None


# JS snippet that browser methods inject into the player iframe page.
# It sets up network interception, clicks play, and polls until an .mp4 URL is found.
PLAYER_INTERCEPT_JS = """
() => {
    return new Promise((resolve) => {
        // Capture via PerformanceObserver
        window.__mp4_url = null;
        function checkUrl(url) {
            if (url && (
                url.includes('.mp4') ||
                url.includes('files.vid3rb.com') ||
                (url.includes('video.vid3rb.com/video/') && url.includes('token='))
            )) {
                window.__mp4_url = url;
                resolve(url);
                return true;
            }
            return false;
        }

        // Check existing resources first
        performance.getEntriesByType('resource').forEach(e => checkUrl(e.name));
        if (window.__mp4_url) return;

        // Watch for new resources
        const obs = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                if (checkUrl(entry.name)) return;
            }
        });
        obs.observe({ entryTypes: ['resource'] });

        // Override XHR and fetch to catch .mp4 requests
        const origFetch = window.fetch;
        window.fetch = function(...args) {
            if (args[0] && checkUrl(typeof args[0] === 'string' ? args[0] : args[0].url)) {}
            return origFetch.apply(this, args);
        };

        const origOpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url) {
            checkUrl(url);
            return origOpen.apply(this, arguments);
        };

        // Try clicking play
        const playSelectors = [
            'button.plyr__control--overlaid',
            '[data-plyr="play"]',
            '.plyr__control--overlaid',
            '.vjs-big-play-button',
            'button[aria-label*="Play"]',
            'button[aria-label*="play"]',
            'video',
            '.play-button',
            '#player',
        ];
        for (const sel of playSelectors) {
            try {
                const el = document.querySelector(sel);
                if (el) { el.click(); break; }
            } catch(e) {}
        }

        // Also try to play video element directly
        const vid = document.querySelector('video');
        if (vid) {
            vid.play().catch(() => {});
            // Check video src directly
            if (checkUrl(vid.src)) return;
            if (vid.querySelector('source') && checkUrl(vid.querySelector('source').src)) return;
        }

        // Timeout after 15s
        setTimeout(() => {
            // Last resort: check video element
            const v = document.querySelector('video');
            if (v && v.src) resolve(v.src);
            else if (v && v.querySelector('source')) resolve(v.querySelector('source').src);
            else resolve(null);
        }, 15000);
    });
}
"""


def get_proxy_dict() -> Optional[dict]:
    """Build a proxy config dict from config.py settings. Returns None if unset."""
    if not config.PROXY_SERVER:
        return None
    proxy = {"server": config.PROXY_SERVER}
    if config.PROXY_USERNAME:
        proxy["username"] = config.PROXY_USERNAME
    if config.PROXY_PASSWORD:
        proxy["password"] = config.PROXY_PASSWORD
    return proxy


# ────────────────────────────────────────────────────────────────
# Cloudflare Turnstile solver (Playwright API — works with
# camoufox, patchright, and vanilla playwright)
# ────────────────────────────────────────────────────────────────

async def solve_turnstile_playwright(page, method_name: str, max_wait: int = 30) -> bool:
    """
    Detect and click the Cloudflare Turnstile checkbox, then wait for the
    challenge to resolve and the real page to load.

    Args:
        page:        Playwright Page object (works with Patchright and Camoufox too).
        method_name: Label for log messages.
        max_wait:    Max seconds to wait for challenge resolution after clicking.

    Returns True if the challenge was solved, False otherwise.
    """
    import asyncio
    import random

    # Give the Turnstile widget time to render
    await asyncio.sleep(2)

    content = await page.content()
    if not is_cloudflare_challenge(content):
        print(f"  [{method_name}] No Cloudflare challenge detected, continuing")
        return True  # no challenge = success

    print(f"  [{method_name}] Cloudflare Turnstile detected, attempting to solve...")

    clicked = False

    # --- Approach 1: find the challenge iframe and click the checkbox inside ---
    for frame in page.frames:
        url = frame.url or ""
        if "challenges.cloudflare.com" not in url:
            continue

        print(f"  [{method_name}] Found Turnstile iframe")

        # Try the checkbox input
        try:
            checkbox = await frame.wait_for_selector(
                "input[type='checkbox']", timeout=8000,
            )
            if checkbox:
                await asyncio.sleep(random.uniform(0.3, 1.0))
                await checkbox.click()
                print(f"  [{method_name}] Clicked Turnstile checkbox")
                clicked = True
                break
        except Exception:
            pass

        # Try any clickable label
        try:
            label = await frame.query_selector("label")
            if label:
                await asyncio.sleep(random.uniform(0.3, 1.0))
                await label.click()
                print(f"  [{method_name}] Clicked Turnstile label")
                clicked = True
                break
        except Exception:
            pass

        # Try the body of the frame (fallback)
        try:
            body = await frame.query_selector("body")
            if body:
                await asyncio.sleep(random.uniform(0.3, 1.0))
                await body.click()
                print(f"  [{method_name}] Clicked Turnstile frame body")
                clicked = True
                break
        except Exception:
            pass

    # --- Approach 2: click the iframe element directly on the parent page ---
    if not clicked:
        for selector in [
            "iframe[src*='challenges.cloudflare.com']",
            ".cf-turnstile iframe",
            "#turnstile-wrapper iframe",
            "iframe[id*='cf-chl']",
        ]:
            try:
                iframe_el = await page.query_selector(selector)
                if iframe_el:
                    bbox = await iframe_el.bounding_box()
                    if bbox:
                        # The checkbox is on the left side of the widget
                        x = bbox["x"] + 32
                        y = bbox["y"] + bbox["height"] / 2
                        await asyncio.sleep(random.uniform(0.3, 1.0))
                        await page.mouse.click(x, y)
                        print(f"  [{method_name}] Clicked Turnstile iframe at ({x:.0f}, {y:.0f})")
                        clicked = True
                        break
            except Exception:
                continue

    if not clicked:
        print(f"  [{method_name}] Could not find Turnstile widget to click")
        return False

    # --- Wait for the challenge to resolve and page to navigate ---
    print(f"  [{method_name}] Waiting for challenge to resolve (up to {max_wait}s)...")
    for i in range(max_wait):
        await asyncio.sleep(1)
        try:
            content = await page.content()
            if not is_cloudflare_challenge(content):
                print(f"  [{method_name}] Challenge solved after {i + 1}s")
                return True
        except Exception:
            # Page might be navigating
            pass

    print(f"  [{method_name}] Challenge did not resolve within {max_wait}s")
    return False
