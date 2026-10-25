/* =============================================================================
   content.js  (isolated world)
   - Applies the saved theme to <html> as early as possible via data-lc-theme
     (that attribute drives themes/*.css AND is read by inject.js in the MAIN world).
   - Forces LeetCode's own light/dark mode to match, the way the site expects it:
     the `dark` class on <html> and <body>, plus data-theme. This is what makes
     dark: utilities resolve, so hardcoded light surfaces go dark too.
   - Switches live: a change in the popup lands here through storage.onChanged,
     and 'off' hands LeetCode back the mode it had, with no reload.
   - Re-asserts on SPA navigation / when LeetCode toggles its own theme.
============================================================================= */
(() => {
  const KEY = 'lcThemeStudio';
  const DEFAULT = 'anime';
  const DARK_THEMES = new Set(['sakura', 'grid', 'bloom', 'crawler', 'pixel']);   // paper is the only light one
  const VALID = new Set(['paper', 'sakura', 'grid', 'bloom', 'anime', 'crawler', 'game', 'pixel', 'off']);
  /* the anime theme is light or dark depending on the scene it was solved
     from; anime.js publishes that and asks for a re-assert when it changes.
     The game theme is the same idea with two known states instead of an
     arbitrary picture: dark until src/game/game.js knows the open problem's
     difficulty, light for the Easy valley. See CLAUDE_ANKIT.md. */
  const isDark = (theme) => theme === 'anime'
    ? globalThis.__lctsAnimeMode !== 'light'
    : theme === 'game'
    ? globalThis.__lctsGameMode !== 'light'
    : DARK_THEMES.has(theme);
  const root = document.documentElement;

  /* LeetCode's own mode, recorded before we force ours so that 'off' can
     restore it. The guard below keeps it current if LeetCode changes its mind
     while a theme is active. body does not exist yet at document_start, so its
     classes are recorded the first time we are about to write to it. */
  const site = {
    dark: root.classList.contains('dark'),
    light: root.classList.contains('light'),
    dataTheme: root.getAttribute('data-theme'),
    scheme: root.style.colorScheme,
    bodySeen: false, bodyDark: false, bodyLight: false,
  };
  function captureBody() {
    if (site.bodySeen || !document.body) return;
    site.bodySeen = true;
    site.bodyDark = document.body.classList.contains('dark');
    site.bodyLight = document.body.classList.contains('light');
  }

  let current = null;

  function setBaseMode(theme) {
    const dark = isDark(theme);
    root.classList.toggle('dark', dark);
    root.classList.toggle('light', !dark);
    root.setAttribute('data-theme', dark ? 'dark' : 'light');
    if (document.body) {
      captureBody();
      document.body.classList.toggle('dark', dark);
      document.body.classList.toggle('light', !dark);
    }
    root.style.colorScheme = dark ? 'dark' : 'light';
  }

  function restoreBaseMode() {
    root.classList.toggle('dark', site.dark);
    root.classList.toggle('light', site.light);
    if (site.dataTheme === null) root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', site.dataTheme);
    root.style.colorScheme = site.scheme;
    if (document.body && site.bodySeen) {
      document.body.classList.toggle('dark', site.bodyDark);
      document.body.classList.toggle('light', site.bodyLight);
    }
  }

  const PREMIUM_THEMES = new Set(['crawler', 'game', 'pixel']);

  async function checkAllowed(theme) {
    if (!PREMIUM_THEMES.has(theme)) return theme;
    try {
      const prem = (await chrome.storage.local.get('leetglowPremium'))?.leetglowPremium;
      if (prem && prem.active) return theme;
    } catch (e) {}
    return 'sakura';
  }

  async function apply(theme) {
    if (!VALID.has(theme)) theme = DEFAULT;
    theme = await checkAllowed(theme);
    if (theme === current) return;
    const was = current;
    current = theme;
    if (theme === 'off') {
      /* themes/*.css is scoped entirely to [data-lc-theme], so removing the
         attribute switches every rule off at once */
      root.removeAttribute('data-lc-theme');
      if (was !== null) restoreBaseMode();
      return;
    }
    root.setAttribute('data-lc-theme', theme);
    setBaseMode(theme);
  }

  globalThis.__lctsReassertMode = () => { if (current && current !== 'off') setBaseMode(current); };

  /* Sync container and editor transparency variables across all themes */
  function syncTransparency(cTrans, eTrans) {
    const ct = typeof cTrans === 'number' ? cTrans : 30;
    const et = typeof eTrans === 'number' ? eTrans : 25;
    const cOp = Math.max(5, 100 - ct);
    const eOp = Math.max(5, 100 - et);
    root.style.setProperty('--lc-container-opacity', `${cOp}%`);
    root.style.setProperty('--lc-editor-opacity', `${eOp}%`);
  }

  chrome.storage.local.get(['lcContainerTrans', 'lcEditorTrans'], (res) => {
    syncTransparency(res.lcContainerTrans, res.lcEditorTrans);
  });

  apply(DEFAULT);
  chrome.storage.local.get(KEY, (res) => apply((res && res[KEY]) || DEFAULT));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) apply(changes[KEY].newValue || DEFAULT);
    if (area === 'local' && changes.leetglowPremium) {
      chrome.storage.local.get(KEY, (res) => apply((res && res[KEY]) || DEFAULT));
    }
    if (area === 'local' && (changes.lcContainerTrans || changes.lcEditorTrans)) {
      chrome.storage.local.get(['lcContainerTrans', 'lcEditorTrans'], (res) => {
        syncTransparency(res.lcContainerTrans, res.lcEditorTrans);
      });
    }
  });

  // body may not exist at document_start; sync the base classes onto it once ready.
  if (!document.body) {
    new MutationObserver((_, obs) => {
      if (!document.body) return;
      obs.disconnect();
      if (current !== 'off') setBaseMode(current);
    }).observe(root, { childList: true });
  }

  // Re-assert if LeetCode's SPA / its own theme switch overrides us.
  const guard = new MutationObserver(() => {
    if (current === 'off') return;                       // off means off
    if (root.getAttribute('data-lc-theme') !== current) root.setAttribute('data-lc-theme', current);
    const dark = isDark(current);
    if (root.classList.contains('dark') !== dark) {
      /* LeetCode switched its own mode: remember what it wanted before
         re-asserting ours, so 'off' restores that */
      site.dark = root.classList.contains('dark');
      site.light = root.classList.contains('light');
      setBaseMode(current);
    }
  });
  guard.observe(root, { attributes: true, attributeFilter: ['class', 'data-lc-theme', 'data-theme'] });
})();
