

# Anime3rb Clone — Arabic Anime Streaming Site

## Overview
A full-featured Arabic anime browsing and streaming site, closely matching the anime3rb.com design — dark theme, RTL layout, with anime data from the Jikan API (MyAnimeList) and YouTube video embeds for playback.

---

## Pages & Features

### 1. Homepage
- **Hero slider/carousel** showcasing featured/trending anime with cover images, title, genres, rating, and episode count (in Arabic)
- **Sections**: Recently added episodes, popular anime, seasonal anime — displayed as card grids
- **Top navigation bar** with logo, search bar, genre dropdown, and navigation links (all RTL)
- **Footer** with links and site info

### 2. Anime Listing / Browse Page
- Grid of anime cards with poster image, title, rating, and genre tags
- **Filters**: by genre, season, year, status (airing/completed), and type (TV/Movie/OVA)
- **Search** with instant results
- Pagination or infinite scroll

### 3. Anime Detail Page
- Large banner/cover image
- Title (Japanese + Arabic), synopsis, genres, rating, studio, episode count, status, airing dates
- **Episode list** — clickable list of episodes

### 4. Episode Watch Page
- **YouTube embed player** for the selected episode (using trailer/related YouTube videos from Jikan API)
- Episode navigation (previous/next)
- Anime info sidebar
- Episode list below the player

### 5. Search Results Page
- Real-time search powered by Jikan API
- Results displayed as anime cards

---

## Design & Layout
- **Dark theme** with deep navy/black backgrounds matching the original site
- **RTL (right-to-left)** layout throughout — Arabic text direction
- Anime card grid design with hover effects
- Responsive design for mobile and desktop
- Color scheme: dark backgrounds with accent colors for ratings, genres, and CTAs

## Data Source
- **Jikan API** (free, no API key required) — fetches anime info, episodes, search, seasonal anime, and genres from MyAnimeList
- YouTube trailer embeds from Jikan's trailer data for video playback

## Technical Notes
- No backend or database needed — purely frontend
- All data fetched client-side via Jikan REST API using React Query for caching
- No user authentication required

