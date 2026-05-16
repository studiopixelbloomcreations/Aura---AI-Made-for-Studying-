-- Supabase migration to create the LUMEN (Lifelong User Memory Evolution Network) storage bucket

-- Create the lumen_archives bucket if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('lumen_archives', 'lumen_archives', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS for the storage.objects table if not already enabled
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert files into the lumen_archives bucket
CREATE POLICY "Allow authenticated uploads to lumen_archives"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'lumen_archives' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their files in the lumen_archives bucket
CREATE POLICY "Allow authenticated updates to lumen_archives"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'lumen_archives' AND auth.role() = 'authenticated');

-- Allow authenticated users to read files in the lumen_archives bucket
CREATE POLICY "Allow authenticated reads from lumen_archives"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'lumen_archives' AND auth.role() = 'authenticated');
