"""
Search anime3rb.com for an anime by name and resolve episode URLs.

The anime3rb site uses slugs like:
  https://anime3rb.com/anime/<slug>
  https://anime3rb.com/titles/<slug>
  https://anime3rb.com/episode/<slug>-episode-<number>
  https://anime3rb.com/episode/<slug>/<number>

This module handles:
  1. Searching anime3rb.com for an anime by its title
  2. Building the correct episode URL from the slug + episode number
"""

import re
import time
from typing import Optional
from urllib.parse import quote_plus

import config


def _normalize_text(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _score_slug(slug: str, query: str) -> int:
    slug_norm = _normalize_text(slug.replace("-", " "))
    query_norm = _normalize_text(query)

    if not slug_norm or not query_norm:
        return 0

    score = 0
    if query_norm in slug_norm:
        score += 5

    slug_tokens = set(slug_norm.split())
    query_tokens = set(query_norm.split())
    score += len(slug_tokens & query_tokens)
    return score


def _build_search_queries(anime_name: str) -> list[str]:
    """Generate fallback search queries from a potentially long/compound title."""
    queries = [anime_name.strip()]

    # Titles often include subtitles after ":" or "-".
    if ":" in anime_name:
        queries.append(anime_name.split(":", 1)[0].strip())
    if " - " in anime_name:
        queries.append(anime_name.split(" - ", 1)[0].strip())

    # Punctuation-stripped variant.
    cleaned = re.sub(r"[^\w\s]+", " ", anime_name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if cleaned:
        queries.append(cleaned)

    # De-duplicate while preserving order
    out: list[str] = []
    seen: set[str] = set()
    for q in queries:
        if q and q not in seen:
            seen.add(q)
            out.append(q)
    return out


def _extract_html_from_apify_items(items: list) -> Optional[str]:
    """Extract HTML body content from Apify dataset items."""
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

    return None


def _proxy_url_with_auth() -> Optional[str]:
    if not config.PROXY_SERVER:
        return None
    if config.PROXY_USERNAME and config.PROXY_PASSWORD:
        return config.PROXY_SERVER.replace(
            "://",
            f"://{config.PROXY_USERNAME}:{config.PROXY_PASSWORD}@",
        )
    return config.PROXY_SERVER


def _fetch_html_via_apify(url: str, label: str) -> Optional[str]:
    if not config.APIFY_TOKEN:
        return None

    try:
        from apify_client import ApifyClient
    except ImportError:
        return None

    actor_id = "macheta/universal-bypasser"
    client = ApifyClient(config.APIFY_TOKEN)
    for attempt in range(1, 3):
        try:
            run = client.actor(actor_id).call(
                run_input={"url": url},
                timeout_secs=config.PAGE_LOAD_TIMEOUT + 60,
            )
            dataset_id = run.get("defaultDatasetId")
            if not dataset_id:
                continue
            items = list(client.dataset(dataset_id).iterate_items())
            if not items:
                continue
            html = _extract_html_from_apify_items(items)
            if html:
                return html
        except Exception as e:
            print(f"  [{label}] Apify fallback failed (attempt {attempt}/2): {e}")
            if attempt < 2:
                time.sleep(2)
    return None


def _fetch_html(url: str, label: str) -> tuple[Optional[str], Optional[int]]:
    """Fetch HTML with progressively stronger bypass strategies."""
    html = None
    status = None
    proxy_url = _proxy_url_with_auth()
    proxies = {"https": proxy_url, "http": proxy_url} if proxy_url else None

    # Attempt 1: curl_cffi with TLS impersonation
    try:
        from curl_cffi import requests as cffi_requests
        resp = cffi_requests.get(
            url,
            impersonate="chrome",
            timeout=config.PAGE_LOAD_TIMEOUT,
            proxies=proxies,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
                "Referer": config.BASE_URL,
            },
        )
        status = resp.status_code
        if status == 200 and resp.text:
            html = resp.text
    except Exception as e:
        print(f"  [{label}] curl_cffi attempt failed: {e}")

    # Attempt 2: requests fallback
    if html is None:
        import requests
        try:
            resp = requests.get(
                url,
                timeout=config.PAGE_LOAD_TIMEOUT,
                proxies=proxies,
                headers={
                    "User-Agent": (
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) "
                        "Chrome/120.0.0.0 Safari/537.36"
                    ),
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
                    "Referer": config.BASE_URL,
                },
            )
            status = resp.status_code
            if status == 200 and resp.text:
                html = resp.text
        except Exception as e:
            print(f"  [{label}] requests attempt failed: {e}")

    # Attempt 3: Apify bypass fallback
    if html is None:
        html = _fetch_html_via_apify(url, label)
        if html:
            status = 200

    return html, status


