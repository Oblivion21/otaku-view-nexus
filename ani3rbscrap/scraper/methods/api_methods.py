"""
Steps 6–9 — Paid Scraping APIs

Each service handles Cloudflare/Turnstile server-side — there's nothing to
click. The key is sending the right parameters so each service enables its
full JS-rendering + challenge-solving pipeline.
"""

from typing import Optional

import json
import re
from urllib.parse import quote, urlparse, parse_qs

import config
from scraper.utils import extract_video_url, extract_player_iframe_url, is_cloudflare_challenge, SkipMethod


def _debug_response(name: str, text: str):
    """Print a snippet of the response to help diagnose failures."""
    snippet = text.replace("\n", " ")[:400]
    print(f"  [{name}] Response snippet: {snippet}")


def _normalize_direct_url(url: str) -> str:
    return url.replace("\\/", "/").replace("&amp;", "&").strip()


def _is_signed_vid3rb_video(url: str) -> bool:
    normalized = _normalize_direct_url(url)
    return "video.vid3rb.com/video/" in normalized and "token=" in normalized


def _is_direct_like_url(url: str) -> bool:
    normalized = _normalize_direct_url(url)
    return normalized.endswith(".mp4") or ".mp4?" in normalized or _is_signed_vid3rb_video(normalized)


def _extract_resolution(text: str) -> int:
    match = re.search(r"\b(2160|1440|1080|720|480|360|240)p\b", str(text or "").lower())
    return int(match.group(1)) if match else 0


def _get_source_resolution(source: dict) -> int:
    best = 0
    for field in (
        source.get("res"),
        source.get("label"),
        source.get("quality"),
        source.get("name"),
        source.get("src"),
        source.get("url"),
        source.get("video_url"),
        source.get("file"),
        source.get("download"),
    ):
        try:
            numeric = int(field)
            if numeric in {2160, 1440, 1080, 720, 480, 360, 240}:
                best = max(best, numeric)
                continue
        except Exception:
            pass
        best = max(best, _extract_resolution(str(field or "")))
    return best


def _collect_direct_candidates_from_payload(payload, inherited_resolution: int = 0, depth: int = 0) -> list[tuple[str, int]]:
    if depth > 10:
        return []

    out: list[tuple[str, int]] = []

    if isinstance(payload, str):
        candidate = _normalize_direct_url(payload)
        if _is_direct_like_url(candidate):
            out.append((candidate, max(inherited_resolution, _extract_resolution(candidate))))
        return out

    if isinstance(payload, list):
        for item in payload:
            out.extend(_collect_direct_candidates_from_payload(item, inherited_resolution, depth + 1))
        return out

    if not isinstance(payload, dict):
        return out

    if payload.get("premium") is True:
        return out

    own_resolution = max(inherited_resolution, _get_source_resolution(payload))

    for key in ("src", "url", "video_url", "file", "download"):
        value = payload.get(key)
        if isinstance(value, str):
            out.extend(_collect_direct_candidates_from_payload(value, own_resolution, depth + 1))

    for value in payload.values():
        out.extend(_collect_direct_candidates_from_payload(value, own_resolution, depth + 1))

    return out


def _pick_best_direct_candidate(candidates: list[tuple[str, int]], method_name: str) -> Optional[str]:
    if not candidates:
        return None

    ranked: dict[str, int] = {}
    for url, resolution in candidates:
        normalized = _normalize_direct_url(url)
        if not _is_direct_like_url(normalized):
            continue
        ranked[normalized] = max(ranked.get(normalized, 0), resolution)

    if not ranked:
        return None

    sorted_candidates = sorted(
        ranked.items(),
        key=lambda item: (
            1 if _is_signed_vid3rb_video(item[0]) else 0,
            item[1],
            1 if ".mp4" in item[0] else 0,
            -len(item[0]),
        ),
        reverse=True,
    )

    best_url, best_resolution = sorted_candidates[0]
    print(f"  [{method_name}] Selected best direct candidate: {best_resolution or 'unknown'}p")
    return best_url


