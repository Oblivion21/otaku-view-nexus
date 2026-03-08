"""
Step 3 — Nodriver

Successor to undetected-chromedriver. Simpler API.
May work if the site's Cloudflare config doesn't use CDP detection.
Intercepts network requests to capture the video mp4 URL.
"""

import asyncio
import random
from typing import Optional

import config
from scraper.utils import (
    extract_video_url, extract_player_iframe_url, is_cloudflare_challenge,
    SkipMethod, PLAYER_INTERCEPT_JS,
)


METHOD_NAME = "nodriver"


async def _solve_turnstile_nodriver(page, browser) -> bool:
    """
    Attempt to solve Cloudflare Turnstile by clicking the checkbox iframe.
    Uses nodriver's CDP-based API.
    Returns True if the challenge was solved.
    """
    await asyncio.sleep(2)

    content = await page.get_content()
    if not is_cloudflare_challenge(content):
        print(f"  [{METHOD_NAME}] No Cloudflare challenge detected")
        return True

    print(f"  [{METHOD_NAME}] Cloudflare Turnstile detected, attempting to solve...")

    # Find the Turnstile iframe and click it
    clicked = False
    for selector in [
        "iframe[src*='challenges.cloudflare.com']",
        ".cf-turnstile iframe",
        "#turnstile-wrapper iframe",
    ]:
        try:
            iframe_el = await page.query_selector(selector)
            if iframe_el:
                # Click with a small offset to hit the checkbox area (left side)
                await asyncio.sleep(random.uniform(0.3, 1.0))
                await iframe_el.click()
                print(f"  [{METHOD_NAME}] Clicked Turnstile iframe via '{selector}'")
                clicked = True
                break
        except Exception as e:
            print(f"  [{METHOD_NAME}] Selector '{selector}' failed: {e}")
            continue

    # Fallback: use JS to find and click the iframe
    if not clicked:
        try:
            result = await page.evaluate("""
                (() => {
                    const iframe = document.querySelector(
                        "iframe[src*='challenges.cloudflare.com']"
                    ) || document.querySelector(".cf-turnstile iframe");
                    if (iframe) {
                        const rect = iframe.getBoundingClientRect();
                        return {x: rect.x + 32, y: rect.y + rect.height / 2};
                    }
                    return null;
                })()
            """)
            if result:
                await asyncio.sleep(random.uniform(0.3, 1.0))
                await page.send(
                    __import__("nodriver").cdp.input_.dispatch_mouse_event(
                        type_="mousePressed",
                        x=result["x"],
                        y=result["y"],
                        button=__import__("nodriver").cdp.input_.MouseButton("left"),
                        click_count=1,
                    )
                )
                await page.send(
                    __import__("nodriver").cdp.input_.dispatch_mouse_event(
                        type_="mouseReleased",
                        x=result["x"],
                        y=result["y"],
                        button=__import__("nodriver").cdp.input_.MouseButton("left"),
                        click_count=1,
                    )
                )
                print(f"  [{METHOD_NAME}] Clicked Turnstile via CDP mouse event at ({result['x']:.0f}, {result['y']:.0f})")
                clicked = True
        except Exception as e:
            print(f"  [{METHOD_NAME}] CDP click fallback failed: {e}")

    if not clicked:
        print(f"  [{METHOD_NAME}] Could not find Turnstile widget to click")
        return False

    # Wait for challenge to resolve
    print(f"  [{METHOD_NAME}] Waiting for challenge to resolve...")
    for i in range(config.CHALLENGE_WAIT):
        await asyncio.sleep(1)
        try:
            content = await page.get_content()
            if not is_cloudflare_challenge(content):
                print(f"  [{METHOD_NAME}] Challenge solved after {i + 1}s")
                return True
        except Exception:
            pass

    print(f"  [{METHOD_NAME}] Challenge did not resolve within {config.CHALLENGE_WAIT}s")
    return False


