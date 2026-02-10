

# Add Characters, Voice Actors, and Theme Songs to Anime Detail Page

## Overview
Add two new sections to the Anime Detail page: a "Characters & Voice Actors" grid and an "Opening & Ending Themes" list, both fetched from the Jikan MAL API.

---

## 1. API Layer (`src/lib/jikan.ts`)

Add two new functions and interfaces:

- **`getAnimeCharacters(id)`** -- calls `/anime/{id}/characters`
  - Returns array of `{ character: { mal_id, name, images, ... }, role, voice_actors: [{ person: { mal_id, name, images }, language }] }`
- **`getAnimeThemes(id)`** -- calls `/anime/{id}/themes`
  - Returns `{ openings: string[], endings: string[] }`

New interfaces:
- `JikanCharacter` with character info, role (Main/Supporting), and voice actors array
- `JikanThemes` with openings and endings string arrays

## 2. React Query Hooks (`src/hooks/useAnime.ts`)

- Add `useAnimeCharacters(id)` hook
- Add `useAnimeThemes(id)` hook

Both with `staleTime: 10 * 60 * 1000` matching existing detail hooks.

## 3. Anime Detail Page (`src/pages/AnimeDetail.tsx`)

### Characters & Voice Actors Section
- Placed between the episode list and recommendations sections
- Section title: "الشخصيات والممثلين الصوتيين" (Characters & Voice Actors)
- Grid layout showing character cards, each with:
  - Character image (left) and Japanese voice actor image (right) side by side
  - Character name and role (Main = "رئيسي", Supporting = "ثانوي") below character image
  - Voice actor name below their image
  - Filter to show only Japanese voice actors by default
- Show up to 12 characters initially, sorted by role (Main first)
- Loading skeletons while fetching

### Theme Songs Section
- Placed after Characters section, before Recommendations
- Section title split into two sub-sections:
  - "أغاني الافتتاح" (Opening Themes) with a music icon
  - "أغاني الختام" (Ending Themes) with a music icon
- Each theme displayed as a styled list item with the theme number and song title
- Clean card-based design matching the page style

## Technical Details

- Jikan endpoints used:
  - `GET /anime/{id}/characters` -- characters and voice actors
  - `GET /anime/{id}/themes` -- OP/ED theme songs
- Voice actors are filtered to `language === "Japanese"` to show only the primary VA
- Characters sorted: Main role first, then Supporting
- Theme strings come pre-formatted from MAL (e.g., `"1: \"Guren no Yumiya\" by Linked Horizon"`)

