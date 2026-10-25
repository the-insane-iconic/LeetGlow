/* =============================================================================
   support.js — the one place the "Support" and "Report bug" links point.

   Used by the popup footer and the Anime Studio header. Report bug opens a
   Gmail draft to AnshYadav with a short template and the version,
   browser and theme filled in (nothing is sent until the user sends it).
   Connect opens the developer's LinkedIn profile. Support opens YOUR page
   rather than a payment provider directly, so the provider can change
   (UPI, GitHub Sponsors, Ko-fi, Razorpay) without an extension update or a
   new store review. Until that page is live, point this at the provider link
   itself, e.g. https://github.com/AnshYadav.

   Chrome Web Store: optional donation links are fine; nothing in the
   extension is locked behind them.
============================================================================= */
(function (root) {
  root.LCTS_SUPPORT_URL = 'https://github.com/AnshYadav';
  root.LCTS_BUG_EMAIL = 'anupamyadav6477@gmail.com';
  root.LCTS_CONNECT_URL = 'https://www.linkedin.com/in/AnshYadav/';

  /* a Gmail compose window, pre-filled; the details help reproduce the bug */
  async function bugUrl() {
    let theme = 'anime';
    try { theme = (await chrome.storage.local.get('lcThemeStudio')).lcThemeStudio || 'anime'; } catch (e) {}
    const ua = navigator.userAgent;
    const browser = (/Firefox\/(\d+)/.exec(ua) || [])[0] || (/Edg\/(\d+)/.exec(ua) || [])[0] || (/Chrome\/(\d+)/.exec(ua) || [])[0] || 'unknown browser';
    const v = chrome.runtime.getManifest().version;
    const body = 'Hi AnshYadav,\n\nWhat happened:\n\n\nWhat I expected:\n\n\nProblem link (if any):\n\n\n---\n' +
      `LeetGlow ${v} · ${browser.replace('/', ' ')} · theme: ${theme}`;
    return 'https://mail.google.com/mail/?view=cm&fs=1' +
      '&to=' + encodeURIComponent(root.LCTS_BUG_EMAIL) +
      '&su=' + encodeURIComponent(`LeetGlow bug report (v${v})`) +
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
  root.LCTSConnectButton = opens('LCTS_CONNECT_URL');
})(globalThis);
