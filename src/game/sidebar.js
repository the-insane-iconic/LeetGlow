/* =============================================================================
   sidebar.js  (isolated world, LeetCode)

   Injects the reference's vertical icon sidebar (see /leet/app/page.tsx +
   globals.css -- the actual source project behind the HUD reference images)
   as real UI, not a restyle of the existing horizontal tab row. Clicking an
   item clicks the matching real tab button; the active item stays in sync
   with whichever real tab is selected, in both directions.

   This is genuinely new injected DOM (the user's explicit choice after
   seeing the reference source), so it carries more risk of drifting out of
   sync with LeetCode's own markup than a pure CSS restyle -- kept as simple
   as possible: label-text matching (same approach as icons.js), no subtree
   MutationObserver, a decaying catch-up + heartbeat.

   KNOWN LIMITATION (first pass): the sidebar overlays the page rather than
   reserving space for itself the way the reference's .app-shell does (it
   shifts its own layout right via padding-left). FlexLayout measures the
   real page in JS pixels, and forcing that via a CSS override risks fighting
   its own layout math on a page this extension doesn't control -- so for
   now the sidebar floats over the Description panel's left edge instead of
   pushing it over. Follow-up if that reads as a problem in practice.
============================================================================= */
(() => {
  const root = document.documentElement;
  const on = () => root.getAttribute('data-lc-theme') === 'game';

  /* lucide-static v1.47.0 (ISC licence) -- code-2, wand-sparkles,
     git-compare-arrows, check, in that order */
  const ICONS = {
    Problem: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
    Editorial: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
    Solutions: '<circle cx="5" cy="6" r="3"/><path d="M12 6h5a2 2 0 0 1 2 2v7"/><path d="m15 9-3-3 3-3"/><circle cx="19" cy="18" r="3"/><path d="M12 18H7a2 2 0 0 1-2-2V9"/><path d="m9 15 3 3-3 3"/>',
    Submissions: '<path d="M20 6 9 17l-5-5"/>'
  };
  /* sidebar label -> the real tab's own label text (only "Problem" differs) */
  const TAB_LABEL = { Problem: 'Description', Editorial: 'Editorial', Solutions: 'Solutions', Submissions: 'Submissions' };

  let sidebar = null, items = {};

  function build() {
    if (sidebar) return;
    sidebar = document.createElement('div');
    sidebar.className = 'lctg-sidebar';
    Object.keys(ICONS).forEach((label) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'lctg-sidebar-item';
      btn.setAttribute('aria-label', label);
      btn.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
        'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[label] + '</svg>' +
        '<span>' + label + '</span>';
      btn.addEventListener('click', () => selectReal(TAB_LABEL[label]));
      sidebar.appendChild(btn);
      items[label] = btn;
    });
    (document.body || document.documentElement).appendChild(sidebar);
  }

  function findTabButton(text) {
    const contents = document.querySelectorAll('.flexlayout__tab_button_content');
    for (let i = 0; i < contents.length; i++) {
      if (contents[i].textContent.trim() === text) return contents[i].closest('.flexlayout__tab_button');
    }
    return null;
  }

  function selectReal(text) {
    const btn = findTabButton(text);
    if (btn) btn.click();
  }

  function syncActive() {
    let activeText = null;
    document.querySelectorAll('.flexlayout__tab_button--selected .flexlayout__tab_button_content').forEach((c) => {
      activeText = c.textContent.trim();
    });
    Object.keys(TAB_LABEL).forEach((label) => {
      const el = items[label];
      if (el) el.classList.toggle('selected', TAB_LABEL[label] === activeText);
    });
  }

  function safe() {
    if (!on()) {
      if (sidebar) { sidebar.remove(); sidebar = null; items = {}; }   // our own DOM: remove it outright, not just hide it
      return;
    }
    build();
    try { syncActive(); } catch (e) {}
  }

  /* decaying catch-up for late-mounting tabs, then a light heartbeat --
     same shape as src/monaco-ink.js and src/game/icons.js */
  let delay = 300;
  (function tick() {
    safe();
    if (delay > 20000) return;
    setTimeout(tick, delay);
    delay *= 2;
  })();
  setInterval(safe, 1000);

  /* our own theme switches, and only ours */
  new MutationObserver(safe)
    .observe(root, { attributes: true, attributeFilter: ['data-lc-theme'] });
})();
