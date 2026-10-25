/* =============================================================================
   icons.js  (isolated world, LeetCode)

   Swaps a handful of LeetCode's own icons for the Gaming Theme's set
   whenever the theme is on: Run, the editor's Auto-language lock, and the
   raster crystal/gem icons (textures/game/icon/*) for Testcase/Solutions/
   Description/Editorial/Submissions.

   Marking happens here; all the actual hiding/replacing is CSS in
   themes/game.css, scoped under html[data-lc-theme="game"] and keyed off a
   data-lctg-icon attribute this file sets. Switching the theme off (or away)
   removes that scoping, so the page reverts on its own -- this never mutates
   an element's own style, only adds an inert marker attribute.

   No selector is documented as stable for a tab icon or the Auto lock (only
   the Run/Submit buttons have a data-e2e-locator, per CLAUDE.md) -- these are
   matched by their own visible label text instead, scoped to small, known
   regions (.flexlayout__tab_button_content, #editor) so this can never touch
   the wider page or the code the user is actually typing.
============================================================================= */
(() => {
  const root = document.documentElement;
  const on = () => root.getAttribute('data-lc-theme') === 'game';

  /* lower-cased, and matched with a substring check rather than equality --
     two real quirks in the actual markup broke an exact "Solutions" match:
     (1) the label's own element carries a "capitalize" class, meaning the
     raw DOM text is plain lower-case and only looks capitalized on screen;
     (2) LeetCode renders the label TWICE inside the same wrapper, one bold
     copy and one normal copy stacked with absolute positioning (a common
     no-reflow hover-weight trick), so the wrapper's real textContent is
     "SolutionsSolutions", not "Solutions". A substring check on the
     lower-cased text survives both. */
  const TAB_ICON = {
    testcase: 'testcase', solutions: 'solutions', description: 'description',
    editorial: 'editorial', submissions: 'submissions'
  };

  function markTabs() {
    document.querySelectorAll('.flexlayout__tab_button_content').forEach((el) => {
      const text = el.textContent.trim().toLowerCase();
      let key = null;
      for (const label in TAB_ICON) { if (text.includes(label)) { key = TAB_ICON[label]; break; } }
      if (key) {
        if (el.getAttribute('data-lctg-icon') !== key) el.setAttribute('data-lctg-icon', key);
      } else if (el.hasAttribute('data-lctg-icon')) {
        el.removeAttribute('data-lctg-icon');   // label changed (locale, etc.) -- don't leave a stale marker
      }
    });
  }

  /* the "Auto" language-lock label, scoped to #editor so a variable or
     comment named "Auto" in the user's own code can never match */
  function markAuto() {
    const editor = document.getElementById('editor');
    if (!editor) return;
    const candidates = editor.querySelectorAll('span, div');
    let found = null;
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.children.length) continue;              // leaf nodes only
      if (el.closest('.monaco-editor')) continue;     // never the code itself
      if (el.textContent.trim() === 'Auto') { found = el; break; }
    }
    const wantParent = found && found.parentElement;
    document.querySelectorAll('[data-lctg-icon="auto"]').forEach((el) => {
      if (el !== wantParent) el.removeAttribute('data-lctg-icon');
    });
    if (wantParent) wantParent.setAttribute('data-lctg-icon', 'auto');
  }

  /* "Testcase"/"Test Result" (the small tab pair under the editor) and
     "Analysis" (the crystal-special button on a submission's detail page)
     -- none of these have a documented selector either, same problem as
     Auto above. Scoped to the console pane (sheet-scroll.js's own tag for
     the right-side, non-Monaco tabs) rather than #editor, since that's
     where all three actually live; still leaf-only and never inside
     .monaco-editor, so user code can't match. */
  const LABELS = {
    Testcase: 'testcase', 'Test Result': 'test-result', Analysis: 'analysis',
    'You must run your code first': 'empty-msg'
  };
  function markLabels() {
    const pane = document.querySelector('.flexlayout__tab[data-lcts-pane="console"]');
    if (!pane) return;
    const found = {};
    const candidates = pane.querySelectorAll('span, div, button');
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.children.length) continue;
      if (el.closest('.monaco-editor')) continue;
      const key = LABELS[el.textContent.trim()];
      if (!key || found[key]) continue;
      if (key === 'empty-msg') {
        /* the message itself, plus the small box wrapping message+icon
           together a few levels up (for a background glow behind both),
           plus the nearest svg icon sitting next to it */
        found['empty-msg'] = el;
        let box = el, hops = 0;
        while (box && box.querySelector('svg') === null && hops < 4) { box = box.parentElement; hops++; }
        if (box) {
          found['empty-chamber'] = box;
          const icon = box.querySelector('svg');
          if (icon) found['empty-icon'] = icon;
        }
        continue;
      }
      /* mark the clickable button (so a border/background can sit on the
         whole control), falling back to the label itself if there's no
         button ancestor within a few levels -- same shape as markAuto's
         .parentElement, just walking further since these buttons wrap the
         label in an icon+text row */
      let target = el, hops = 0;
      while (target && target.tagName !== 'BUTTON' && hops < 4) { target = target.parentElement; hops++; }
      found[key] = (target && target.tagName === 'BUTTON') ? target : el;
    }
    document.querySelectorAll('[data-lctg-label]').forEach((el) => {
      const key = el.getAttribute('data-lctg-label');
      if (!el.closest('.flexlayout__tab[data-lcts-pane="console"]') || found[key] !== el) {
        el.removeAttribute('data-lctg-label');
      }
    });
    for (const key in found) found[key].setAttribute('data-lctg-label', key);
  }

  /* Solutions-article / Submissions-detail code blocks: LeetCode wraps a
     <pre> (sometimes via an extra .group) in a plain rounded-lg/bg-fill-3
     div that themes/game.css wants to restyle as a themed card. That used
     to be a :has() selector -- div[class~="rounded-lg"][class~="bg-fill-3"]
     :has(> pre) -- which CLAUDE.md's Performance section already rules out
     ("no :has() on panels"): a relational selector like that has to be kept
     live against every DOM mutation ANYWHERE that could add or remove a
     matching descendant, not just inside the box itself, so a heavy,
     frequently-churning view (the Submissions list, a Notes modal mounting
     elsewhere in the tree) forced a page-wide style recalc on every change.

     The first JS replacement for it (querying every div[rounded-lg][bg-
     fill-3] on the page, then checking each for a pre child) was its own
     version of the same mistake: rounded-lg/bg-fill-3 is a generic utility
     pairing LeetCode reuses all over its UI, not just on code blocks, so on
     a populated Submissions list that was matching a large and growing set
     of elements and re-querying every one of them, synchronously, on this
     file's 2s heartbeat -- forever, whether or not anything actually
     changed. That is what froze the page for a moment right as a
     list-heavy view rendered.

     This queries `pre` instead: a real page has only a handful, code blocks
     specifically, so the candidate set stays small and bounded no matter
     how large the Submissions list or the rest of the page gets. Two hops
     up per pre mirrors the two :has() shapes it replaces (direct parent,
     or parent via an intervening .group) without ever touching the common
     class pair as a search root. */
  function markCodeCards() {
    const wanted = new Set();
    document.querySelectorAll('pre').forEach((pre) => {
      if (pre.closest('.monaco-editor')) return;      // never the code being typed
      const direct = pre.parentElement;
      const viaGroup = direct && direct.classList.contains('group') ? direct.parentElement : null;
      const box = [direct, viaGroup].find((b) => b && b.classList.contains('rounded-lg') && b.classList.contains('bg-fill-3'));
      if (box) wanted.add(box);
    });
    document.querySelectorAll('[data-lctg-code-card]').forEach((el) => {
      if (!wanted.has(el)) el.removeAttribute('data-lctg-code-card');
    });
    wanted.forEach((el) => { if (!el.hasAttribute('data-lctg-code-card')) el.setAttribute('data-lctg-code-card', ''); });
  }

  function safe() {
    if (!on()) return;
    try { markTabs(); markAuto(); markLabels(); markCodeCards(); } catch (e) {}
  }

  /* decaying catch-up for late-mounting tabs/toolbar, then a light heartbeat
     -- same shape as src/monaco-ink.js, no subtree MutationObserver */
  let delay = 300;
  (function tick() {
    safe();
    if (delay > 20000) return;
    setTimeout(tick, delay);
    delay *= 2;
  })();
  setInterval(safe, 2000);

  /* our own theme switches, and only ours */
  new MutationObserver(safe)
    .observe(root, { attributes: true, attributeFilter: ['data-lc-theme'] });
})();
