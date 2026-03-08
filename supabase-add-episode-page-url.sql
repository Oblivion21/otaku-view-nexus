-- Add per-episode source page link used by scrape-anime3rb step 1 fallback.
ALTER TABLE public.anime_episodes
ADD COLUMN IF NOT EXISTS episode_page_url text;

COMMENT ON COLUMN public.anime_episodes.episode_page_url IS
'Canonical anime3rb episode page URL (e.g. https://anime3rb.com/episode/<slug>/<number>)';
