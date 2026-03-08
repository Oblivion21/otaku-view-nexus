#!/usr/bin/env python3
"""
anime3rb Cloudflare Bypass Scraper — CLI entry point.

Usage:
    python main.py <episode_url>
    python main.py <episode_url> --methods curl_cffi,camoufox
    python main.py <episode_url> --method camoufox

Examples:
    python main.py "https://anime3rb.com/episode/some-anime/1"
    python main.py "https://anime3rb.com/episode/some-anime/1" --methods curl_cffi,nodriver
"""

import argparse
import asyncio
import sys

from scraper.chain import scrape_video_url


def main():
    parser = argparse.ArgumentParser(
        description="Scrape mp4 video URL from a Cloudflare-protected anime3rb episode page.",
    )
    parser.add_argument(
        "url",
        help="Full URL of the anime episode page to scrape",
    )
    parser.add_argument(
        "--methods",
        type=str,
        default=None,
        help="Comma-separated list of methods to try (e.g. curl_cffi,camoufox,nodriver)",
    )
    parser.add_argument(
        "--method",
        type=str,
        default=None,
        help="Single method to use (e.g. camoufox)",
    )

    args = parser.parse_args()

    methods = None
    if args.method:
        methods = [args.method]
    elif args.methods:
        methods = [m.strip() for m in args.methods.split(",")]

    result = asyncio.run(scrape_video_url(args.url, methods=methods))

    if result:
        print(f"\n{'='*60}")
        print(f"VIDEO URL: {result}")
        print(f"{'='*60}")
        sys.exit(0)
    else:
        print(f"\nFailed to extract video URL from: {args.url}")
        print("Try running with --methods to test specific methods,")
        print("or configure API keys in config.py for paid services.")
        sys.exit(1)


if __name__ == "__main__":
    main()
