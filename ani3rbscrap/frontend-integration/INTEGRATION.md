# Frontend Integration Guide

## How it works

When a user opens an episode page on your site:

1. **EpisodeWatch.tsx** first checks Supabase DB for existing video sources
2. If no DB sources exist, it **automatically** calls the scraper API
3. The scraper API receives the anime name (from Jikan/MAL) + episode number
4. It searches anime3rb.com, finds the anime, builds the episode URL
5. It scrapes the episode page to extract the .mp4 video URL
6. The video URL is returned and played in the frontend player

## Setup Steps

### 1. Start the scraper API server

```bash
cd ani3rbscrap
pip install -r requirements.txt
python server.py
# Server runs on http://localhost:8000
```

### 2. Copy frontend files to otaku-view-nexus

```bash
# Copy the scraper API client
cp frontend-integration/scraper-api.ts ../otaku-view-nexus/src/lib/scraper-api.ts

# Replace the episode watch page
cp frontend-integration/EpisodeWatch.tsx ../otaku-view-nexus/src/pages/EpisodeWatch.tsx
```

### 3. Set the scraper API URL in your frontend

Add to your `.env` file in otaku-view-nexus:

```
VITE_SCRAPER_API_URL=http://localhost:8000
```

For production, set this to your deployed scraper API URL.

### 4. API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/resolve-by-name` | POST | Search anime by name + scrape episode video |
| `/api/resolve-by-name` | GET | Same but via query params (for testing) |
| `/api/resolve` | POST | Scrape video from a direct anime3rb URL |
| `/api/search` | GET | Search anime3rb without scraping |

### Example API call

```bash
# Search and scrape by anime name
curl -X POST http://localhost:8000/api/resolve-by-name \
  -H "Content-Type: application/json" \
  -d '{"anime_name": "naruto", "episode_number": 1}'

# Or via GET for testing
curl "http://localhost:8000/api/resolve-by-name?anime_name=naruto&episode_number=1"
```

### Flow diagram

```
User opens episode page
        │
        ▼
EpisodeWatch.tsx loads
        │
        ▼
Check Supabase DB for video sources
        │
    ┌───┴───┐
    │       │
  Found   Not found
    │       │
    ▼       ▼
  Play    Call scraper API
  video   (resolveVideoByName)
            │
            ▼
    Scraper searches anime3rb.com
            │
            ▼
    Builds episode URL from slug
            │
            ▼
    Scrapes video URL (.mp4)
            │
            ▼
    Returns to frontend → plays video
```
