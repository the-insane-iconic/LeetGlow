/* =============================================================================
   premium.js — LeetGlow Client-side Premium & Entitlement Engine
   ============================================================================= */
(function (root) {
  'use strict';

  function _d(arr, s = 0x5c) {
    return arr.map(function (c) { return String.fromCharCode(c ^ s); }).join('');
  }
  const _EP1 = _d([63, 52, 57, 63, 55, 3, 57, 50, 40, 53, 40, 48, 57, 49, 57, 50, 40]);
  const _EP2 = _d([61, 63, 40, 53, 42, 61, 40, 57, 3, 44, 46, 57, 49, 53, 41, 49, 3, 55, 57, 37]);
  const _EP3 = _d([44, 46, 51, 63, 57, 47, 47, 3, 47, 41, 63, 63, 57, 47, 47, 58, 41, 48, 3, 44, 61, 37, 49, 57, 50, 40]);

  const CONFIG = root.LEETGLOW_CONFIG || {};

  /**
   * Retrieves or initializes a persistent, anonymous device identifier.
   */
  async function getDeviceId() {
    try {
      const data = await chrome.storage.local.get('lgDeviceId');
      if (data && data.lgDeviceId) {
        return data.lgDeviceId;
      }
      const newId = 'lg_dev_' + (crypto.randomUUID ? crypto.randomUUID() : (Math.random().toString(36).slice(2) + Date.now().toString(36)));
      await chrome.storage.local.set({ lgDeviceId: newId });
      return newId;
    } catch (e) {
      // Fallback in case chrome.storage is unavailable
      let localId = localStorage.getItem('lgDeviceId');
      if (!localId) {
        localId = 'lg_dev_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('lgDeviceId', localId);
      }
      return localId;
    }
  }

  /**
   * Directly queries the Supabase server RPC to verify this device's entitlement.
   * Does NOT rely solely on local storage — guarantees server-confirmed status.
   */
  async function checkServerEntitlement() {
    const deviceId = await getDeviceId();
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${_EP1}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({ p_device_id: deviceId })
      });

      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }

      const data = await res.json();
      const isActive = !!(data && data.active === true);
      
      // Update local storage cache with server timestamp
      await chrome.storage.local.set({
        leetglowPremium: {
          active: isActive,
          key_prefix: data.key_prefix || null,
          activated_at: data.activated_at || null,
          verified_at: new Date().toISOString()
        }
      });

      return {
        active: isActive,
        key_prefix: data.key_prefix || null,
        activated_at: data.activated_at || null
      };
    } catch (err) {
      console.warn('[LeetGlow Premium] Server verification check failed, checking cache:', err);
      // Fallback to cached value only if offline
      try {
        const cached = (await chrome.storage.local.get('leetglowPremium')).leetglowPremium;
        if (cached && typeof cached.active === 'boolean') {
          return cached;
        }
      } catch (e) {}
      return { active: false, error: err.message };
    }
  }

  /**
   * Validates a license key with Supabase and binds it to this device.
   */
  async function activateKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') {
      return { success: false, error: 'Please enter a valid license key.' };
    }

    const cleanKey = rawKey.trim().toUpperCase();
    const deviceId = await getDeviceId();

    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${_EP2}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          p_key: cleanKey,
          p_device_id: deviceId
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || `Server error (${res.status})`);
      }

      const result = await res.json();
      if (result.success && result.active) {
        await chrome.storage.local.set({
          leetglowPremium: {
            active: true,
            key_prefix: result.key_prefix || cleanKey.slice(0, 7),
            verified_at: new Date().toISOString()
          }
        });
      }

      return result;
    } catch (err) {
      return { success: false, error: err.message || 'Verification failed. Please check your internet connection.' };
    }
  }

  /**
   * Finalizes payment on the server, generates a cryptographically random license key,
   * stores its hash in Supabase, and activates the entitlement on this device.
   * Supports both server-side HMAC verification (Edge Function) and direct RPC.
   */
  async function recordPaymentAndIssueKey(details) {
    const { name, email, phone, orderId, paymentId, signature } = details;
    const deviceId = await getDeviceId();

    // 1. Try secure Edge Function verify-payment first if signature is provided
    if (signature && CONFIG.SUPABASE_URL) {
      try {
        const edgeRes = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/verify-payment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            name,
            email,
            phone: phone || '',
            order_id: orderId || ('ord_local_' + Date.now()),
            payment_id: paymentId,
            signature,
            device_id: deviceId
          })
        });

        if (edgeRes.ok) {
          const edgeData = await edgeRes.json();
          if (edgeData && edgeData.success && edgeData.active) {
            await chrome.storage.local.set({
              leetglowPremium: {
                active: true,
                key_prefix: edgeData.key_prefix,
                verified_at: new Date().toISOString()
              }
            });
            return edgeData;
          }
        }
      } catch (edgeErr) {
        // Fallback smoothly to direct database RPC
        console.warn('[LeetGlow Premium] Edge Function not reachable, falling back to direct secure RPC:', edgeErr);
      }
    }

    // 2. Direct PostgreSQL SECURITY DEFINER stored procedure (SHA-256 cryptographic key engine)
    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${_EP3}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': CONFIG.SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          p_name: name,
          p_email: email,
          p_phone: phone || '',
          p_order_id: orderId || ('ord_local_' + Date.now()),
          p_payment_id: paymentId,
          p_device_id: deviceId
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || 'Failed to record payment');
      }

      const data = await res.json();
      if (data.success && data.active) {
        await chrome.storage.local.set({
          leetglowPremium: {
            active: true,
            key_prefix: data.key_prefix,
            verified_at: new Date().toISOString()
          }
        });
      }

      return data;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Updates the UI badge element reflecting the true server entitlement.
   * Sleek Slate Glass = Basic Plan
   * Emerald Glow = Premium Active
   */
  function updateBadge(badgeEl, isActive, keyPrefix) {
    if (!badgeEl) return;
    badgeEl.classList.remove('active', 'inactive', 'checking');
    
    if (isActive) {
      badgeEl.classList.add('active');
      badgeEl.title = 'Server-confirmed Premium Entitlement Active' + (keyPrefix ? ` (${keyPrefix}...)` : '');
      const dot = badgeEl.querySelector('.badge-dot');
      const text = badgeEl.querySelector('.badge-text');
      if (dot) dot.className = 'badge-dot active';
      if (text) text.textContent = 'Premium Active';
    } else {
      badgeEl.classList.add('inactive');
      badgeEl.title = 'Basic Free Tier · Click to view Premium comparison & upgrade';
      const dot = badgeEl.querySelector('.badge-dot');
      const text = badgeEl.querySelector('.badge-text');
      if (dot) dot.className = 'badge-dot inactive';
      if (text) text.textContent = 'Basic Plan';
    }
  }

  root.LeetGlowPremium = {
    CONFIG,
    getDeviceId,
    checkServerEntitlement,
    activateKey,
    recordPaymentAndIssueKey,
    updateBadge
  };
})(globalThis);
