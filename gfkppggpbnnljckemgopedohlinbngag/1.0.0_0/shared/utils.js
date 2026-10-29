/* LeetThemes — small shared helpers. */
(function () {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      const context = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, wait);
    };
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function downloadJSON(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function isLeetCodeUrl(url) {
    return /^https:\/\/([a-z0-9-]+\.)*leetcode\.(com|cn)(\/|$)/i.test(url || '');
  }

  function isProblemPage(url) {
    return /\/problems\//i.test(url || '');
  }

  function relativeLuminance(hex) {
    const value = String(hex).replace('#', '');
    const full = value.length === 3 ? value.split('').map(function (c) { return c + c; }).join('') : value;
    if (full.length !== 6) return 0.5;
    const channels = [0, 2, 4].map(function (offset) {
      const channel = parseInt(full.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(a, b) {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);
    const light = Math.max(first, second);
    const dark = Math.min(first, second);
    return (light + 0.05) / (dark + 0.05);
  }

  // Pick a near-black or white foreground for a solid accent background.
  function readableOn(color) {
    const dark = '#0b0b10';
    const light = '#ffffff';
    try {
      return contrastRatio(color, dark) >= contrastRatio(color, light) ? dark : light;
    } catch (error) {
      return dark;
    }
  }

  function uid(prefix) {
    return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 9);
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.utils = {
    clamp: clamp,
    debounce: debounce,
    formatTime: formatTime,
    escapeHtml: escapeHtml,
    downloadJSON: downloadJSON,
    isLeetCodeUrl: isLeetCodeUrl,
    isProblemPage: isProblemPage,
    contrastRatio: contrastRatio,
    readableOn: readableOn,
    uid: uid
  };
})();
