-- Add fields used by anime3rb lazy scraping and 2-hour cached direct URLs.
ALTER TABLE public.anime_episodes
ADD COLUMN IF NOT EXISTS episode_page_url text;

ALTER TABLE public.anime_episodes
ADD COLUMN IF NOT EXISTS scraped_at timestamptz;

ALTER TABLE public.anime_episodes
ADD COLUMN IF NOT EXISTS video_sources jsonb;

ALTER TABLE public.anime_episodes
ALTER COLUMN video_url DROP NOT NULL;

COMMENT ON COLUMN public.anime_episodes.episode_page_url IS
'Canonical anime3rb episode page URL (e.g. https://anime3rb.com/episode/<slug>/<number>)';

COMMENT ON COLUMN public.anime_episodes.scraped_at IS
'Timestamp of the last successful 1080p direct video scrape';

COMMENT ON COLUMN public.anime_episodes.video_url IS
'Cached direct video URL resolved from the source episode page; may be null until first scrape';

COMMENT ON COLUMN public.anime_episodes.video_sources IS
'Cached resolved playback sources returned by the scraper';
