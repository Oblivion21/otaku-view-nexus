#!/usr/bin/env python3
"""
Quick diagnostic test — verifies each scraper method individually.

Usage:
    python test_scrape.py                          # Test all methods
    python test_scrape.py --method curl_cffi       # Test one method
    python test_scrape.py --url "https://..."      # Custom URL

This script does NOT require all dependencies to be installed.
It will skip methods whose packages are missing and report the results.
"""

import asyncio
import sys
import time

import config
from scraper.utils import is_cloudflare_challenge, extract_video_url


# ─── Diagnostic checks ────────────────────────────────────────

def check_dependencies():
    """Check which scraper dependencies are available."""
    deps = {
        "curl_cffi": False,
        "camoufox": False,
        "nodriver": False,
        "patchright": False,
        "requests": False,
    }

    for pkg in deps:
        try:
            __import__(pkg)
            deps[pkg] = True
        except ImportError:
            pass

    return deps


def print_diagnostics(html: str, method_name: str):
    """Print diagnostic info about a response."""
    print(f"\n  --- Diagnostics for {method_name} ---")
    print(f"  Content length:     {len(html)} chars")
    print(f"  Is CF challenge:    {is_cloudflare_challenge(html)}")
    print(f"  Has video URL:      {extract_video_url(html) is not None}")

    video_url = extract_video_url(html)
    if video_url:
        print(f"  Video URL:          {video_url[:100]}...")

    # Quick content summary
    if len(html) < 5000:
        print(f"  Likely:             Challenge/error page (very small)")
    else:
        print(f"  Likely:             Real page content")

    print(f"  First 200 chars:    {html[:200]}")
    print()


# ─── Individual method tests ──────────────────────────────────

async def test_curl_cffi(url: str) -> bool:
    """Test curl_cffi method."""
    try:
        from curl_cffi import requests as cffi_requests

        print("\n[TEST] curl_cffi — TLS fingerprint impersonation")
        start = time.time()

        resp = cffi_requests.get(url, impersonate="chrome", timeout=config.PAGE_LOAD_TIMEOUT)
        elapsed = time.time() - start

        print(f"  Status:   {resp.status_code}")
        print(f"  Time:     {elapsed:.1f}s")
        print_diagnostics(resp.text, "curl_cffi")

        passed = resp.status_code == 200 and not is_cloudflare_challenge(resp.text)
        print(f"  RESULT:   {'PASS' if passed else 'FAIL'}")
        return passed

    except ImportError:
        print("\n[SKIP] curl_cffi — not installed (pip install curl_cffi)")
        return False
    except Exception as e:
        print(f"\n[FAIL] curl_cffi — {e}")
        return False


async def test_camoufox(url: str) -> bool:
    """Test Camoufox method."""
    try:
        from camoufox.async_api import AsyncCamoufox

        print("\n[TEST] camoufox — Stealth Firefox browser")
        start = time.time()

        async with AsyncCamoufox(headless=True) as browser:
            page = await browser.new_page()
            await page.goto(url, wait_until="networkidle",
                            timeout=config.PAGE_LOAD_TIMEOUT * 1000)
            await asyncio.sleep(config.CHALLENGE_WAIT)
            content = await page.content()

        elapsed = time.time() - start

        print(f"  Time:     {elapsed:.1f}s")
        print_diagnostics(content, "camoufox")

        passed = not is_cloudflare_challenge(content) and len(content) > 5000
        print(f"  RESULT:   {'PASS' if passed else 'FAIL'}")
        return passed

    except ImportError:
        print("\n[SKIP] camoufox — not installed (pip install camoufox[geoip])")
        return False
    except Exception as e:
        print(f"\n[FAIL] camoufox — {e}")
        return False


async def test_nodriver(url: str) -> bool:
    """Test Nodriver method."""
    try:
        import nodriver as uc

        print("\n[TEST] nodriver — Stealth Chrome browser")
        start = time.time()

        browser = await uc.start()
        page = await browser.get(url)
        await asyncio.sleep(config.CHALLENGE_WAIT)
        content = await page.get_content()
        browser.stop()

        elapsed = time.time() - start

        print(f"  Time:     {elapsed:.1f}s")
        print_diagnostics(content, "nodriver")

        passed = not is_cloudflare_challenge(content) and len(content) > 5000
        print(f"  RESULT:   {'PASS' if passed else 'FAIL'}")
        return passed

    except ImportError:
        print("\n[SKIP] nodriver — not installed (pip install nodriver)")
        return False
    except Exception as e:
        print(f"\n[FAIL] nodriver — {e}")
        return False


async def test_patchright(url: str) -> bool:
    """Test Patchright method."""
    try:
        from patchright.async_api import async_playwright

        print("\n[TEST] patchright — Patched Playwright Chromium")
        start = time.time()

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=False)
            page = await browser.new_page()
            await page.goto(url, wait_until="networkidle",
                            timeout=config.PAGE_LOAD_TIMEOUT * 1000)
            await asyncio.sleep(config.CHALLENGE_WAIT)
            content = await page.content()
            await browser.close()

        elapsed = time.time() - start

        print(f"  Time:     {elapsed:.1f}s")
        print_diagnostics(content, "patchright")

        passed = not is_cloudflare_challenge(content) and len(content) > 5000
        print(f"  RESULT:   {'PASS' if passed else 'FAIL'}")
        return passed

    except ImportError:
        print("\n[SKIP] patchright — not installed (pip install patchright)")
        return False
    except Exception as e:
        print(f"\n[FAIL] patchright — {e}")
        return False


# ─── Main ─────────────────────────────────────────────────────

async def run_tests(url: str, method: str = None):
    """Run all (or one) method tests and print summary."""

    print("=" * 60)
    print("anime3rb Cloudflare Bypass — Diagnostic Test")
    print("=" * 60)
    print(f"Target URL: {url}")

    # Check dependencies
    deps = check_dependencies()
    print(f"\nInstalled packages:")
    for pkg, installed in deps.items():
        status = "✓" if installed else "✗"
        print(f"  {status} {pkg}")

    tests = {
        "curl_cffi": test_curl_cffi,
        "camoufox": test_camoufox,
        "nodriver": test_nodriver,
        "patchright": test_patchright,
    }

    results = {}

    if method:
        if method in tests:
            results[method] = await tests[method](url)
        else:
            print(f"\nUnknown method: {method}")
            print(f"Available: {', '.join(tests.keys())}")
            return
    else:
        for name, test_fn in tests.items():
            results[name] = await test_fn(url)

    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    for name, passed in results.items():
        status = "PASS" if passed else "FAIL/SKIP"
        print(f"  {name:20s} {status}")

    working = [name for name, passed in results.items() if passed]
    if working:
        print(f"\nRecommendation: Use '{working[0]}' as your primary method.")
    else:
        print(f"\nNo free methods passed. Try:")
        print(f"  1. Adding a residential proxy (see config.py)")
        print(f"  2. Configuring a paid API key (see config.py)")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Test scraper methods")
    parser.add_argument(
        "--url",
        default="https://anime3rb.com",
        help="URL to test against (default: anime3rb.com homepage)",
    )
    parser.add_argument(
        "--method",
        default=None,
        help="Test only this method (curl_cffi, camoufox, nodriver, patchright)",
    )
    args = parser.parse_args()

    asyncio.run(run_tests(args.url, args.method))
