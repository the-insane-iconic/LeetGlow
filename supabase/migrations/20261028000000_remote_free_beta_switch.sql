-- =============================================================================
-- Migration: 20261028000000_remote_free_beta_switch.sql
-- Description: Adds remote app_config toggle for Free Beta access and
--              updates check_entitlement() to automatically grant premium
--              without payment friction while is_free_beta = true.
-- =============================================================================

-- 1. App Configuration Table (for remote feature flags)
CREATE TABLE IF NOT EXISTS public.app_config (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read on app_config" ON public.app_config;
CREATE POLICY "Allow public read on app_config" ON public.app_config
    FOR SELECT TO anon, authenticated USING (true);

-- 2. Seed Free Beta switch as TRUE by default
INSERT INTO public.app_config (key, value)
VALUES ('is_free_beta', '{"enabled": true}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = '{"enabled": true}'::jsonb;

-- 3. Update check_entitlement() to respect remote is_free_beta toggle
CREATE OR REPLACE FUNCTION public.check_entitlement(p_device_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_entitlement RECORD;
    v_is_free_beta BOOLEAN := true;
BEGIN
    -- Read remote switch from app_config
    BEGIN
        SELECT COALESCE((value->>'enabled')::boolean, (value)::boolean, true)
        INTO v_is_free_beta
        FROM public.app_config
        WHERE key = 'is_free_beta';
    EXCEPTION WHEN OTHERS THEN
        v_is_free_beta := true;
    END;

    IF v_is_free_beta IS NULL THEN
        v_is_free_beta := true;
    END IF;

    -- Check if device has an individually paid/bound license key
    IF p_device_id IS NOT NULL AND TRIM(p_device_id) <> '' THEN
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
                'is_free_beta', v_is_free_beta,
                'activated_at', v_entitlement.activated_at,
                'key_prefix', v_entitlement.key_prefix
            );
        END IF;
    END IF;

    -- If no paid key exists, grant free access if is_free_beta is true
    IF v_is_free_beta THEN
        RETURN jsonb_build_object(
            'active', true,
            'is_free_beta', true,
            'key_prefix', 'LG-FREE',
            'activated_at', NOW()
        );
    ELSE
        RETURN jsonb_build_object(
            'active', false,
            'is_free_beta', false
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_entitlement(TEXT) TO anon, authenticated;

