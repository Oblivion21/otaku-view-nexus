

# Add Poster Images to Related Seasons & Movies

## The Challenge
The Jikan `/anime/{id}/relations` endpoint only returns `mal_id`, `type`, `name`, and `url` for each related entry -- no images. To show posters, we need to fetch each related anime's data individually.

## Approach
Create a small `RelatedAnimeCard` component that takes a `mal_id` and fetches its own image using `useAnimeById`. This keeps the code clean and leverages React Query's caching (if the user already visited that anime, the data is cached).

## Changes

### 1. New Component: `src/components/RelatedAnimeCard.tsx`
- Accepts `mal_id`, `name`, and `relationLabel` as props
- Uses `useAnimeById(mal_id)` internally to fetch the poster image
- Displays a compact card with:
  - Poster thumbnail (small, roughly 80x112px with 3:4 aspect ratio)
  - Anime name
  - Relation type badge
- Shows a skeleton placeholder while the image loads
- Wrapped in a `Link` to `/anime/{mal_id}`

### 2. Update `src/pages/AnimeDetail.tsx`
- Replace the current text-only links in the "المواسم والأفلام المرتبطة" section with `RelatedAnimeCard` components
- Switch the layout from `flex-wrap` to a horizontal scrollable row or a responsive grid so the poster cards display nicely

## Technical Notes
- Each `RelatedAnimeCard` triggers its own `useAnimeById` call, but React Query deduplicates and caches these, so revisiting a page or navigating to a related anime is instant
- Jikan has rate limits (~3 req/sec), but React Query's staleTime prevents refetching cached data
- Typical anime has 3-8 relations, so the number of extra requests is manageable

