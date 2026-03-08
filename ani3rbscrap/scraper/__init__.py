import sys
import os

# Ensure the project root (parent of this package) is on sys.path so that
# `import config` works regardless of where the script is launched from.
_project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _project_root not in sys.path:
    sys.path.insert(0, _project_root)

from scraper.chain import scrape_video_url

__all__ = ["scrape_video_url"]