def _extract_cf_token_from_player_html(html: str) -> Optional[str]:
    patterns = [
        r'cf_token\s*[=:]\s*["\']([^"\']+)["\']',
        r'["\']cf_token["\']\s*:\s*["\']([^"\']+)["\']',
        r'window\.cf_token\s*=\s*["\']([^"\']+)["\']',
    ]
    for pattern in patterns:
        match = re.search(pattern, html)
        if match:
            return match.group(1)
    return None


def _extract_player_uuid(player_url: str) -> Optional[str]:
    match = re.search(r"/player/([a-f0-9-]+)", player_url, re.IGNORECASE)
    return match.group(1) if match else None


def _fetch_player_sources_api(player_url: str, player_html: str, method_name: str) -> Optional[str]:
    import requests as _requests

    cf_token = _extract_cf_token_from_player_html(player_html)
    player_uuid = _extract_player_uuid(player_url)
    if not cf_token or not player_uuid:
        return None

    sources_url = (
        f"https://video.vid3rb.com/player/{player_uuid}/sources"
        f"?cf_token={quote(cf_token, safe='')}"
    )

    session = _requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36",
        "Referer": player_url,
        "Accept": "application/json,*/*",
        "Origin": "https://video.vid3rb.com",
    })

    try:
        print(f"  [{method_name}] Fetching player sources API...")
        resp = session.get(sources_url, timeout=20)
        print(f"  [{method_name}] Sources API status: {resp.status_code}, {len(resp.text)} chars")
    except Exception as e:
        print(f"  [{method_name}] Sources API fetch failed: {e}")
        return None

    if resp.status_code != 200 or not resp.text:
        return None

    try:
        payload = resp.json()
    except Exception as e:
        print(f"  [{method_name}] Sources API JSON parse failed: {e}")
        return None

    best = _pick_best_direct_candidate(
        _collect_direct_candidates_from_payload(payload),
        method_name,
    )
    if best:
        print(f"  [{method_name}] Found direct URL via sources API")
    return best


# ────────────────────────────────────────────────────────────────
# Step 6 — ScrapeOps
# ────────────────────────────────────────────────────────────────

async def scrape_scrapeops(episode_url: str) -> Optional[str]:
    """Use ScrapeOps with Cloudflare level-3 bypass (Turnstile-capable)."""
    if not config.SCRAPEOPS_API_KEY:
        raise SkipMethod("scrapeops: no API key in config.py (SCRAPEOPS_API_KEY)")

    import requests

    print(f"  [scrapeops] Fetching via ScrapeOps API")

    resp = requests.get(
        "https://proxy.scrapeops.io/v1/",
        params={
            "api_key": config.SCRAPEOPS_API_KEY,
            "url": episode_url,
            "render_js": "true",
            # level_3 uses a real browser + Turnstile solver
            "bypass": "cloudflare_level_3",
            "residential": "true",
            "country": "us",
        },
        timeout=config.PAGE_LOAD_TIMEOUT + 60,
    )

    print(f"  [scrapeops] Status: {resp.status_code}, body: {len(resp.text)} chars")

    if resp.status_code != 200:
        print(f"  [scrapeops] Non-200 status")
        _debug_response("scrapeops", resp.text)
        return None

    if is_cloudflare_challenge(resp.text):
        print(f"  [scrapeops] Still got Cloudflare challenge")
        return None

    video_url = extract_video_url(resp.text)
    if video_url:
        print(f"  [scrapeops] Found video URL")
        return video_url

    print(f"  [scrapeops] Page loaded but no video URL found")
    _debug_response("scrapeops", resp.text)
    return None


# ────────────────────────────────────────────────────────────────
# Step 7 — Scrapfly
# ────────────────────────────────────────────────────────────────