async def scrape(episode_url: str) -> Optional[str]:
    """
    Launch a stealth Chrome browser via nodriver, navigate to the episode page,
    solve the Turnstile challenge, and capture the mp4 video URL via CDP.
    """
    try:
        import nodriver as uc
    except ImportError:
        raise SkipMethod(f"{METHOD_NAME}: nodriver not installed")

    print(f"  [{METHOD_NAME}] Launching stealth Chrome browser")

    browser = None

    try:
        browser_args = []
        if config.PROXY_SERVER:
            browser_args.append(f"--proxy-server={config.PROXY_SERVER}")

        browser = await uc.start(browser_args=browser_args if browser_args else None)

        # Enable network domain for request interception via CDP
        page = await browser.get("about:blank")
        await page.send(uc.cdp.network.enable())

        print(f"  [{METHOD_NAME}] Navigating to {episode_url}")
        page = await browser.get(episode_url)

        # Solve Turnstile challenge
        solved = await _solve_turnstile_nodriver(page, browser)
        if not solved:
            print(f"  [{METHOD_NAME}] Failed to solve Turnstile challenge")
            return None

        content = await page.get_content()
        print(f"  [{METHOD_NAME}] Page loaded ({len(content)} chars)")

        # Check page source for direct video URL
        video_url = extract_video_url(content)
        if video_url:
            print(f"  [{METHOD_NAME}] Found video URL in page source")
            return video_url

        # --- Strategy: find the vid3rb player iframe and navigate into it ---
        player_iframe_url = extract_player_iframe_url(content)

        if player_iframe_url:
            print(f"  [{METHOD_NAME}] Found player iframe: {player_iframe_url[:80]}...")

            # Navigate to the player iframe URL in a new tab
            player_page = await browser.get(player_iframe_url)
            await asyncio.sleep(3)

            # Inject JS that clicks play and intercepts .mp4 network requests
            print(f"  [{METHOD_NAME}] Injecting play + network intercept script...")
            try:
                mp4_url = await player_page.evaluate(PLAYER_INTERCEPT_JS)
                if mp4_url:
                    print(f"  [{METHOD_NAME}] Got .mp4 URL from player JS: {mp4_url[:80]}...")
                    return mp4_url
            except Exception as e:
                print(f"  [{METHOD_NAME}] Player JS error: {e}")

            # Check player page source
            player_content = await player_page.get_content()
            video_url = extract_video_url(player_content)
            if video_url:
                print(f"  [{METHOD_NAME}] Found video URL in player page source")
                return video_url

        # --- Fallback: PerformanceObserver on main page ---
        await page.evaluate("""
            window.__captured_video_urls = [];
            function _isVid3rbUrl(url) {
                return (url.includes('files.vid3rb.com') && url.includes('.mp4'))
                    || url.includes('video.vid3rb.com/video/');
            }
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (_isVid3rbUrl(entry.name)) {
                        window.__captured_video_urls.push(entry.name);
                    }
                }
            });
            observer.observe({ entryTypes: ['resource'] });

            performance.getEntriesByType('resource').forEach(entry => {
                if (_isVid3rbUrl(entry.name)) {
                    window.__captured_video_urls.push(entry.name);
                }
            });
        """)

        # Try to find and click play button on main page
        play_selectors = [
            "button.play-button",
            ".plyr__control--overlaid",
            "[data-plyr='play']",
            ".vjs-big-play-button",
            "video",
            ".player-container",
            ".btn-play",
            "#player",
        ]

        for selector in play_selectors:
            try:
                element = await page.query_selector(selector)
                if element:
                    print(f"  [{METHOD_NAME}] Clicking play element: {selector}")
                    await element.click()
                    break
            except Exception:
                continue

        # Wait for video request to appear
        print(f"  [{METHOD_NAME}] Waiting for video network request...")
        for _ in range(config.NETWORK_IDLE_TIMEOUT):
            await asyncio.sleep(1)

            try:
                urls = await page.evaluate("window.__captured_video_urls || []")
                if urls:
                    print(f"  [{METHOD_NAME}] Captured video URL via PerformanceObserver")
                    return urls[0]
            except Exception:
                pass

            try:
                video_src = await page.evaluate("""
                    (() => {
                        const video = document.querySelector('video');
                        if (video && video.src && video.src.includes('vid3rb.com'))
                            return video.src;
                        const source = document.querySelector('video source');
                        if (source && source.src && source.src.includes('vid3rb.com'))
                            return source.src;
                        return null;
                    })()
                """)
                if video_src:
                    print(f"  [{METHOD_NAME}] Found video URL in <video> element")
                    return video_src
            except Exception:
                pass

        print(f"  [{METHOD_NAME}] No video URL captured")
        return None

    except Exception as e:
        print(f"  [{METHOD_NAME}] Error: {e}")
        return None
    finally:
        if browser:
            try:
                browser.stop()
            except Exception:
                pass
