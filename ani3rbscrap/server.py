#!/usr/bin/env python3
"""
FastAPI server for the anime3rb scraper.

Exposes REST endpoints that the frontend calls when a user opens an episode page.
The scraper searches anime3rb.com, finds the matching episode, and returns the
video URL for playback.

Usage:
    uvicorn server:app --host 0.0.0.0 --port 8000
    # or
    python server.py
"""

import asyncio
import os
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from scraper.chain import scrape_video_url
from scraper.search import search_anime3rb, search_and_build_episode_urls

app = FastAPI(
    title="Anime3rb Scraper API",
    description="Scrapes anime3rb.com to resolve video URLs for episode playback",
    version="1.0.0",
)

# CORS — allow the frontend to call this API
# In production, restrict origins to your actual domain
ALLOWED_ORIGINS = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:3000,http://localhost:8080,https://*.vercel.app"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for development; restrict in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Request/Response models ────────────────────────────────────

class ResolveByUrlRequest(BaseModel):
    url: str
    methods: Optional[list[str]] = None


class ResolveByNameRequest(BaseModel):
    anime_name: str
    episode_number: int
    methods: Optional[list[str]] = None


class ResolveResponse(BaseModel):
    success: bool
    video_url: Optional[str] = None
    episode_page_url: Optional[str] = None
    error: Optional[str] = None


class SearchResponse(BaseModel):
    success: bool
    slug: Optional[str] = None
    url: Optional[str] = None
    error: Optional[str] = None


# ─── Endpoints ──────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/api/resolve", response_model=ResolveResponse)
async def resolve_by_url(req: ResolveByUrlRequest):
    """Resolve a video URL from a direct anime3rb episode page URL.

    This is the original flow — provide the full episode URL.
    """
    try:
        video_url = await scrape_video_url(req.url, methods=req.methods)
        if video_url:
            return ResolveResponse(
                success=True,
                video_url=video_url,
                episode_page_url=req.url,
            )
        return ResolveResponse(
            success=False,
            error="Could not extract video URL from the episode page",
            episode_page_url=req.url,
        )
    except Exception as e:
        return ResolveResponse(success=False, error=str(e))


@app.post("/api/resolve-by-name", response_model=ResolveResponse)
async def resolve_by_name(req: ResolveByNameRequest):
    """Search anime3rb for an anime by name, then scrape the episode video URL.

    This is the main endpoint for the frontend. When a user opens an episode page:
    1. Frontend sends the anime name (from Jikan/MAL) + episode number
    2. This endpoint searches anime3rb.com for the anime
    3. Builds the episode URL from the slug
    4. Scrapes the video URL using the fallback chain
    5. Returns the playable video URL
    """
    # Step 1: Search anime3rb for the anime slug and build candidate episode URLs
    episode_page_urls = await search_and_build_episode_urls(
        req.anime_name, req.episode_number
    )

    if not episode_page_urls:
        return ResolveResponse(
            success=False,
            error=f"Could not find '{req.anime_name}' on anime3rb.com",
        )

    # Step 2: Try scraping each candidate episode page URL
    last_error = None
    for episode_page_url in episode_page_urls:
        try:
            video_url = await scrape_video_url(episode_page_url, methods=req.methods)
            if video_url:
                return ResolveResponse(
                    success=True,
                    video_url=video_url,
                    episode_page_url=episode_page_url,
                )
        except Exception as e:
            last_error = str(e)

    if last_error:
        return ResolveResponse(
            success=False,
            error=last_error,
            episode_page_url=episode_page_urls[0],
        )

    return ResolveResponse(
        success=False,
        error="Found anime but could not extract video URL from candidate episode pages",
        episode_page_url=episode_page_urls[0],
    )


@app.get("/api/resolve-by-name", response_model=ResolveResponse)
async def resolve_by_name_get(
    anime_name: str = Query(..., description="Anime title to search for"),
    episode_number: int = Query(..., description="Episode number"),
    methods: Optional[str] = Query(None, description="Comma-separated scraping methods"),
):
    """GET version of resolve-by-name for easy testing.

    Example: /api/resolve-by-name?anime_name=naruto&episode_number=1
    """
    method_list = [m.strip() for m in methods.split(",")] if methods else None

    return await resolve_by_name(
        ResolveByNameRequest(
            anime_name=anime_name,
            episode_number=episode_number,
            methods=method_list,
        )
    )


@app.get("/api/search", response_model=SearchResponse)
async def search_anime(
    q: str = Query(..., description="Anime name to search for"),
):
    """Search anime3rb.com for an anime by name.

    Returns the anime slug and URL without scraping the video.
    Useful for previewing what the scraper will target.
    """
    result = await search_anime3rb(q)
    if result:
        return SearchResponse(
            success=True,
            slug=result["slug"],
            url=result["url"],
        )
    return SearchResponse(
        success=False,
        error=f"No results found for '{q}' on anime3rb.com",
    )


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
