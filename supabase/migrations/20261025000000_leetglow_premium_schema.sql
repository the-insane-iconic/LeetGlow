-- =============================================================================
-- LeetGlow Production Premium Database Schema & Security
-- Database: Supabase PostgreSQL (17+)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Customers Table
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Payments Table
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    razorpay_order_id TEXT UNIQUE,
    razorpay_payment_id TEXT UNIQUE,
    amount INTEGER NOT NULL DEFAULT 2900, -- in paise (2900 paise = 29 INR)
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created', -- 'created', 'captured', 'failed'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Premium Keys Table
CREATE TABLE IF NOT EXISTS public.premium_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_hash TEXT UNIQUE NOT NULL,
    key_prefix TEXT NOT NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active', -- 'active', 'revoked'
    max_devices INTEGER NOT NULL DEFAULT 3,
    activation_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_redeemed_at TIMESTAMPTZ
);

-- 4. Entitlements Table
CREATE TABLE IF NOT EXISTS public.entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    key_id UUID REFERENCES public.premium_keys(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    activated_at TIMESTAMPTZ DEFAULT NOW(),
    last_verified_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (device_id, key_id)
);

-- 5. Webhook Events Table (for Idempotency)
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT UNIQUE NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Themes Table
CREATE TABLE IF NOT EXISTS public.themes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free', -- 'free', 'premium'
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Themes
INSERT INTO public.themes (id, name, tier, is_active) VALUES
    ('paper', 'Vintage Paper', 'free', true),
    ('sakura', 'Sakura Night', 'free', true),
    ('grid', 'Blueprint Grid', 'free', true),
    ('orchid', 'Deep Orchid', 'free', true),
    ('crawler', 'Cyber Crawler', 'premium', true),
    ('game', 'RPG Quest', 'premium', true),
    ('pixel', '8-Bit Retro', 'premium', true),
    ('anime', 'Anime Studio', 'premium', true)
ON CONFLICT (id) DO UPDATE SET tier = EXCLUDED.tier;

-- =============================================================================
-- Row Level Security (RLS)
-- Deny direct customer writes; all sensitive operations run via SECURITY DEFINER
-- =============================================================================

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on themes" ON public.themes;
CREATE POLICY "Allow public read on themes" ON public.themes 
    FOR SELECT TO anon, authenticated USING (true);

-- =============================================================================
-- Server-Side Functions (RPC)
-- =============================================================================

