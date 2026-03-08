"""
Apify-based scraping methods.

These methods follow the source repo's two-phase flow:
1. Fetch the anime3rb episode page via an Apify actor.
2. Extract the vid3rb player iframe URL from the page.
3. Fetch the player page directly and parse `video_sources` for the best MP4.
"""

from typing import Optional

import config
from scraper.utils import extract_video_url, extract_player_iframe_url, is_cloudflare_challenge, SkipMethod


def _debug_response(name: str, text: str):
    """Print a snippet of the response to help diagnose failures."""
    snippet = text.replace("\n", " ")[:400]
    print(f"  [{name}] Response snippet: {snippet}")


async def scrape_apify_bypasser(episode_url: str) -> Optional[str]:
    """Use macheta/universal-bypasser to bypass Cloudflare and extract video URL.

    Two-phase approach:
      Phase 1: Bypass Cloudflare on the anime3rb episode page, get HTML,
               extract the vid3rb player iframe URL.
      Phase 2: Fetch the player page (usually no CF) to get video_sources MP4 URLs.
    """
    if not config.APIFY_TOKEN:
        raise SkipMethod("apify_bypasser: no token in environment (APIFY_TOKEN) — sign up free at https://apify.com")

    try:
        from apify_client import ApifyClient
    except ImportError:
        raise SkipMethod("apify_bypasser: pip install apify-client")

    actor_id = "macheta/universal-bypasser"
    print("  [apify_bypasser] Running universal-bypasser on Apify cloud")

    client = ApifyClient(config.APIFY_TOKEN)

    try:
        run = client.actor(actor_id).call(
            run_input={"url": episode_url},
            max_items=1,
            timeout_secs=config.PAGE_LOAD_TIMEOUT + 60,
            wait_secs=config.PAGE_LOAD_TIMEOUT + 60,
            logger=None,
        )
    except Exception as e:
        print(f"  [apify_bypasser] Actor run failed: {e}")
        return None

    print(f"  [apify_bypasser] Phase 1 done, status: {run.get('status')}")

    dataset_id = run.get("defaultDatasetId")
    if not dataset_id:
        print("  [apify_bypasser] No dataset returned")
        return None

    items = _take_dataset_items(client.dataset(dataset_id))
    if not items:
        print("  [apify_bypasser] Dataset is empty")
        return None

    html_content = _extract_html_from_apify_items(items)
    if not html_content:
        print("  [apify_bypasser] No HTML in response")
        return None

    print(f"  [apify_bypasser] Got HTML: {len(html_content)} chars")

    if is_cloudflare_challenge(html_content):
        print("  [apify_bypasser] Still got Cloudflare challenge")
        return None

    player_iframe_url = extract_player_iframe_url(html_content)
    if player_iframe_url:
        print(f"  [apify_bypasser] Found player iframe: {player_iframe_url[:80]}...")
        return _fetch_player_and_extract(player_iframe_url, episode_url, "apify_bypasser")

    video_url = extract_video_url(html_content)
    if video_url:
        print("  [apify_bypasser] Found video URL directly in HTML")
        return video_url

    print("  [apify_bypasser] No player iframe or video URL found")
    _debug_response("apify_bypasser", html_content)
    return None


async def scrape_apify_scraper(episode_url: str) -> Optional[str]:
    """Use zfcsoftware/scraper-api to bypass Cloudflare and extract video URL.

    Same two-phase approach as apify_bypasser.
    """
    if not config.APIFY_TOKEN:
        raise SkipMethod("apify_scraper: no token in environment (APIFY_TOKEN) — sign up free at https://apify.com")

    try:
        from apify_client import ApifyClient
    except ImportError:
        raise SkipMethod("apify_scraper: pip install apify-client")

    actor_id = "zfcsoftware/scraper-api"
    print("  [apify_scraper] Running scraper-api on Apify cloud")

    client = ApifyClient(config.APIFY_TOKEN)

    try:
        run = client.actor(actor_id).call(
            run_input={"url": episode_url},
            max_items=1,
            timeout_secs=config.PAGE_LOAD_TIMEOUT + 60,
            wait_secs=config.PAGE_LOAD_TIMEOUT + 60,
            logger=None,
        )
    except Exception as e:
        print(f"  [apify_scraper] Actor run failed: {e}")
        return None

    print(f"  [apify_scraper] Phase 1 done, status: {run.get('status')}")

    dataset_id = run.get("defaultDatasetId")
    if not dataset_id:
        print("  [apify_scraper] No dataset returned")
        return None

    items = _take_dataset_items(client.dataset(dataset_id))
    if not items:
        print("  [apify_scraper] Dataset is empty")
        return None

    html_content = _extract_html_from_apify_items(items)
    if not html_content:
        print("  [apify_scraper] No HTML in response")
        return None

    print(f"  [apify_scraper] Got HTML: {len(html_content)} chars")

    if is_cloudflare_challenge(html_content):
        print("  [apify_scraper] Still got Cloudflare challenge")
        return None

    player_iframe_url = extract_player_iframe_url(html_content)
    if player_iframe_url:
        print(f"  [apify_scraper] Found player iframe: {player_iframe_url[:80]}...")
        return _fetch_player_and_extract(player_iframe_url, episode_url, "apify_scraper")

    video_url = extract_video_url(html_content)
    if video_url:
        print("  [apify_scraper] Found video URL directly in HTML")
        return video_url

    print("  [apify_scraper] No player iframe or video URL found")
    _debug_response("apify_scraper", html_content)
    return None