async def scrape_scrapfly(episode_url: str) -> Optional[str]:
    """Use Scrapfly with ASP (Anti Scraping Protection) + JS rendering."""
    if not config.SCRAPFLY_API_KEY:
        raise SkipMethod("scrapfly: no API key in config.py (SCRAPFLY_API_KEY)")

    import requests

    print(f"  [scrapfly] Fetching via Scrapfly API")

    resp = requests.get(
        "https://api.scrapfly.io/scrape",
        params={
            "key": config.SCRAPFLY_API_KEY,
            "url": episode_url,
            # asp=true enables Cloudflare/Turnstile bypass
            "asp": "true",
            "render_js": "true",
            "country": "us",
            # Wait for video player element before returning HTML
            "wait_for_selector": "video,#player,.episode-player,[class*='player']",
            # Give JS 10s to execute after page load
            "wait": "10000",
        },
        timeout=config.PAGE_LOAD_TIMEOUT + 60,
    )

    print(f"  [scrapfly] Status: {resp.status_code}")

    if resp.status_code != 200:
        print(f"  [scrapfly] Non-200 status")
        try:
            _debug_response("scrapfly", resp.text)
        except Exception:
            pass
        return None

    data = resp.json()
    content = data.get("result", {}).get("content", "")

    if is_cloudflare_challenge(content):
        print(f"  [scrapfly] Still got Cloudflare challenge")
        return None

    video_url = extract_video_url(content)
    if video_url:
        print(f"  [scrapfly] Found video URL")
        return video_url

    print(f"  [scrapfly] Page loaded but no video URL found (content: {len(content)} chars)")
    _debug_response("scrapfly", content)
    return None


# ────────────────────────────────────────────────────────────────
# Step 8 — Crawlbase
# NOTE: You must use a JavaScript API token, not a regular token.
#       Get yours at: https://crawlbase.com/dashboard
# ────────────────────────────────────────────────────────────────

async def scrape_crawlbase(episode_url: str) -> Optional[str]:
    """Use Crawlbase JS API (requires JavaScript token) with full page rendering."""
    if not config.CRAWLBASE_TOKEN:
        raise SkipMethod("crawlbase: no token in config.py (CRAWLBASE_TOKEN)")

    import requests

    print(f"  [crawlbase] Fetching via Crawlbase JS API")

    resp = requests.get(
        "https://api.crawlbase.com/",
        params={
            # Must be a JavaScript API token (not a normal token)
            "token": config.CRAWLBASE_TOKEN,
            "url": episode_url,
            # Wait for all AJAX/XHR requests to complete
            "ajax_wait": "true",
            # Wait 8 seconds after page load (time for Turnstile + player init)
            "page_wait": "8000",
        },
        timeout=config.PAGE_LOAD_TIMEOUT + 60,
    )

    print(f"  [crawlbase] Status: {resp.status_code}, body: {len(resp.text)} chars")

    if resp.status_code != 200:
        print(f"  [crawlbase] Non-200 status")
        _debug_response("crawlbase", resp.text)
        return None

    if is_cloudflare_challenge(resp.text):
        print(f"  [crawlbase] Still got Cloudflare challenge")
        return None

    video_url = extract_video_url(resp.text)
    if video_url:
        print(f"  [crawlbase] Found video URL")
        return video_url

    print(f"  [crawlbase] Page loaded but no video URL found")
    _debug_response("crawlbase", resp.text)
    return None


# ────────────────────────────────────────────────────────────────
# Step 9 — ScraperAPI
# ────────────────────────────────────────────────────────────────

async def scrape_scraperapi(episode_url: str) -> Optional[str]:
    """Use ScraperAPI with JS rendering, premium proxies, and Cloudflare bypass."""
    if not config.SCRAPERAPI_KEY:
        raise SkipMethod("scraperapi: no API key in config.py (SCRAPERAPI_KEY)")

    import requests

    print(f"  [scraperapi] Fetching via ScraperAPI")

    resp = requests.get(
        "https://api.scraperapi.com",
        params={
            "api_key": config.SCRAPERAPI_KEY,
            "url": episode_url,
            # render=true runs a real headless Chrome browser
            "render": "true",
            # premium proxies have higher Cloudflare bypass success rate
            "premium": "true",
            "country_code": "us",
            # Wait for video player element before capturing HTML
            "wait_for_selector": "video,#player,[class*='player']",
        },
        timeout=config.PAGE_LOAD_TIMEOUT + 60,
    )

    print(f"  [scraperapi] Status: {resp.status_code}, body: {len(resp.text)} chars")

    if resp.status_code != 200:
        print(f"  [scraperapi] Non-200 status")
        _debug_response("scraperapi", resp.text)
        return None

    if is_cloudflare_challenge(resp.text):
        print(f"  [scraperapi] Still got Cloudflare challenge")
        return None

    video_url = extract_video_url(resp.text)
    if video_url:
        print(f"  [scraperapi] Found video URL")
        return video_url

    print(f"  [scraperapi] Page loaded but no video URL found")
    _debug_response("scraperapi", resp.text)
    return None