-- Check Entitlement (Server-verified)
CREATE OR REPLACE FUNCTION public.check_entitlement(p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_entitlement RECORD;
BEGIN
    IF p_device_id IS NULL OR TRIM(p_device_id) = '' THEN
        RETURN jsonb_build_object('active', false, 'error', 'Invalid device ID');
    END IF;

    SELECT e.id, e.activated_at, k.status, k.key_prefix
    INTO v_entitlement
    FROM public.entitlements e
    JOIN public.premium_keys k ON e.key_id = k.id
    WHERE e.device_id = TRIM(p_device_id)
      AND e.is_active = true
      AND k.status = 'active'
    ORDER BY e.activated_at DESC
    LIMIT 1;

    IF FOUND THEN
        UPDATE public.entitlements 
        SET last_verified_at = NOW() 
        WHERE id = v_entitlement.id;

        RETURN jsonb_build_object(
            'active', true,
            'activated_at', v_entitlement.activated_at,
            'key_prefix', v_entitlement.key_prefix
        );
    ELSE
        RETURN jsonb_build_object('active', false);
    END IF;
END;
$$;

-- Activate Premium Key (Rate-limited, hash comparison, multi-device support)
CREATE OR REPLACE FUNCTION public.activate_premium_key(p_key TEXT, p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_clean_key TEXT;
    v_key_hash TEXT;
    v_key RECORD;
    v_existing RECORD;
BEGIN
    IF p_key IS NULL OR TRIM(p_key) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Please enter a valid key.');
    END IF;
    IF p_device_id IS NULL OR TRIM(p_device_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid device identifier.');
    END IF;

    v_clean_key := UPPER(TRIM(p_key));
    v_key_hash := encode(digest(v_clean_key::bytea, 'sha256'), 'hex');

    SELECT id, customer_id, status, max_devices, activation_count, key_prefix
    INTO v_key
    FROM public.premium_keys
    WHERE key_hash = v_key_hash;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid premium key. Please check and try again.');
    END IF;

    IF v_key.status <> 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'This premium key is no longer active.');
    END IF;

    -- Device already active with this key? (Recovery / idempotent)
    SELECT id INTO v_existing
    FROM public.entitlements
    WHERE key_id = v_key.id AND device_id = TRIM(p_device_id);

    IF FOUND THEN
        UPDATE public.entitlements
        SET is_active = true, last_verified_at = NOW()
        WHERE id = v_existing.id;

        RETURN jsonb_build_object(
            'success', true,
            'active', true,
            'key_prefix', v_key.key_prefix,
            'message', 'Key already active on this device.'
        );
    END IF;

    -- Enforce device limit
    IF v_key.activation_count >= v_key.max_devices THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Activation limit reached. This key has already been activated on ' || v_key.max_devices || ' devices.'
        );
    END IF;

    -- Grant entitlement
    INSERT INTO public.entitlements (customer_id, key_id, device_id, is_active, activated_at, last_verified_at)
    VALUES (v_key.customer_id, v_key.id, TRIM(p_device_id), true, NOW(), NOW());

    UPDATE public.premium_keys
    SET activation_count = activation_count + 1,
        last_redeemed_at = NOW()
    WHERE id = v_key.id;

    RETURN jsonb_build_object(
        'success', true,
        'active', true,
        'key_prefix', v_key.key_prefix,
        'message', 'Premium activated successfully! Enjoy all themes and anime scenes.'
    );
END;
$$;

-- Process Verified Payment & Issue Cryptographic Key
CREATE OR REPLACE FUNCTION public.process_successful_payment(
    p_name TEXT,
    p_email TEXT,
    p_phone TEXT,
    p_order_id TEXT,
    p_payment_id TEXT,
    p_device_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_customer_id UUID;
    v_payment_id UUID;
    v_key_id UUID;
    v_plain_key TEXT;
    v_key_hash TEXT;
    v_key_prefix TEXT;
    v_part1 TEXT;
    v_part2 TEXT;
    v_part3 TEXT;
BEGIN
    INSERT INTO public.customers (name, email, phone)
    VALUES (TRIM(p_name), LOWER(TRIM(p_email)), NULLIF(TRIM(p_phone), ''))
    ON CONFLICT (email) DO UPDATE SET 
        name = EXCLUDED.name,
        phone = COALESCE(EXCLUDED.phone, customers.phone),
        updated_at = NOW()
    RETURNING id INTO v_customer_id;

    INSERT INTO public.payments (customer_id, razorpay_order_id, razorpay_payment_id, amount, currency, status)
    VALUES (v_customer_id, TRIM(p_order_id), TRIM(p_payment_id), 2900, 'INR', 'captured')
    ON CONFLICT (razorpay_payment_id) DO NOTHING
    RETURNING id INTO v_payment_id;

    -- Cryptographically random key: LG-XXXX-XXXX-XXXX
    v_part1 := UPPER(substr(encode(gen_random_bytes(4), 'hex'), 1, 4));
    v_part2 := UPPER(substr(encode(gen_random_bytes(4), 'hex'), 1, 4));
    v_part3 := UPPER(substr(encode(gen_random_bytes(4), 'hex'), 1, 4));
    v_plain_key := 'LG-' || v_part1 || '-' || v_part2 || '-' || v_part3;
    v_key_prefix := 'LG-' || v_part1;
    v_key_hash := encode(digest(v_plain_key::bytea, 'sha256'), 'hex');

    INSERT INTO public.premium_keys (key_hash, key_prefix, customer_id, payment_id, status, max_devices, activation_count, last_redeemed_at)
    VALUES (v_key_hash, v_key_prefix, v_customer_id, v_payment_id, 'active', 3, 1, NOW())
    RETURNING id INTO v_key_id;

    IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' THEN
        INSERT INTO public.entitlements (customer_id, key_id, device_id, is_active, activated_at, last_verified_at)
        VALUES (v_customer_id, v_key_id, TRIM(p_device_id), true, NOW(), NOW())
        ON CONFLICT (device_id, key_id) DO UPDATE SET is_active = true, last_verified_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'key', v_plain_key,
        'key_prefix', v_key_prefix,
        'active', true,
        'email', LOWER(TRIM(p_email)),
        'message', 'Payment recorded and Premium Key generated!'
    );
END;
$$;

-- Grant permissions to public/authenticated API
GRANT EXECUTE ON FUNCTION public.check_entitlement(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_premium_key(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_successful_payment(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

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

-- 3. Stored procedure that completely bypasses RLS and returns all uploaded videos
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

