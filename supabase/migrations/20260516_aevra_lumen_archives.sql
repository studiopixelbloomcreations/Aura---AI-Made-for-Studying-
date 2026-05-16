-- LUMEN (Lifelong User Memory Evolution Network) - Identity Archive Table
-- This table stores unique per-user identity files that the AI continuously learns and updates.

CREATE TABLE IF NOT EXISTS lumen_archives (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  unique_id TEXT NOT NULL,
  file_key TEXT GENERATED ALWAYS AS (email || '_' || unique_id) STORED UNIQUE,
  facts JSONB NOT NULL DEFAULT '{}'::jsonb,
  base_profile JSONB NOT NULL DEFAULT '{}'::jsonb,
  system_name TEXT NOT NULL DEFAULT 'LUMEN (Lifelong User Memory Evolution Network)',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by email + unique_id
CREATE INDEX IF NOT EXISTS idx_lumen_email_uid ON lumen_archives (email, unique_id);

-- Enable Row Level Security
ALTER TABLE lumen_archives ENABLE ROW LEVEL SECURITY;

-- Allow service-role full access (used by Netlify functions)
CREATE POLICY "Service role full access on lumen_archives"
  ON lumen_archives FOR ALL
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to read their own archive
CREATE POLICY "Authenticated users read own lumen archive"
  ON lumen_archives FOR SELECT
  USING (auth.jwt() ->> 'email' = email);
