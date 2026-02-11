-- ===================================================================
-- SUPABASE DATABASE SETUP FOR OTAKU VIEW NEXUS ADMIN PORTAL
-- ===================================================================
-- Run this script in Supabase SQL Editor
-- ===================================================================

-- ===================================================================
-- TABLE 1: anime_episodes
-- Stores episode video URLs for each anime
-- ===================================================================
CREATE TABLE IF NOT EXISTS anime_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mal_id INTEGER NOT NULL,
  episode_number INTEGER NOT NULL,
  video_url TEXT NOT NULL,
  quality TEXT DEFAULT '1080p',
  subtitle_language TEXT DEFAULT 'arabic',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique episode per anime
  CONSTRAINT unique_episode UNIQUE(mal_id, episode_number)
);

-- Create index for fast lookups by anime
CREATE INDEX IF NOT EXISTS idx_anime_episodes_mal_id ON anime_episodes(mal_id);

-- Create index for active episodes
CREATE INDEX IF NOT EXISTS idx_anime_episodes_active ON anime_episodes(is_active);

COMMENT ON TABLE anime_episodes IS 'Stores video URLs for anime episodes';
COMMENT ON COLUMN anime_episodes.mal_id IS 'MyAnimeList anime ID';
COMMENT ON COLUMN anime_episodes.episode_number IS 'Episode number (1, 2, 3, etc.)';
COMMENT ON COLUMN anime_episodes.video_url IS 'External video URL (Gogoanime, etc.)';

-- ===================================================================
-- TABLE 2: site_settings
-- Stores site configuration (featured anime, announcements, etc.)
-- ===================================================================
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE site_settings IS 'Site-wide configuration and settings';
COMMENT ON COLUMN site_settings.key IS 'Setting identifier (e.g., featured_anime_ids)';
COMMENT ON COLUMN site_settings.value IS 'Setting value as JSON';

-- ===================================================================
-- TABLE 3: admin_logs
-- Tracks admin actions for audit trail
-- ===================================================================
CREATE TABLE IF NOT EXISTS admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_email TEXT NOT NULL,
  action TEXT NOT NULL,
  table_name TEXT,
  record_id UUID,
  changes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at ON admin_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_email ON admin_logs(admin_email);

COMMENT ON TABLE admin_logs IS 'Audit log of admin actions';

-- ===================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ===================================================================

-- Enable RLS on all tables
ALTER TABLE anime_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

-- ===================================================================
-- POLICIES FOR: anime_episodes
-- ===================================================================

-- Policy 1: Public can read active episodes (for main site)
CREATE POLICY "Public can read active episodes"
ON anime_episodes
FOR SELECT
USING (is_active = true);

-- Policy 2: Authenticated users (admins) can do everything
CREATE POLICY "Admins can manage episodes"
ON anime_episodes
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ===================================================================
-- POLICIES FOR: site_settings
-- ===================================================================

-- Policy 1: Public can read all settings
CREATE POLICY "Public can read settings"
ON site_settings
FOR SELECT
USING (true);

-- Policy 2: Only authenticated users can modify
CREATE POLICY "Admins can modify settings"
ON site_settings
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- ===================================================================
-- POLICIES FOR: admin_logs
-- ===================================================================

-- Only authenticated users can read and write logs
CREATE POLICY "Admins can read logs"
ON admin_logs
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Admins can write logs"
ON admin_logs
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- ===================================================================
-- SAMPLE DATA (Optional - for testing)
-- ===================================================================

-- Insert default site settings
INSERT INTO site_settings (key, value, description) VALUES
  ('featured_anime_ids', '[]', 'Array of MAL IDs for featured anime on homepage'),
  ('site_announcement', '{"ar": "", "en": ""}', 'Site announcement banner'),
  ('maintenance_mode', 'false', 'Enable/disable maintenance mode')
ON CONFLICT (key) DO NOTHING;

-- Insert sample episodes for testing (Attack on Titan - MAL ID 16498)
INSERT INTO anime_episodes (mal_id, episode_number, video_url, quality) VALUES
  (16498, 1, 'https://example.com/aot-ep1', '1080p'),
  (16498, 2, 'https://example.com/aot-ep2', '1080p')
ON CONFLICT (mal_id, episode_number) DO NOTHING;

-- ===================================================================
-- FUNCTIONS FOR AUTO-UPDATING updated_at
-- ===================================================================

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to anime_episodes
DROP TRIGGER IF EXISTS update_anime_episodes_updated_at ON anime_episodes;
CREATE TRIGGER update_anime_episodes_updated_at
BEFORE UPDATE ON anime_episodes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Apply trigger to site_settings
DROP TRIGGER IF EXISTS update_site_settings_updated_at ON site_settings;
CREATE TRIGGER update_site_settings_updated_at
BEFORE UPDATE ON site_settings
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ===================================================================
-- VERIFY SETUP
-- ===================================================================

-- Check tables were created
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN ('anime_episodes', 'site_settings', 'admin_logs')
ORDER BY table_name;

-- ===================================================================
-- SETUP COMPLETE! ✅
-- ===================================================================
-- Next steps:
-- 1. Create an admin user in Authentication tab
-- 2. Get your API credentials from Settings > API
-- 3. Start building the admin portal!
-- ===================================================================