# ────────────────────────────────────────────────────────────────
# Step 10 — Apify: macheta/universal-bypasser
# Cloudflare Bypasser — returns clean HTML + cookies after solving
# challenges automatically.  Simple input: just a URL.
# Free $5/month, no credit card.
# ────────────────────────────────────────────────────────────────

async def scrape_apify_bypasser(episode_url: str) -> Optional[str]:
    """Use macheta/universal-bypasser to bypass Cloudflare and extract video URL.

    Two-phase approach:
      Phase 1: Bypass Cloudflare on the anime3rb episode page, get HTML,
               extract the vid3rb player iframe URL.
      Phase 2: Fetch the player page (usually no CF) to get video_sources MP4 URLs.
    """
    if not config.APIFY_TOKEN:
        raise SkipMethod("apify_bypasser: no token in config.py (APIFY_TOKEN) — "
                         "sign up free at https://apify.com")

    try:
        from apify_client import ApifyClient
    except ImportError:
        raise SkipMethod("apify_bypasser: pip install apify-client")

    ACTOR_ID = "macheta/universal-bypasser"
    print(f"  [apify_bypasser] Running universal-bypasser on Apify cloud")

    client = ApifyClient(config.APIFY_TOKEN)

    # ── Phase 1: Bypass Cloudflare on the episode page ──
    try:
        run = client.actor(ACTOR_ID).call(
            run_input={"url": episode_url},
            timeout_secs=config.PAGE_LOAD_TIMEOUT + 60,
        )
    except Exception as e:
        print(f"  [apify_bypasser] Actor run failed: {e}")
        return None

    print(f"  [apify_bypasser] Phase 1 done, status: {run.get('status')}")

    dataset_id = run.get("defaultDatasetId")
    if not dataset_id:
        print(f"  [apify_bypasser] No dataset returned")
        return None

    items = list(client.dataset(dataset_id).iterate_items())
    if not items:
        print(f"  [apify_bypasser] Dataset is empty")
        return None

    # The actor returns items with HTML body content
    html_content = _extract_html_from_apify_items(items)
    if not html_content:
        print(f"  [apify_bypasser] No HTML in response")
        return None

    print(f"  [apify_bypasser] Got HTML: {len(html_content)} chars")

    if is_cloudflare_challenge(html_content):
        print(f"  [apify_bypasser] Still got Cloudflare challenge")
        return None

    # Extract player iframe URL first (most likely to be in the page)
    player_iframe_url = extract_player_iframe_url(html_content)
    if player_iframe_url:
        print(f"  [apify_bypasser] Found player iframe: {player_iframe_url[:80]}...")
        # ── Phase 2: Fetch player page for video_sources ──
        return _fetch_player_and_extract(player_iframe_url, episode_url, "apify_bypasser", client, ACTOR_ID)

    # Fallback: try direct .mp4 URL in HTML (rare but possible)
    video_url = extract_video_url(html_content)
    if video_url:
        print(f"  [apify_bypasser] Found video URL directly in HTML")
        return video_url

    print(f"  [apify_bypasser] No player iframe or video URL found")
    _debug_response("apify_bypasser", html_content)
    return None


# ────────────────────────────────────────────────────────────────
# Step 11 — Apify: zfcsoftware/scraper-api
# Cheap ($0.10/1000 results), fast, uses trusted proxies.
# Handles Cloudflare-protected sites automatically.
# ────────────────────────────────────────────────────────────────

