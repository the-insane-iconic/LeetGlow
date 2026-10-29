/* =============================================================================
   support.js — the one place the "Support" and "Report bug" links point.

   Used by the popup footer and the Anime Studio header. Report bug opens a
   Gmail draft to AnshYadav with a short template and the version,
   browser and theme filled in (nothing is sent until the user sends it).
   Connect opens the developer's LinkedIn profile. Support opens YOUR page
   rather than a payment provider directly, so the provider can change
   (UPI, GitHub Sponsors, Ko-fi, Razorpay) without an extension update or a
   new store review. Until that page is live, point this at the provider link
   itself, e.g. https://github.com/the-insane-iconic.

   Chrome Web Store: optional donation links are fine; nothing in the
   extension is locked behind them.
============================================================================= */
(function (root) {
  root.LCTS_STORE_URL = 'https://chromewebstore.google.com/detail/ecpfpadofaimilfpjedgoedhoaglpjdb';
  root.LCTS_STORE_REVIEWS_URL = 'https://chromewebstore.google.com/detail/ecpfpadofaimilfpjedgoedhoaglpjdb/reviews';
  root.LCTS_SUPPORT_URL = 'https://github.com/the-insane-iconic';
  root.LCTS_BUG_EMAIL = (root.LEETGLOW_CONFIG && root.LEETGLOW_CONFIG.SUPPORT_EMAIL) || (function (a) { return a.map(function(c) { return String.fromCharCode(c ^ 0x5c); }).join(''); })([61, 50, 41, 44, 61, 49, 37, 61, 56, 61, 42, 106, 104, 107, 107, 28, 59, 49, 61, 53, 48, 114, 63, 51, 49]);
  root.LCTS_CONNECT_URL = 'https://www.linkedin.com/in/ansh-ydv/';

  /* a Gmail compose window, pre-filled; the details help reproduce the bug */
  async function bugUrl() {
    let theme = 'anime';
    try { theme = (await chrome.storage.local.get('lcThemeStudio')).lcThemeStudio || 'anime'; } catch (e) {}
    const ua = navigator.userAgent;
    const browser = (/Firefox\/(\d+)/.exec(ua) || [])[0] || (/Edg\/(\d+)/.exec(ua) || [])[0] || (/Chrome\/(\d+)/.exec(ua) || [])[0] || 'unknown browser';
    const v = chrome.runtime.getManifest().version;
    const body = 'Hi,\n\nI need help / have a question regarding LeetGlow:\n\n\n[Describe your question or issue here]\n\n\n---\n' +
      `LeetGlow ${v} · ${browser.replace('/', ' ')} · theme: ${theme}`;
    return 'https://mail.google.com/mail/?view=cm&fs=1' +
      '&to=' + encodeURIComponent(root.LCTS_BUG_EMAIL) +
      '&su=' + encodeURIComponent(`LeetGlow Support & Help (v${v})`) +
      '&body=' + encodeURIComponent(body);
  }

  function opens(url) {
    return function (el) {
      if (!el) return;
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: typeof url === 'function' ? await url() : root[url] });
      });
    };
  }
  root.LCTSSupportButton = opens('LCTS_SUPPORT_URL');
  root.LCTSBugButton = opens(bugUrl);
  root.LCTSHelpButton = opens(bugUrl);
  root.LCTSConnectButton = opens('LCTS_CONNECT_URL');
})(globalThis);
