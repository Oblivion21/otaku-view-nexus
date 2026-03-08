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

    Only matches files.vid3rb.com/.../*.mp4 — actual MP4 file links.

    NOTE: video.vid3rb.com/video/<uuid> is a metadata/thumbnail endpoint,
    NOT a playable video.  video.vid3rb.com/player/<uuid> is the player
    iframe (handled by extract_player_iframe_url instead).
    """
    return [
        # files.vid3rb.com  ...  .mp4  (the actual playable MP4 file)
        rf'https?://[^\s"\'<>]*{re.escape(config.VIDEO_HOST_PATTERN)}[^\s"\'<>]*{re.escape(config.VIDEO_FILE_EXTENSION)}[^\s"\'<>]*',
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


def extract_player_iframe_url(html: str) -> Optional[str]:
    """Extract the vid3rb player iframe URL from HTML.

    The episode page embeds the video player URL in multiple ways:
      1. <iframe src="https://video.vid3rb.com/player/<uuid>?token=...&expires=...">
      2. Livewire wire:snapshot JSON: "video_url":"https:\\/\\/video.vid3rb.com\\/player\\/..."
    The actual .mp4 is loaded inside that player when play is clicked.
    """
    # 1. Match iframe src/href pointing to vid3rb player
    pattern = r'(?:src|href)\s*=\s*["\']?(https?://video\.vid3rb\.com/player/[^"\'>\s]+)'
    match = re.search(pattern, html)
    if match:
        url = match.group(1).replace("&amp;", "&")
        return url

    # 2. Match video_url in Livewire wire:snapshot JSON (JSON-escaped slashes)
    pattern2 = r'"video_url"\s*:\s*"(https?:\\?/\\?/video\.vid3rb\.com\\?/player\\?/[^"]+)"'
    match2 = re.search(pattern2, html)
    if match2:
        url = match2.group(1).replace("\\/", "/").replace("&amp;", "&")
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
            if (url && (url.includes('.mp4') || url.includes('files.vid3rb.com'))) {
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