async def scrape_apify_scraper(episode_url: str) -> Optional[str]:
    """Use zfcsoftware/scraper-api to bypass Cloudflare and extract video URL.

    Same two-phase approach as apify_bypasser.
    """
    if not config.APIFY_TOKEN:
        raise SkipMethod("apify_scraper: no token in config.py (APIFY_TOKEN) — "
                         "sign up free at https://apify.com")

    try:
        from apify_client import ApifyClient
    except ImportError:
        raise SkipMethod("apify_scraper: pip install apify-client")

    ACTOR_ID = "zfcsoftware/scraper-api"
    print(f"  [apify_scraper] Running scraper-api on Apify cloud")

    client = ApifyClient(config.APIFY_TOKEN)

    # ── Phase 1: Scrape the episode page ──
    try:
        run = client.actor(ACTOR_ID).call(
            run_input={"url": episode_url},
            timeout_secs=config.PAGE_LOAD_TIMEOUT + 60,
        )
    except Exception as e:
        print(f"  [apify_scraper] Actor run failed: {e}")
        return None

    print(f"  [apify_scraper] Phase 1 done, status: {run.get('status')}")

    dataset_id = run.get("defaultDatasetId")
    if not dataset_id:
        print(f"  [apify_scraper] No dataset returned")
        return None

    items = list(client.dataset(dataset_id).iterate_items())
    if not items:
        print(f"  [apify_scraper] Dataset is empty")
        return None

    html_content = _extract_html_from_apify_items(items)
    if not html_content:
        print(f"  [apify_scraper] No HTML in response")
        return None

    print(f"  [apify_scraper] Got HTML: {len(html_content)} chars")

    if is_cloudflare_challenge(html_content):
        print(f"  [apify_scraper] Still got Cloudflare challenge")
        return None

    player_iframe_url = extract_player_iframe_url(html_content)
    if player_iframe_url:
        print(f"  [apify_scraper] Found player iframe: {player_iframe_url[:80]}...")
        return _fetch_player_and_extract(player_iframe_url, episode_url, "apify_scraper", client, ACTOR_ID)

    video_url = extract_video_url(html_content)
    if video_url:
        print(f"  [apify_scraper] Found video URL directly in HTML")
        return video_url

    print(f"  [apify_scraper] No player iframe or video URL found")
    _debug_response("apify_scraper", html_content)
    return None


# ────────────────────────────────────────────────────────────────
# Shared helpers for Apify methods
# ────────────────────────────────────────────────────────────────

def _extract_html_from_apify_items(items: list) -> Optional[str]:
    """Extract HTML body content from Apify actor dataset items.

    Different actors return HTML in different fields. We check common ones.
    """
    for item in items:
        # Common field names used by various Apify actors
        for key in ("body", "html", "content", "text", "page_content", "result"):
            val = item.get(key)
            if val and isinstance(val, str) and len(val) > 100:
                return val

        # Some actors nest it under data.body or similar
        data = item.get("data")
        if isinstance(data, dict):
            for key in ("body", "html", "content"):
                val = data.get(key)
                if val and isinstance(val, str) and len(val) > 100:
                    return val

        # If the item itself looks like it has HTML (e.g., contains <html)
        item_str = str(item)
        if "<html" in item_str.lower() and len(item_str) > 500:
            # Try to find the largest string value in the item
            best = ""
            for v in item.values():
                if isinstance(v, str) and len(v) > len(best):
                    best = v
            if best and len(best) > 100:
                return best

    return None


