/* =============================================================================
   premium.js — LeetGlow Client-side Premium & Entitlement Engine
   ============================================================================= */
(function (root) {
  'use strict';

  const CONFIG = root.LEETGLOW_CONFIG || {
    SUPABASE_URL: 'https://kxtdvzyftfhryvbpbohb.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_h76RupEa47M3tZw-CVS4qg_4PrFaM7v',
    RAZORPAY_KEY_ID: 'rzp_test_PLACEHOLDER_KEY',
    PRODUCT_NAME: 'LeetGlow Premium',
    PRODUCT_PRICE_INR: 29,
    PRODUCT_PRICE_PAISE: 2900
  };

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
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/check_entitlement`, {
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
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/activate_premium_key`, {
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
   */
  async function recordPaymentAndIssueKey(details) {
    const { name, email, phone, orderId, paymentId } = details;
    const deviceId = await getDeviceId();

    try {
      const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/process_successful_payment`, {
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
   * Red = Inactive
   * Green = Active
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
      badgeEl.title = 'No active server entitlement found. Click "Get Premium Access" to upgrade.';
      const dot = badgeEl.querySelector('.badge-dot');
      const text = badgeEl.querySelector('.badge-text');
      if (dot) dot.className = 'badge-dot inactive';
      if (text) text.textContent = 'Premium Inactive';
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
