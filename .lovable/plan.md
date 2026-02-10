

# Add Related Seasons and Movies to Anime Detail Page

## What This Does
Adds a new "المواسم والأفلام المرتبطة" (Related Seasons & Movies) section to each anime's detail page. This section shows all sequels, prequels, side stories, movies, and other related entries -- making it easy to navigate between different parts of the same franchise.

## How It Works
The Jikan API provides a `/anime/{id}/relations` endpoint that returns grouped relations (e.g., Sequel, Prequel, Side Story, Alternative Version, Movie, etc.). Each group contains entries with their MAL IDs, names, and types (anime/manga). We filter to show only anime entries (not manga) and display them grouped by relation type.

## Changes

### 1. API Layer (`src/lib/jikan.ts`)
- Add a `JikanRelationEntry` interface for the relation data structure
- Add `getAnimeRelations(id)` function calling `/anime/{id}/relations`

### 2. React Query Hook (`src/hooks/useAnime.ts`)
- Add `useAnimeRelations(id)` hook with caching

### 3. Anime Detail Page (`src/pages/AnimeDetail.tsx`)
- Add a new section titled "المواسم والأفلام المرتبطة" placed after the main info area and before episodes
- Relations grouped by type (Sequel, Prequel, Side Story, etc.) with Arabic labels
- Each related anime entry is a clickable link to its detail page (`/anime/{mal_id}`)
- Manga entries are filtered out (only anime relations shown)
- Loading skeletons while fetching

### Visual Design
- Each relation group has a labeled header (e.g., "تتمة" for Sequel, "ما قبل" for Prequel)
- Entries displayed as styled cards/links with the anime title and type badge
- Consistent styling with existing sections (border-r-4 border-primary section headers)

### Relation Type Arabic Labels
| English | Arabic |
|---------|--------|
| Sequel | تتمة |
| Prequel | ما قبل |
| Side Story | قصة جانبية |
| Alternative Version | نسخة بديلة |
| Alternative Setting | إطار بديل |
| Summary | ملخص |
| Full Story | القصة الكاملة |
| Spin-off | عمل مشتق |
| Parent Story | القصة الأصلية |
| Character | شخصية |
| Other | أخرى |

## Technical Notes
- The `/anime/{id}/relations` response shape: `{ data: [{ relation: string, entry: [{ mal_id, type, name, url }] }] }`
- Filter entries where `type === "anime"` to exclude manga relations
- React Query staleTime set to 10 minutes matching other detail hooks
