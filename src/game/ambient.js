/* =============================================================================
   ambient.js  (isolated world, LeetCode)

   A persistent, very subtle ambient layer over the WHOLE page while the
   "First Realm" (Easy) level is active: a scattering of blurred, dim sakura
   petals drifting continuously, plus a handful of tiny points of light that
   fade in and out on their own independent, randomised cycles ("blicker"),
   like distant fireflies -- never in sync, never bright enough to compete
   with the text sitting on top of them.

   PURE CSS, NOT A CANVAS RAF LOOP. The Description-pane-only version of this
   used petals.js's canvas + requestAnimationFrame machinery, which was cheap
   at panel size. Widened to the full viewport it became an ~8-megapixel
   canvas cleared and redrawn on the MAIN THREAD 60x/sec -- competing with
   Monaco's own synchronous keystroke handling and dropping/reordering typed
   characters. Every element here is instead a plain <span> with its
   randomised path baked into CSS custom properties once at creation, driven
   by a transform/opacity-only @keyframes animation (themes/game.css) --
   compositor-only, same rule anime.css's MOTION section already documents
   for every other continuous effect in this codebase. No JS runs per frame.

   STACKING: this layer sits IN FRONT of the page (themes/game.css carries
   the z-index and the full reasoning). Don't "tidy" it back behind the
   panels: they are not translucent windows onto the page background, they
   each paint their own opaque copy of the scene photo, so anything behind
   them is invisible no matter how correctly it is placed.

   Scope: the whole viewport. Mounted once per activation (not per-pane), so
   there's no FlexLayout tab-swap tracking to do. Lifecycle keeps the same
   decaying catch-up + heartbeat shape as src/game/icons.js and
   src/monaco-ink.js -- no subtree MutationObserver, just a periodic check
   for the theme/level being on.
============================================================================= */
(() => {
  const root = document.documentElement;
  /* LeetCode is a client-side-routed SPA: this extension's content scripts
     are only INJECTED on /problems/* (see manifest.json), but nothing about
     that stops them running once injected -- navigating away via LeetCode's
     own in-app router (Problem List, "Explore", the top nav, etc.) is not a
     full page load, so the same script keeps executing wherever you land
     next. Without a path check here, the ambient field kept mounting on
     /problemset/ and anywhere else in the app, since on() only ever checked
     the theme's on/off state, never the URL. Ambient decoration belongs on
     the page you're actually solving a problem on. */
  const on = () => root.getAttribute('data-lc-theme') === 'game' &&
    root.getAttribute('data-lc-game-level') === 'easy' &&
    /^\/problems\/[^/]+/.test(location.pathname);

  const PETAL_URL = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('textures/game/sakura.png')
    : 'textures/game/sakura.png';

  /* LeetCode's own modals (Notes, the Submissions detail panel, etc.) sit
     ABOVE this layer -- it's aria-hidden decoration, not real UI, so it has
     no reason to cover a dialog. Worse than a visual nuisance: if a modal's
     own glass look uses backdrop-filter, then anything still animating
     visually behind it forces the browser to re-sample that blur region
     EVERY FRAME for as long as the modal is open (the same reasoning
     CLAUDE.md's Performance section gives for why this codebase never uses
     backdrop-filter itself -- it applies just as much to someone else's).
     That matches the "lags like crazy specifically while a modal is open"
     symptom exactly, so this stops the layer outright rather than just
     visually hiding it: display:none removes it from compositing, so it
     can't be a cost to anything sampling the page behind the modal. */
  const dialogOpen = () => !!document.querySelector('[role="dialog"], [aria-modal="true"]');

  /* the Problem List drawer is a different case from a real modal above: it
     only covers part of the screen and the petals should keep drifting over
     it (asked for by name -- "keep sakura over it"), just not the blickers.
     It has no role="dialog", so it never trips dialogOpen(). Matched by the
     same exact class core.css themes its background with
     ([class~="bg-lc-layer-01"]), checked against its own bounding box
     rather than mere DOM presence, since LeetCode keeps it mounted
     off-screen (translated out via a class, not removed) even while
     closed. */
  function listDrawerOpen() {
    const el = document.querySelector('[class~="bg-lc-layer-01"]');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > 0 && r.left < innerWidth;
  }

  let wrap = null, mounted = false, hidden = false, blickersOff = false;

  function rand(min, max) { return min + Math.random() * (max - min); }

  function buildBlickers(host) {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const dot = document.createElement('span');
      dot.className = 'lctg-blicker';
      dot.style.left = rand(6, 94) + '%';
      dot.style.top = rand(8, 92) + '%';
      /* patches of light, not pinpoints: the size carries the softness and
         the centre stays bright enough to actually register over a busy,
         moonlit photo. Spreading the light out is what makes it a bloom --
         dimming it as well is what made it invisible. */
      dot.style.setProperty('--size', rand(26, 56).toFixed(0) + 'px');
      dot.style.setProperty('--peak', rand(0.40, 0.60).toFixed(2));
      if (reduced) {
        dot.style.opacity = String(rand(0.10, 0.18));
      } else {
        /* slow: a swell you notice only if you look at it */
        dot.style.animationDuration = rand(6000, 12000).toFixed(0) + 'ms';
        dot.style.animationDelay = '-' + rand(0, 12000).toFixed(0) + 'ms';
      }
      host.appendChild(dot);
    }
  }

  /* each petal's whole fall (start x, size, sideways drift, rotation, peak
     opacity, duration) is fixed at creation time via CSS custom properties;
     a negative animation-delay starts it mid-cycle so the page doesn't open
     with every petal stacked at the top edge */
  function buildPetals(host) {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'lctg-petal';
      p.style.backgroundImage = `url("${PETAL_URL}")`;
      p.style.setProperty('--x', rand(-4, 100).toFixed(1) + '%');
      p.style.setProperty('--size', rand(14, 26).toFixed(0) + 'px');
      p.style.setProperty('--drift', rand(-70, 70).toFixed(0) + 'px');
      p.style.setProperty('--rot', rand(160, 340).toFixed(0) + 'deg');
      p.style.setProperty('--peak', rand(0.14, 0.30).toFixed(2));
      if (reduced) {
        p.style.opacity = String(rand(0.08, 0.16));
      } else {
        const dur = rand(14, 24);
        p.style.setProperty('--dur', dur.toFixed(1) + 's');
        p.style.animationDelay = '-' + rand(0, dur).toFixed(1) + 's';
      }
      host.appendChild(p);
    }
  }

  function mount() {
    wrap = document.createElement('div');
    wrap.className = 'lctg-ambient';
    wrap.setAttribute('aria-hidden', 'true');
    document.body.appendChild(wrap);
    buildPetals(wrap);
    buildBlickers(wrap);
    mounted = true;
  }

  function unmount() {
    if (wrap) wrap.remove();
    wrap = null; mounted = false;
  }

  function applyDialogState() {
    if (!wrap) return;
    const should = dialogOpen();
    if (should !== hidden) {
      hidden = should;
      wrap.style.display = hidden ? 'none' : '';
    }
    const noBlicker = listDrawerOpen();
    if (noBlicker !== blickersOff) {
      blickersOff = noBlicker;
      wrap.classList.toggle('lctg-ambient--no-blicker', blickersOff);
    }
  }

  function safe() {
    if (!on()) { if (mounted) unmount(); return; }
    if (mounted && wrap && wrap.isConnected) { applyDialogState(); return; }   // already mounted and current
    if (mounted) unmount();
    if (document.body) { mount(); applyDialogState(); }
  }

  /* a modal opening/closing is (almost always) body gaining/losing a direct
     child -- portal-style overlays mount there. childList only, no
     subtree:true, so this is cheap and does NOT fire on Monaco's own
     internal churn while typing (that all happens deeper in the tree, under
     existing nodes) -- the same "no subtree observer" rule as everywhere
     else in this codebase, just at the shallowest possible scope instead of
     skipped entirely, since this needs to react within a frame or two, not
     on the 1.5s heartbeat's schedule. Deferred: this file runs at
     document_start (see manifest.json), where document.body doesn't exist
     yet, so setup rides the same decaying retry as the mount check below
     rather than throwing at load and silently never observing anything. */
  let bodyWatcher = null;
  function watchBody() {
    if (bodyWatcher || !document.body) return;
    bodyWatcher = new MutationObserver(() => { try { applyDialogState(); } catch (e) {} });
    bodyWatcher.observe(document.body, { childList: true });
  }

  let delay = 300;
  (function tick() {
    try { safe(); watchBody(); } catch (e) {}
    if (delay > 20000) return;
    setTimeout(tick, delay);
    delay *= 2;
  })();
  setInterval(() => { try { safe(); watchBody(); } catch (e) {} }, 1500);

  new MutationObserver(() => { try { safe(); } catch (e) {} })
    .observe(root, { attributes: true, attributeFilter: ['data-lc-theme', 'data-lc-game-level'] });
})();