async def search_anime3rb(anime_name: str) -> Optional[dict]:
    """Search anime3rb.com for an anime by name and return the best match.

    Returns dict with keys: title, slug, url, or None if not found.
    """
    all_candidates: dict[tuple[str, str], int] = {}
    any_status = None

    for query in _build_search_queries(anime_name):
        search_url = f"{config.BASE_URL}/search?q={quote_plus(query)}"
        print(f"  [search] Searching anime3rb: {search_url}")

        html, status = _fetch_html(search_url, "search")
        if status is not None:
            any_status = status

        if html is None:
            print(f"  [search] Search returned status {status} for query '{query}'")
            continue

        # Extract anime entries from search results.
        # Support both legacy /anime/<slug> and current /titles/<slug>.
        matches = re.findall(
            r'href=["\'](?:https?://(?:www\.)?anime3rb\.com)?/(anime|titles)/([^"\'/?#]+)["\']',
            html,
            flags=re.IGNORECASE,
        )

        if not matches:
            print(f"  [search] No anime found in search results for query '{query}'")
            continue

        for route, slug in matches:
            key = (route.lower(), slug)
            score = _score_slug(slug, anime_name)
            if key not in all_candidates or score > all_candidates[key]:
                all_candidates[key] = score

    if not all_candidates:
        print(f"  [search] No anime found across all queries (last status: {any_status})")
        return None

    # Choose the best match based on slug/query similarity.
    best_route, best_slug = max(all_candidates.items(), key=lambda item: item[1])[0]
    print(f"  [search] Found anime slug: {best_slug} (route: {best_route})")

    return {
        "slug": best_slug,
        "url": f"{config.BASE_URL}/{best_route}/{best_slug}",
    }


def build_episode_url(anime_slug: str, episode_number: int) -> str:
    """Build the anime3rb episode page URL from slug and episode number.

    anime3rb episode URL format: https://anime3rb.com/episode/<slug>-episode-<number>
    """
    return f"{config.BASE_URL}/episode/{anime_slug}-episode-{episode_number}"


def build_episode_url_candidates(anime_slug: str, episode_number: int) -> list[str]:
    """Build candidate anime3rb episode page URLs for different site formats."""
    candidates = [
        f"{config.BASE_URL}/episode/{anime_slug}-episode-{episode_number}",
        f"{config.BASE_URL}/episode/{anime_slug}/{episode_number}",
        f"{config.BASE_URL}/episodes/{anime_slug}/{episode_number}",
    ]

    # De-duplicate while preserving order
    deduped: list[str] = []
    seen: set[str] = set()
    for url in candidates:
        if url not in seen:
            seen.add(url)
            deduped.append(url)
    return deduped


def _extract_episode_links_from_title_html(html: str, anime_slug: str) -> list[str]:
    """Extract ordered episode links from an anime title page."""
    links: list[str] = []
    seen: set[str] = set()

    pattern = (
        r'href=["\'](?:https?://(?:www\.)?anime3rb\.com)?/episode/([^"\'?#]+)["\']'
    )
    for match in re.finditer(pattern, html, flags=re.IGNORECASE):
        raw_path = match.group(1).strip("/")
        url = None
        slug = None

        # Format A: /episode/<slug>/<number>
        m_a = re.match(r"([^/]+)/(\d+)$", raw_path)
        if m_a:
            slug = m_a.group(1)
            url = f"{config.BASE_URL}/episode/{slug}/{m_a.group(2)}"
        else:
            # Format B: /episode/<slug>-episode-<number>
            m_b = re.match(r"(.+)-episode-(\d+)$", raw_path)
            if m_b:
                slug = m_b.group(1)
                url = f"{config.BASE_URL}/episode/{slug}-episode-{m_b.group(2)}"

        if not url or not slug:
            continue

        # Keep only links that map to the same title slug.
        if slug != anime_slug and anime_slug not in slug and slug not in anime_slug:
            continue

        if url not in seen:
            seen.add(url)
            links.append(url)

    return links


def _dedupe_urls(urls: list[str]) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if url not in seen:
            seen.add(url)
            deduped.append(url)
    return deduped


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


async def search_and_build_episode_urls(
    anime_name: str, episode_number: int
) -> Optional[list[str]]:
    """Search for anime and return candidate episode URLs for multiple formats."""
    result = await search_anime3rb(anime_name)
    if not result:
        return None

    anime_slug = result["slug"]
    episode_urls: list[str] = []

    # 1) Fetch title page and map requested episode number by list position.
    title_url = result["url"]
    print(f"  [search] Fetching title page: {title_url}")
    title_html, title_status = _fetch_html(title_url, "search")
    if title_html:
        title_episode_links = _extract_episode_links_from_title_html(title_html, anime_slug)
        if title_episode_links:
            if 1 <= episode_number <= len(title_episode_links):
                # Primary mapping: forward index (ep 1 -> /1, ep 2 -> /2, ...).
                mapped_forward = title_episode_links[episode_number - 1]
                print(
                    f"  [search] Mapped episode #{episode_number} by title list position -> {mapped_forward}"
                )
                episode_urls.append(mapped_forward)

            # Also try direct numeric match if present (same episode number in URL).
            exact_suffix = f"/{episode_number}"
            for link in title_episode_links:
                if link.endswith(exact_suffix):
                    episode_urls.append(link)
                    break
    else:
        print(f"  [search] Title page fetch returned status {title_status}")

    # 2) Fallback URL patterns.
    episode_urls.extend(build_episode_url_candidates(anime_slug, episode_number))
    episode_urls = _dedupe_urls(episode_urls)
    print(f"  [search] Episode URL candidates: {episode_urls}")
    return episode_urls
