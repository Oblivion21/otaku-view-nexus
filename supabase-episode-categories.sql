-- Add episode category and tag columns to anime_episodes table
-- Run this in Supabase SQL Editor

-- Add category column (blue/green/orange/gray)
ALTER TABLE anime_episodes
ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('black_org', 'main_story', 'featured', 'regular', NULL));

-- Add tags array for filler, manga, special
ALTER TABLE anime_episodes
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add comment for clarity
COMMENT ON COLUMN anime_episodes.category IS 'Episode importance: black_org (Blue), main_story (Green), featured (Orange), regular (Gray)';
COMMENT ON COLUMN anime_episodes.tags IS 'Episode tags: filler, manga, special';

-- Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_anime_episodes_category ON anime_episodes(category);
CREATE INDEX IF NOT EXISTS idx_anime_episodes_tags ON anime_episodes USING GIN(tags);
