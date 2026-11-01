-- =============================================================================
-- LeetGlow Production Database Schema
-- Database: Supabase PostgreSQL (17+)
-- Free & Open — Live Wallpaper Storage Bucket & Retrieval Procedure
-- =============================================================================

-- =============================================================================
-- Storage Bucket: livewallpaper (Public Read & List for Extension)
-- =============================================================================
DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('livewallpaper', 'livewallpaper', true)
    ON CONFLICT (id) DO UPDATE SET public = true;
EXCEPTION
    WHEN others THEN NULL;
END $$;

-- 1. Ensure all live storage buckets are marked PUBLIC
UPDATE storage.buckets
SET public = true
WHERE LOWER(id) LIKE '%live%' OR LOWER(name) LIKE '%live%';

-- 2. Drop restrictive policies and grant full public read access to storage objects
DROP POLICY IF EXISTS "Allow public read on livewallpaper" ON storage.objects;
DROP POLICY IF EXISTS "Public Access Live" ON storage.objects;

CREATE POLICY "Public Access Live"
ON storage.objects FOR SELECT
TO public
USING (true);

-- 3. Stored procedure that returns all uploaded wallpapers
CREATE OR REPLACE FUNCTION public.get_live_wallpapers()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
    v_files JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'name', name,
            'bucket_id', bucket_id,
            'metadata', metadata,
            'updated_at', updated_at
        )
    )
    INTO v_files
    FROM storage.objects
    WHERE LOWER(name) LIKE '%.mp4' 
       OR LOWER(name) LIKE '%.webm' 
       OR LOWER(name) LIKE '%.mov'
       OR LOWER(name) LIKE '%.webp'
       OR LOWER(name) LIKE '%.jpg'
       OR LOWER(name) LIKE '%.png';

    RETURN COALESCE(v_files, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_wallpapers() TO anon, authenticated;
