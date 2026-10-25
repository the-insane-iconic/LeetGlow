/* =============================================================================
   sheet-scroll.js  (isolated world)

   Two jobs, both of which CSS cannot do on its own:

   1. Tag the element that actually scrolls inside each panel. The paper is
      painted on .flexlayout__tab, which never moves, so the words slid over a
      stationary surface. CSS cannot select "the element that scrolls", so we
      find it and tag it; background-attachment:local then makes the sheet
      travel with the content.

   2. Label each panel as code / description / console. That label replaces a
      pair of :has() selectors that used to sit on .flexlayout__tab. :has() on a
      panel makes Chrome re-evaluate that panel whenever anything inside it
      changes -- and the things inside are Monaco's virtualised lines and an
      endless comment list. A plain attribute costs nothing to match.

   COST CONTROL
   There is no MutationObserver here. An observer on this subtree fires on every
   virtualised row Monaco recycles, which is thousands of callbacks during a
   scroll. Instead:
     - a 1.5s heartbeat does a 4-call querySelector check and stops there if
       every panel is already tagged. No layout is read on that path.
     - the full walk (which does read layout) runs only when a panel is
       untagged: on load, on a tab switch, on resize.
     - tab switches are caught by one capture-phase click listener.
     - all layout-forcing reads in the walk are batched ahead of all writes, so
       it costs one flush rather than one per element.
============================================================================= */
(() => {
  const ATTR = 'data-lcts-scroll';
  const PANE = 'data-lcts-pane';
  const MAX_NODES = 80, MAX_DEPTH = 5, MIN_OVERFLOW = 48;

  /* themes whose panels are a printed sheet that should travel with the words */
  const SHEET_THEMES = { paper: 1, bloom: 1 };
  /* the game theme doesn't have a sheet texture, but it needs the SAME walk's
     other job -- labelling each panel code/desc/console -- so its glass can
     give each pane a different opacity (see themes/game.css) without a
     :has() selector on a panel */
  const PANE_THEMES = { paper: 1, bloom: 1, game: 1 };
  const isPaper = () =>
    !!SHEET_THEMES[document.documentElement.getAttribute('data-lc-theme') || ''];
  const needsPaneTag = () =>
    !!PANE_THEMES[document.documentElement.getAttribute('data-lc-theme') || ''];

  /* cheap: no layout reads, four querySelector calls */
  function settled(tabs) {
    for (const tab of tabs) {
      if (!tab.hasAttribute(PANE)) return false;
      if (tab.getAttribute(PANE) === 'code') continue;
      const s = tab.querySelector('[' + ATTR + ']');
      if (!s || !s.isConnected) return false;
    }
    return true;
  }

  function walk() {
    const tabs = document.querySelectorAll('.flexlayout__tab');
    if (!tabs.length) return;

    /* ---------- reads ---------- */
    const half = window.innerWidth / 2;
    const plan = [];
    for (const tab of tabs) {
      if (tab.querySelector('.monaco-editor')) { plan.push([tab, 'code', null]); continue; }
      const r = tab.getBoundingClientRect();
      const pane = r.left < half ? 'desc' : 'console';

      let queue = [[tab, 0]], seen = 0, found = null;
      while (queue.length && seen < MAX_NODES) {
        const item = queue.shift(), el = item[0], d = item[1];
        seen++;
        if (d > 0 && el.scrollHeight - el.clientHeight > MIN_OVERFLOW) {
          const ov = getComputedStyle(el).overflowY;
          if (ov === 'auto' || ov === 'scroll') { found = el; break; }
        }
        if (d < MAX_DEPTH) for (const ch of el.children) queue.push([ch, d + 1]);
      }
      plan.push([tab, pane, found]);
    }

    /* ---------- writes ---------- */
    for (const item of plan) {
      const tab = item[0], pane = item[1], found = item[2];
      if (tab.getAttribute(PANE) !== pane) tab.setAttribute(PANE, pane);
      const stale = tab.querySelectorAll('[' + ATTR + ']');
      for (const n of stale) if (n !== found) n.removeAttribute(ATTR);
      if (found && !found.hasAttribute(ATTR)) found.setAttribute(ATTR, '');
    }
  }

  function beat() {
    if (!needsPaneTag()) return;
    const tabs = document.querySelectorAll('.flexlayout__tab');
    if (!tabs.length || settled(tabs)) return;
    try { walk(); } catch (e) {}
  }

  function nudge(ms) { setTimeout(() => { try { beat(); } catch (e) {} }, ms || 250); }

  setInterval(beat, 1500);
  beat();

  /* a tab switch replaces the panel contents; catch it once, cheaply */
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.closest && t.closest('.flexlayout__tab_button')) { nudge(120); nudge(600); }
  }, true);

  let rz;
  window.addEventListener('resize', () => {
    clearTimeout(rz);
    rz = setTimeout(() => {
      for (const tab of document.querySelectorAll('.flexlayout__tab')) tab.removeAttribute('data-lcts-pane');
      beat();
    }, 250);
  });

  new MutationObserver(() => nudge(200))
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme'] });
})();
