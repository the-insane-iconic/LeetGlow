/* =============================================================================
   app-config.js — LeetGlow Runtime Configuration
   Resolves Supabase endpoint for live wallpapers and developer contact info.
   ============================================================================= */
(function (root) {
  'use strict';

  function _k(arr, s = 0x5c) {
    return arr.map(function (c) { return String.fromCharCode(c ^ s); }).join('');
  }

  // Obfuscated payload buffers (resolved into memory only at runtime)
  const _U = [52, 40, 40, 44, 47, 102, 115, 115, 55, 36, 40, 56, 42, 38, 37, 58, 40, 58, 52, 46, 37, 42, 62, 44, 62, 51, 52, 62, 114, 47, 41, 44, 61, 62, 61, 47, 57, 114, 63, 51];
  const _A = [47, 62, 3, 44, 41, 62, 48, 53, 47, 52, 61, 62, 48, 57, 3, 52, 107, 106, 14, 41, 44, 25, 61, 104, 107, 17, 111, 40, 6, 43, 113, 31, 10, 15, 104, 45, 59, 3, 104, 12, 46, 26, 61, 17, 107, 42];
  const _E = [61, 50, 41, 44, 61, 49, 37, 61, 56, 61, 42, 106, 104, 107, 107, 28, 59, 49, 61, 53, 48, 114, 63, 51, 49];

  root.LEETGLOW_CONFIG = {
    SUPABASE_URL: _k(_U),
    SUPABASE_ANON_KEY: _k(_A),
    SUPPORT_EMAIL: _k(_E)
  };
})(globalThis);

