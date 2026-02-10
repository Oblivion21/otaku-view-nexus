

# Add Best Anime Movies Tab + Related Recommendations

## 1. Best Anime Movies section on Homepage

Add a new "افضل افلام الأنمي" (Best Anime Movies) section to the homepage using the Jikan API endpoint `/top/anime?type=movie` to fetch top-rated movies.

**Changes to `src/lib/jikan.ts`:**
- Add `getTopMovies(page)` function that calls `/top/anime?type=movie&page={page}&limit=24`
- Add `getAnimeRecommendations(id)` function that calls `/anime/{id}/recommendations`

**Changes to `src/hooks/useAnime.ts`:**
- Add `useTopMovies(page)` hook
- Add `useAnimeRecommendations(id)` hook

**Changes to `src/pages/Index.tsx`:**
- Add a 4th grid section "افضل افلام الأنمي" using the new `useTopMovies` hook, showing 12 movies

## 2. Browse page: Movies filter tab

Add a "أفلام" (Movies) nav link or allow filtering by type=movie on the Browse page. The existing genre filter bar will get a new quick-access button for movies.

**Changes to `src/components/Navbar.tsx`:**
- Add a new nav link: `{ label: "أفلام الأنمي", to: "/browse?filter=movies" }`

**Changes to `src/pages/Browse.tsx`:**
- Handle `filter=movies` by using the new `useTopMovies` hook
- Set title to "افضل أفلام الأنمي" when movies filter is active

## 3. Related Recommendations on Anime Detail page

Add a "أنمي مشابه" (Related Anime) section at the bottom of the AnimeDetail page using the Jikan `/anime/{id}/recommendations` endpoint.

**Changes to `src/pages/AnimeDetail.tsx`:**
- Import and use `useAnimeRecommendations(animeId)`
- After the episode list section, render a horizontal grid of recommended anime cards (reusing `AnimeCard` component)
- Each recommendation links to its own detail page
- Show loading skeletons while fetching

## Technical Details

- **Jikan API endpoints used:**
  - `GET /top/anime?type=movie` -- top rated movies
  - `GET /anime/{id}/recommendations` -- related anime recommendations (returns array of `{ entry: { mal_id, title, images, ... }, votes }`)
- Recommendations response shape differs slightly from standard anime, so the component will map `entry` fields to match `JikanAnime` interface
- Rate limiting: Jikan has a 3 req/sec limit; React Query's staleTime caching already helps avoid redundant calls