def _fetch_player_and_extract(
    player_url: str,
    referer_url: str,
    method_name: str,
    client,
    actor_id: str,
) -> Optional[str]:
    """Phase 2: Fetch the vid3rb player page and extract MP4 video_sources.

    First tries direct HTTP (fast, free). Falls back to Apify actor if needed.
    """
    import json as _json

    # Try direct HTTP first — player page usually has no Cloudflare
    print(f"  [{method_name}] Phase 2: Fetching player page via HTTP...")
    video_url = _fetch_player_video_sources(player_url, referer_url)
    if video_url:
        return video_url

    # Fallback: Use the same Apify actor to fetch the player page
    print(f"  [{method_name}] Phase 2 fallback: Using Apify to fetch player page...")
    try:
        run2 = client.actor(actor_id).call(
            run_input={"url": player_url},
            timeout_secs=config.PAGE_LOAD_TIMEOUT + 60,
        )
    except Exception as e:
        print(f"  [{method_name}] Phase 2 fallback failed: {e}")
        return None

    dataset_id2 = run2.get("defaultDatasetId")
    if not dataset_id2:
        return None

    items2 = list(client.dataset(dataset_id2).iterate_items())
    player_html = _extract_html_from_apify_items(items2)
    if not player_html:
        # Also check raw item content for video URLs
        for item in items2:
            item_str = str(item)
            video_url = extract_video_url(item_str)
            if video_url:
                print(f"  [{method_name}] Found video URL in Phase 2 item data")
                return video_url
        print(f"  [{method_name}] Phase 2: no HTML from actor")
        return None

    print(f"  [{method_name}] Phase 2: got {len(player_html)} chars from actor")

    video_url = _fetch_player_sources_api(player_url, player_html, method_name)
    if video_url:
        return video_url

    # Parse video_sources from the player HTML
    video_url = _parse_video_sources_from_html(player_html, method_name)
    if video_url:
        return video_url

    # Fallback: raw URL extraction
    video_url = extract_video_url(player_html)
    if video_url:
        print(f"  [{method_name}] Found video URL in player HTML")
        return video_url

    print(f"  [{method_name}] Phase 2: no video URL found")
    _debug_response(method_name, player_html)
    return None


def _parse_video_sources_from_html(html: str, method_name: str) -> Optional[str]:
    """Extract the best MP4 URL from video_sources = [...] in HTML."""
    matches = re.findall(r'video_sources\s*=\s*(\[.*?\]);', html, re.DOTALL)
    for raw in reversed(matches):
        if len(raw) <= 5:
            continue
        try:
            sources = json.loads(raw)
            best = _pick_best_direct_candidate(
                _collect_direct_candidates_from_payload(sources),
                method_name,
            )
            if best:
                print(f"  [{method_name}] Found playable source in embedded video_sources")
                return best
        except Exception as e:
            print(f"  [{method_name}] Failed to parse video_sources: {e}")
    return None


def _fetch_player_video_sources(player_url: str, referer_url: str) -> Optional[str]:
    """Fetch the vid3rb player page via direct HTTP and extract the video URL.

    The player page (video.vid3rb.com) typically doesn't have Cloudflare.
    When fetched with the right Referer header, the HTML may contain:
      - video_sources = [{src: "https://files.vid3rb.com/.../1080p.mp4?...", ...}, ...]  (legacy)
      - video_sources = [{src: "https://video.vid3rb.com/video/<uuid>?speed=...&token=...", ...}] (new)
    Falls back to regex extraction if no video_sources JS array is found.
    """
    import requests as _requests

    session = _requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                       "AppleWebKit/537.36 (KHTML, like Gecko) "
                       "Chrome/120.0.0.0 Safari/537.36",
        "Referer": referer_url,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
    })

    try:
        print(f"  [apify] Fetching player page: {player_url[:80]}...")
        resp = session.get(player_url, timeout=30)
        print(f"  [apify] Player page status: {resp.status_code}, {len(resp.text)} chars")
    except Exception as e:
        print(f"  [apify] Player page fetch failed: {e}")
        return None

    if resp.status_code != 200:
        return None

    text = resp.text

    video_url = _fetch_player_sources_api(player_url, text, "apify")
    if video_url:
        return video_url

    # Extract video_sources = [...]; — take the last non-empty match
    # src values may be files.vid3rb.com MP4 (legacy) or video.vid3rb.com/video/ (new)
    matches = re.findall(r'video_sources\s*=\s*(\[.*?\]);', text, re.DOTALL)
    for raw in reversed(matches):
        if len(raw) <= 5:
            continue
        try:
            sources = json.loads(raw)
            best = _pick_best_direct_candidate(
                _collect_direct_candidates_from_payload(sources),
                "apify",
            )
            if best:
                print(f"  [apify] Found playable source from player page HTML")
                return best
        except Exception as e:
            print(f"  [apify] Failed to parse video_sources JSON: {e}")

    # Fallback: look for video URLs (MP4 or video.vid3rb.com/video/) in raw HTML
    video_url = extract_video_url(text)
    if video_url:
        print(f"  [apify] Found video URL in player page HTML")
        return video_url

    print(f"  [apify] No video URL found in player page HTML")
    _debug_response("apify-player", text)
    return None