def _extract_html_from_apify_items(items: list) -> Optional[str]:
    """Extract HTML body content from Apify actor dataset items."""
    for item in items:
        for key in ("body", "html", "content", "text", "page_content", "result"):
            val = item.get(key)
            if val and isinstance(val, str) and len(val) > 100:
                return val

        data = item.get("data")
        if isinstance(data, dict):
            for key in ("body", "html", "content"):
                val = data.get(key)
                if val and isinstance(val, str) and len(val) > 100:
                    return val

        item_str = str(item)
        if "<html" in item_str.lower() and len(item_str) > 500:
            best = ""
            for value in item.values():
                if isinstance(value, str) and len(value) > len(best):
                    best = value
            if best and len(best) > 100:
                return best

    return None


def _take_dataset_items(dataset_client, limit: int = 3) -> list[dict]:
    """Read only the first few dataset items instead of materializing the whole dataset."""
    items: list[dict] = []
    for item in dataset_client.iterate_items(clean=True):
        items.append(item)
        if len(items) >= limit:
            break
    return items


def _fetch_player_and_extract(
    player_url: str,
    referer_url: str,
    method_name: str,
) -> Optional[str]:
    """Phase 2: Fetch the vid3rb player page and extract MP4 video_sources."""
    print(f"  [{method_name}] Phase 2: Fetching player page via HTTP...")
    return _fetch_player_video_sources(player_url, referer_url)


def _parse_video_sources_from_html(html: str, method_name: str) -> Optional[str]:
    """Extract the best MP4 URL from video_sources = [...] in HTML."""
    import json as _json
    import re as _re

    matches = _re.findall(r"video_sources\s*=\s*(\[.*?\]);", html, _re.DOTALL)
    for raw in reversed(matches):
        if len(raw) <= 5:
            continue
        try:
            sources = _json.loads(raw)
            valid = [s for s in sources if s.get("src") and not s.get("premium")]
            valid.sort(key=lambda s: int(s.get("res", 0)), reverse=True)
            if valid:
                best = valid[0]["src"].replace("\\/", "/")
                print(f"  [{method_name}] Found {len(valid)} sources, best: {valid[0].get('label', '?')}")
                return best
        except Exception as e:
            print(f"  [{method_name}] Failed to parse video_sources: {e}")
    return None


def _fetch_player_video_sources(player_url: str, referer_url: str) -> Optional[str]:
    """Fetch the vid3rb player page via direct HTTP and extract video_sources."""
    import json as _json
    import re as _re
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

    matches = _re.findall(r"video_sources\s*=\s*(\[.*?\]);", text, _re.DOTALL)
    for raw in reversed(matches):
        if len(raw) <= 5:
            continue
        try:
            sources = _json.loads(raw)
            valid = [s for s in sources if s.get("src") and not s.get("premium")]
            valid.sort(key=lambda s: int(s.get("res", 0)), reverse=True)
            if valid:
                best = valid[0]["src"].replace("\\/", "/")
                print(f"  [apify] Found {len(valid)} sources from player page, best: {valid[0].get('label', '?')}")
                return best
        except Exception as e:
            print(f"  [apify] Failed to parse video_sources JSON: {e}")

    video_url = extract_video_url(text)
    if video_url:
        print("  [apify] Found video URL in player page HTML")
        return video_url

    print("  [apify] No video_sources found in player page HTML")
    _debug_response("apify-player", text)
    return None
