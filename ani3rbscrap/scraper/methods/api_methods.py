"""
Steps 6–9 — Paid Scraping APIs

Each service handles Cloudflare/Turnstile server-side — there's nothing to
click. The key is sending the right parameters so each service enables its
full JS-rendering + challenge-solving pipeline.
"""

from typing import Optional

import config
from scraper.utils import extract_video_url, extract_player_iframe_url, is_cloudflare_challenge, SkipMethod


def _debug_response(name: str, text: str):
    """Print a snippet of the response to help diagnose failures."""
    snippet = text.replace("\n", " ")[:400]
    print(f"  [{name}] Response snippet: {snippet}")


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
    import re as _re
    import json as _json

    matches = _re.findall(r'video_sources\s*=\s*(\[.*?\]);', html, _re.DOTALL)
    for raw in reversed(matches):
        if len(raw) <= 5:
            continue
        try:
            sources = _json.loads(raw)
            valid = [s for s in sources if s.get("src") and not s.get("premium")]
            valid.sort(key=lambda s: int(s.get("res", 0)), reverse=True)
            if valid:
                best = valid[0]["src"].replace("\\/", "/")
                print(f"  [{method_name}] Found {len(valid)} sources, "
                      f"best: {valid[0].get('label', '?')}")
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
    import re as _re
    import json as _json
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

    # Extract video_sources = [...]; — take the last non-empty match
    # src values may be files.vid3rb.com MP4 (legacy) or video.vid3rb.com/video/ (new)
    matches = _re.findall(r'video_sources\s*=\s*(\[.*?\]);', text, _re.DOTALL)
    for raw in reversed(matches):
        if len(raw) <= 5:
            continue
        try:
            sources = _json.loads(raw)
            valid = [s for s in sources if s.get("src") and not s.get("premium")]
            valid.sort(key=lambda s: int(s.get("res", 0)), reverse=True)
            if valid:
                best = valid[0]["src"].replace("\\/", "/")
                print(f"  [apify] Found {len(valid)} sources from player page, "
                      f"best: {valid[0].get('label', '?')}")
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
