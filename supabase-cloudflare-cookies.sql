-- Create table for storing Cloudflare cookies to bypass challenges
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS cloudflare_cookies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  cookies JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_cloudflare_cookies_domain ON cloudflare_cookies(domain);
CREATE INDEX IF NOT EXISTS idx_cloudflare_cookies_updated_at ON cloudflare_cookies(updated_at DESC);

-- Add RLS policies (adjust based on your security needs)
ALTER TABLE cloudflare_cookies ENABLE ROW LEVEL SECURITY;

-- Allow service role to manage cookies
CREATE POLICY "Service role can manage cookies"
  ON cloudflare_cookies
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Optional: Allow authenticated users to read cookies (if needed by admin portal)
CREATE POLICY "Authenticated users can read cookies"
  ON cloudflare_cookies
  FOR SELECT
  TO authenticated
  USING (true);

-- Add comment
COMMENT ON TABLE cloudflare_cookies IS 'Stores browser cookies for bypassing Cloudflare challenges on anime streaming sites';
