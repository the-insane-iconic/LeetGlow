/* =============================================================================
   premium-config.js — LeetGlow Supabase & Razorpay Configuration
   ============================================================================= */
(function (root) {
  'use strict';

  root.LEETGLOW_CONFIG = {
    // Supabase Credentials
    SUPABASE_URL: 'https://kxtdvzyftfhryvbpbohb.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_h76RupEa47M3tZw-CVS4qg_4PrFaM7v',

    // Razorpay Standard Checkout
    // Replace with your Razorpay Key ID (e.g. rzp_live_... or rzp_test_...)
    RAZORPAY_KEY_ID: 'rzp_test_PLACEHOLDER_KEY',

    // Product details
    PRODUCT_NAME: 'LeetGlow Premium',
    PRODUCT_PRICE_INR: 29,
    PRODUCT_PRICE_PAISE: 2900,
    CURRENCY: 'INR',

    // Support contact
    SUPPORT_EMAIL: 'anupamyadav6477@gmail.com'
  };
})(globalThis);
