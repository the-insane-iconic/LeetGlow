/* =============================================================================
   game.js  (isolated world, LeetCode)

   Drives the Gaming Theme on the real page: reads the open problem's
   difficulty and sets data-lc-game-level so themes/game.css can pick the
   right material -- the valley for Easy, a plain dark fallback for
   Medium/Hard, which have no art yet (see CLAUDE_ANKIT.md) -- publishes the
   base mode + Monaco ink for that level the way src/anime/anime.js does for
   its scenes, and plays the "First Realm" title card on every Easy problem
   open, solved or not (unlike src/anime/moments.js's title card, which this
   deliberately does not share detection with -- see below -- Solved is not
   checked here at all, on purpose: a level intro is scenery for opening the
   problem, not a spoiler-avoidance mechanic, so it plays every time).

   Detection reuses the same hooks and polling shape as
   src/anime/moments.js's title card (no MutationObserver; a slug check on a
   1s interval, difficulty read via [class*="text-difficulty-"]) rather than
   sharing that file, since it is wired tightly to the anime theme's on()
   gate.
============================================================================= */
(() => {
  const root = document.documentElement;

  /* the "moonlit fantasy HUD" night-editor palette: soft, restrained
     illumination against midnight glass, not neon-on-black. Keywords are
     lavender (not the earlier purple pulled from /leet), functions a
     moonlit cyan, strings a soft mint, numbers a muted warm gold -- meant
     to read as magic caught in the dark rather than a normal syntax theme. */
  const EASY_INK = {
    a: 1,
    variable:'#e6edf3', comment:'#71869a', keyword:'#b9a7ff', control:'#b9a7ff',
    string:'#8dd6b8',   number:'#e7c873',  func:'#67d9e8',    type:'#9ccbff',
    param:'#c7d6e8',    operator:'#b8c7d9', regexp:'#8dd6b8', invalid:'#e88a7a'
  };

  const on = () => root.getAttribute('data-lc-theme') === 'game';

  /* EVERY DIFFICULTY GETS THE VALLEY, for now. Medium and Hard used to fall
     through to a green/gold placeholder block in themes/game.css, which has
     been removed -- see the comment on that block. Until "The Fallen Forest"
     and "The Edge of the World" have art of their own (CLAUDE_ANKIT.md), the
     level attribute is set unconditionally, so Medium and Hard render exactly
     as Easy does rather than as a second, unfinished theme.

     `level` is still threaded through so the escalation this was built for
     can come back by making this honour it again -- one line, here. */
  function setLevel(level) {
    root.setAttribute('data-lc-game-level', 'easy');
    globalThis.__lctsGameInk = EASY_INK;
    /* ALWAYS dark, at every level -- themes/game.css declares
       color-scheme:dark both at the theme's base rule and again in the
       Easy-level block, so the whole theme is visually dark in every state.
       This used to read easy ? 'light' : 'dark', from when Easy was a light
       parchment material; that was left stale after "PHASE 1 REDO" turned
       Easy into the dark blue-glass valley (see themes/game.css's own
       comment on that block) and nobody updated the flag to match.

       The mismatch was real, not cosmetic: content.js uses this value to
       decide whether <html>/<body> get the .dark or .light class, and
       LeetCode's own native components (Radix dialogs like Notes among
       them) branch on that literal class via Tailwind's dark: variant --
       entirely separately from any sd- or lc- custom property this
       theme overrides. Telling LeetCode "light" while presenting a dark UI
       meant every native, un-themed component rendered its light-mode
       defaults (dark text) against our dark-forced backgrounds -- e.g. the
       Notes textarea's typed text was invisible for exactly this reason,
       and no per-component CSS patch could have fixed it for good, since
       the same mismatch affects every other native component too. */
    const mode = 'dark';
    const modeChanged = globalThis.__lctsGameMode !== mode;
    globalThis.__lctsGameMode = mode;
    if (modeChanged && globalThis.__lctsReassertMode) globalThis.__lctsReassertMode();
    if (globalThis.__lctsInkRefresh) globalThis.__lctsInkRefresh();
    setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 240);
  }

  /* ---- reading the open problem: same hooks as src/anime/moments.js ------- */
  const slugOf = () => { const m = /^\/problems\/([^/]+)/.exec(location.pathname); return m ? m[1] : null; };

  function titleEl(slug) {
    const t = document.querySelector('.text-title-large, [data-track-load="description_content"] h4, [data-track-load="description_content"] [class*="title"]');
    return t;
  }

  function readTitle(slug) {
    const P = globalThis.LCTSProblem;
    if (P && typeof P.get === 'function') {
      const p = P.get();
      if (p && p.slug === slug && p.title) {
        return { number: p.number || '', title: p.title, difficulty: p.difficulty || '' };
      }
    }
    const t = titleEl(slug);
    if (!t) return null;
    const raw = t.textContent.trim();
    const m = /^\s*(\d+)\.\s+(.+?)(?:\s+(?:Solved|已解答))?\s*$/i.exec(raw);
    const d = document.querySelector('[class*="text-difficulty-"], [class*="difficulty"]');
    const diff = d ? d.textContent.trim() : '';
    if (m) {
      return { number: m[1], title: m[2], difficulty: diff };
    } else if (raw.length > 0) {
      return { number: '', title: raw.replace(/\s*(?:Solved|已解答)\s*$/i, '').trim(), difficulty: diff };
    }
    return null;
  }

  const whenVisible = () => new Promise((res) => {
    if (document.visibilityState === 'visible') return res();
    const f = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', f); res(); } };
    document.addEventListener('visibilitychange', f);
  });

  let lastSlug = null, ticket = 0;
  function poll() {
    if (!on()) return;
    const slug = slugOf();
    if (!slug || slug === lastSlug) return;
    lastSlug = slug;
    /* a tab not clicked yet plays its cues through the offscreen page: open it now */
    if (globalThis.LCTSSounds) globalThis.LCTSSounds.prime('game');
    const my = ++ticket;
    let tries = 0, since = 0;
    const P = globalThis.LCTSProblem;
    const iv = setInterval(async () => {
      if (my !== ticket || !on()) { clearInterval(iv); return; }
      if (++tries > 90) {
        clearInterval(iv);
        setLevel('easy');
        if (!globalThis.LCTSGame) return;
        await whenVisible();
        if (my !== ticket || !on()) return;
        const fallbackTitle = slug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        globalThis.LCTSGame.titleCard({
          level: 1,
          levelLabel: 'LEVEL 1',
          tagline: 'MYSTICAL NIGHT',
          title: fallbackTitle
        });
        if (globalThis.LCTSGameSounds) globalThis.LCTSGameSounds.play('title', { retryWithin: 2600 });
        return;
      }
      /* a full page load: LeetCode's server-rendered data has the problem ~1.2 s
         in, seconds before the panel layout draws its title (src/problem.js) */
      const s = P && P.ssr(slug);
      const info = s ? { number: s.number, title: s.title, difficulty: s.difficulty || '' } : readTitle(slug);
      if (!info) return;
      const diff = (info.difficulty || '').toLowerCase();
      setLevel(diff === 'easy' ? 'easy' : 'other');
      /* from the page, give difficulty a moment to settle if not present yet */
      if (!s && !info.difficulty) {
        if (!since) since = performance.now();
        if (performance.now() - since < 500) return;
      }
      clearInterval(iv);
      if (!globalThis.LCTSGame) return;
      await whenVisible();
      if (my !== ticket || !on()) return;

      let lvl = 1, lvlLabel = 'LEVEL 1', tagline = 'MYSTICAL NIGHT';
      if (diff === 'medium') {
        lvl = 2;
        lvlLabel = 'LEVEL 2';
        tagline = 'THE FALLEN FOREST';
      } else if (diff === 'hard') {
        lvl = 3;
        lvlLabel = 'LEVEL 3';
        tagline = 'THE EDGE OF THE WORLD';
      }

      globalThis.LCTSGame.titleCard({
        level: lvl,
        levelLabel: lvlLabel,
        tagline: tagline,
        title: (info.number ? info.number + '. ' : '') + info.title
      });
      /* the level intro's cue (sounds/game/title-card.mp3). retryWithin is
         what makes this one actually audible on a cold page load: the card
         fires on problem open, so unlike a verdict there is no click behind
         it and the browser refuses the first attempt. The card is on screen
         for ~3.3s, so a gesture inside that window still belongs to it. */
      if (globalThis.LCTSGameSounds) globalThis.LCTSGameSounds.play('title', { retryWithin: 2600 });
    }, 120);
  }

  /* Apply the material immediately, before the difficulty poll below has
     anything to read. That poll needs the problem title to be in the DOM, so
     it lands well after first paint -- and until it did, the page rendered
     with no level attribute at all, which is what produced the green flash on
     load. Now that every difficulty resolves to the same material there is
     nothing to wait for. */
  if (on()) setLevel('easy');
  new MutationObserver(() => { if (on()) setLevel('easy'); })
    .observe(root, { attributes: true, attributeFilter: ['data-lc-theme'] });

  poll();

  /* Event-driven SPA navigation & problem change detection */
  if (globalThis.LCTSProblem && globalThis.LCTSProblem.onChange) {
    globalThis.LCTSProblem.onChange(() => { if (on()) poll(); });
  }
  if (window.navigation) {
    window.navigation.addEventListener('navigatesuccess', () => { if (on()) poll(); });
  }
  window.addEventListener('popstate', () => { if (on()) poll(); });
  window.addEventListener('focus', () => { if (on()) poll(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && on()) poll(); });

  /* Low-frequency idle watchdog (only when tab is visible and theme is game) */
  setInterval(() => { if (!document.hidden && on()) poll(); }, 8000);

  /* our own theme switches: re-check the level at once, no page reload */
  new MutationObserver(() => { if (on()) { lastSlug = null; poll(); } })
    .observe(root, { attributes: true, attributeFilter: ['data-lc-theme'] });
})();
