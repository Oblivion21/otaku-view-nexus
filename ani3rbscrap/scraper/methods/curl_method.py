"""
Step 1 — curl_cffi

Zero overhead, no browser, fastest possible response.
Works if the site only uses TLS fingerprinting without JS challenges.
"""

import re
from typing import Optional

import config
from scraper.utils import extract_video_url, is_cloudflare_challenge, SkipMethod


METHOD_NAME = "curl_cffi"


async def scrape(episode_url: str) -> Optional[str]:
    """
    Attempt to fetch the episode page with curl_cffi and extract the video URL
    directly from the page source or embedded scripts.
    """
    try:
        from curl_cffi import requests as cffi_requests
    except ImportError:
        raise SkipMethod(f"{METHOD_NAME}: curl_cffi not installed")

    print(f"  [{METHOD_NAME}] Fetching {episode_url}")

    proxy = None
    if config.PROXY_SERVER:
        proxy = config.PROXY_SERVER
        if config.PROXY_USERNAME:
            # Insert credentials into proxy URL
            proxy = config.PROXY_SERVER.replace(
                "://",
                f"://{config.PROXY_USERNAME}:{config.PROXY_PASSWORD}@",
            )

    resp = cffi_requests.get(
        episode_url,
        impersonate="chrome",
        timeout=config.PAGE_LOAD_TIMEOUT,
        proxies={"https": proxy, "http": proxy} if proxy else None,
    )

    print(f"  [{METHOD_NAME}] Status: {resp.status_code}, body: {len(resp.text)} chars")

    if resp.status_code != 200:
        print(f"  [{METHOD_NAME}] Non-200 status, failing")
        return None

    if is_cloudflare_challenge(resp.text):
        print(f"  [{METHOD_NAME}] Got Cloudflare challenge page, failing")
        return None

    # Try to find the video URL directly in the page source
    video_url = extract_video_url(resp.text)
    if video_url:
        print(f"  [{METHOD_NAME}] Found video URL in page source")
        return video_url

    # Look for embedded video source tags
    video_src_pattern = r'<(?:source|video)[^>]+src=["\']([^"\']+\.mp4[^"\']*)["\']'
    match = re.search(video_src_pattern, resp.text)
    if match:
        url = match.group(1)
        print(f"  [{METHOD_NAME}] Found video URL in <source>/<video> tag")
        return url

    # Look for player config / JS variables that might contain the URL
    js_url_pattern = r'(?:src|url|file|source)\s*[:=]\s*["\']([^"\']*vid3rb\.com[^"\']*\.mp4[^"\']*)["\']'
    match = re.search(js_url_pattern, resp.text)
    if match:
        url = match.group(1)
        print(f"  [{METHOD_NAME}] Found video URL in JS config")
        return url

    print(f"  [{METHOD_NAME}] Page loaded but no video URL found in source")
    return None
