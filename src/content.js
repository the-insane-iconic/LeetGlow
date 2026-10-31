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
  const DEFAULT = 'paper';
  const DARK_THEMES = new Set(['grid', 'crawler', 'pixel']);
  const LCT_THEMES = new Set([
    'sakura-dream', 'forest-mist', 'midnight-ink', 'lofi-cafe',
    'rainy-window', 'meadow-breeze', 'ocean-deep', 'paper', 'nord'
  ]);
  const VALID = new Set(['grid', 'anime', 'crawler', 'game', 'pixel', 'off', ...LCT_THEMES]);
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
  let applying = false;

  function setBaseMode(theme) {
    if (!theme || theme === 'off') return;
    applying = true;
    try {
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
    } finally {
      queueMicrotask(() => { applying = false; });
    }
  }

  function restoreBaseMode() {
    applying = true;
    try {
      root.classList.toggle('dark', site.dark);
      root.classList.toggle('light', site.light);
      if (site.dataTheme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', site.dataTheme);
      root.style.colorScheme = site.scheme;
      if (document.body && site.bodySeen) {
        document.body.classList.toggle('dark', site.bodyDark);
        document.body.classList.toggle('light', site.bodyLight);
      }
    } finally {
      queueMicrotask(() => { applying = false; });
    }
  }

  let transitionTimer = null;
  function markTransitioning() {
    root.setAttribute('data-lc-transitioning', 'true');
    clearTimeout(transitionTimer);
    transitionTimer = setTimeout(() => {
      root.removeAttribute('data-lc-transitioning');
    }, 260);
  }

  function crossfadeBackdrop() {
    if (!document.body) return;
    try {
      const cs = window.getComputedStyle(document.body);
      const bgImg = cs.backgroundImage;
      const bgColor = cs.backgroundColor;
      if ((bgImg && bgImg !== 'none') || (bgColor && bgColor !== 'rgba(0, 0, 0, 0)')) {
        let ov = document.getElementById('lc-backdrop-crossfade');
        if (!ov) {
          ov = document.createElement('div');
          ov.id = 'lc-backdrop-crossfade';
          ov.setAttribute('aria-hidden', 'true');
          document.body.appendChild(ov);
        }
        ov.style.transition = 'none';
        ov.style.backgroundImage = bgImg;
        ov.style.backgroundColor = bgColor;
        ov.style.backgroundSize = cs.backgroundSize;
        ov.style.backgroundRepeat = cs.backgroundRepeat;
        ov.style.backgroundPosition = cs.backgroundPosition;
        ov.style.backgroundAttachment = cs.backgroundAttachment;
        ov.style.opacity = '1';

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            ov.style.transition = 'opacity 0.22s ease';
            ov.style.opacity = '0';
          });
        });
      }
    } catch (e) {}
  }

  function apply(theme) {
    if (!VALID.has(theme)) theme = DEFAULT;
    if (theme === current) return;
    const was = current;
    current = theme;

    if (was !== null) {
      markTransitioning();
      crossfadeBackdrop();
    }

    if (LCT_THEMES.has(theme)) {
      applying = true;
      try {
        root.removeAttribute('data-lc-theme');
        if (globalThis.LCTBootstrap) globalThis.LCTBootstrap.syncActiveTheme(theme);
      } finally {
        queueMicrotask(() => { applying = false; });
      }
      try { sessionStorage.setItem('__lcts_active_theme', theme); } catch (e) {}
      setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 240);
      return;
    }

    if (globalThis.LCTBootstrap) globalThis.LCTBootstrap.syncActiveTheme(theme);

    if (theme === 'off') {
      /* themes/*.css is scoped entirely to [data-lc-theme], so removing the
         attribute switches every rule off at once */
      applying = true;
      try {
        root.removeAttribute('data-lc-theme');
        if (was !== null) restoreBaseMode();
      } finally {
        queueMicrotask(() => { applying = false; });
      }
      setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 240);
      return;
    }
    applying = true;
    try {
      root.setAttribute('data-lc-theme', theme);
      setBaseMode(theme);
    } finally {
      queueMicrotask(() => { applying = false; });
    }
    try { sessionStorage.setItem('__lcts_active_theme', theme); } catch (e) {}
    setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 240);
  }

  globalThis.__lctsReassertMode = () => { if (current && current !== 'off') setBaseMode(current); };

  /* Sync container and editor transparency variables across all themes */
  let currentCt = 30;
  let currentEt = 25;

  function syncTransparency(cTrans, eTrans) {
    if (typeof cTrans === 'number') currentCt = cTrans;
    if (typeof eTrans === 'number') currentEt = eTrans;
    const cOp = Math.max(5, 100 - currentCt);
    const eOp = Math.max(5, 100 - currentEt);
    root.style.setProperty('--lc-container-opacity', `${cOp}%`);
    root.style.setProperty('--lc-editor-opacity', `${eOp}%`);
  }

  chrome.storage.local.get(['lcContainerTrans', 'lcEditorTrans'], (res) => {
    syncTransparency(res.lcContainerTrans, res.lcEditorTrans);
  });

  let initialTheme = DEFAULT;
  try {
    const cached = sessionStorage.getItem('__lcts_active_theme');
    if (cached && VALID.has(cached)) initialTheme = cached;
  } catch (e) {}

  current = initialTheme;
  if (initialTheme !== 'off' && !LCT_THEMES.has(initialTheme)) {
    applying = true;
    try {
      root.setAttribute('data-lc-theme', initialTheme);
      setBaseMode(initialTheme);
    } finally {
      queueMicrotask(() => { applying = false; });
    }
  }

  apply(initialTheme);
  chrome.storage.local.get(KEY, (res) => apply((res && res[KEY]) || DEFAULT));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) apply(changes[KEY].newValue || DEFAULT);
    if (area === 'local' && (changes.lcContainerTrans || changes.lcEditorTrans)) {
      const ct = changes.lcContainerTrans ? changes.lcContainerTrans.newValue : currentCt;
      const et = changes.lcEditorTrans ? changes.lcEditorTrans.newValue : currentEt;
      syncTransparency(ct, et);
    }
  });

  // body may not exist at document_start; sync the base classes onto it once ready.
  if (!document.body) {
    new MutationObserver((_, obs) => {
      if (!document.body) return;
      obs.disconnect();
      if (current && current !== 'off') setBaseMode(current);
    }).observe(root, { childList: true });
  }

  // Re-assert if LeetCode's SPA / its own theme switch overrides us.
  let guardRaf = null;
  let reassertStreak = 0;
  let lastReassert = 0;

  const guard = new MutationObserver(() => {
    if (applying) return;
    if (!current || current === 'off' || LCT_THEMES.has(current)) return;

    const dark = isDark(current);
    const needTheme = root.getAttribute('data-lc-theme') !== current;
    const needDark = root.classList.contains('dark') !== dark;
    if (!needTheme && !needDark) return;

    if (guardRaf) return;
    guardRaf = requestAnimationFrame(() => {
      guardRaf = null;
      if (applying || !current || current === 'off' || LCT_THEMES.has(current)) return;

      const now = performance.now();
      if (now - lastReassert < 800) {
        reassertStreak++;
        if (reassertStreak > 8) {
          // Break ping-pong if host site repeatedly overrides
          return;
        }
      } else {
        reassertStreak = 0;
      }
      lastReassert = now;

      const expectedDark = isDark(current);
      if (root.getAttribute('data-lc-theme') !== current) {
        applying = true;
        try { root.setAttribute('data-lc-theme', current); } finally { queueMicrotask(() => { applying = false; }); }
      }
      if (root.classList.contains('dark') !== expectedDark) {
        site.dark = root.classList.contains('dark');
        site.light = root.classList.contains('light');
        setBaseMode(current);
      }
    });
  });
  guard.observe(root, { attributes: true, attributeFilter: ['class', 'data-lc-theme', 'data-theme'] });
})();
