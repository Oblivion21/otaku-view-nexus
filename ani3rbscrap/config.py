"""
Configuration for the anime3rb scraper.

All credentials are loaded from environment variables. No secrets are embedded
in the repository.
"""

import os

# ─── Target site ───────────────────────────────────────────────
BASE_URL = "https://anime3rb.com"
VIDEO_HOST_PATTERN = "files.vid3rb.com"
VIDEO_HOST_PATTERN_ALT = "video.vid3rb.com/video/"
VIDEO_FILE_EXTENSION = ".mp4"

# ─── Optional proxy settings ──────────────────────────────────
PROXY_SERVER = os.environ.get("PROXY_SERVER")
PROXY_USERNAME = os.environ.get("PROXY_USERNAME")
PROXY_PASSWORD = os.environ.get("PROXY_PASSWORD")

# ─── Allowed remote fallback ──────────────────────────────────
APIFY_TOKEN = os.environ.get("APIFY_TOKEN")

# ─── Timeouts & retries ───────────────────────────────────────
PAGE_LOAD_TIMEOUT = 60
CHALLENGE_WAIT = 15
NETWORK_IDLE_TIMEOUT = 20
MAX_RETRIES = 2
