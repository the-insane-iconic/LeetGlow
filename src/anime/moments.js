/* =============================================================================
   moments.js  (isolated world, LeetCode)

   Notices the two events worth a scene -- a verdict, and opening a problem --
   and plays them through moments-ui.js.

   COST CONTROL
   There is no MutationObserver. Verdicts arrive from src/verdict.js; the
   title card is a one-second pathname comparison.
============================================================================= */
(() => {
  const root = document.documentElement;
  const UI = globalThis.LCTSMoments;
  const SFX = globalThis.LCTSSounds;

  /* Anime Studio and Web Crawler each get their own moments settings, keyed by
     storage key, so enabling/muting one never touches the other. Web Crawler
     has no settings UI yet, so it simply runs on DEFAULTS until one exists. */
  const DEFAULTS = { titleCard: true, moments: true, sound: true, volume: 0.8 };
  let settings = {
    anime: Object.assign({}, DEFAULTS),
    crawler: Object.assign({}, DEFAULTS)
  };

  /* game and pixel themes have their own dedicated animation/sfx systems.
     All other themes (sakura-dream, ocean-deep, paper, midnight-dark, anime, grid, etc.)
     use the universal moments and SFX. */
  const HAS_CUSTOM_MOMENT = new Set(['game', 'pixel']);
  const theme = () => root.getAttribute('data-lc-theme') || root.getAttribute('data-lct-theme') || '';
  const on = () => !HAS_CUSTOM_MOMENT.has(theme()) && !root.hasAttribute('data-lc-focus');
  const activeSettings = () => (theme() === 'crawler' ? settings.crawler : settings.anime) || DEFAULTS;

  /* a tab not clicked yet plays through the offscreen page: open it early */
  function primeSound() {
    if (SFX && on() && activeSettings().sound && activeSettings().titleCard) {
      SFX.prime(theme() === 'crawler' ? 'crawler' : 'anime');
    }
  }

  chrome.storage.local.get(['lcAnime', 'lcCrawler', 'lcVolume'], (res) => {
    if (res.lcAnime) settings.anime = Object.assign({}, DEFAULTS, res.lcAnime);
    if (typeof res.lcVolume === 'number') settings.anime.volume = res.lcVolume / 100;
    if (res.lcCrawler) settings.crawler = Object.assign({}, DEFAULTS, res.lcCrawler);
    if (UI && UI.setJapanese) UI.setJapanese(settings.anime.japanese !== false);
    primeSound();
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.lcAnime) settings.anime = Object.assign({}, DEFAULTS, ch.lcAnime.newValue || {});
    if (ch.lcVolume && typeof ch.lcVolume.newValue === 'number') settings.anime.volume = ch.lcVolume.newValue / 100;
    if (ch.lcAnime && UI && UI.setJapanese) UI.setJapanese(settings.anime.japanese !== false);
    if (ch.lcCrawler) settings.crawler = Object.assign({}, DEFAULTS, ch.lcCrawler.newValue || {});
  });

  /* the overlay and its sound always start together */
  function sound(kind) {
    if (activeSettings().sound && SFX) {
      const vol = typeof activeSettings().volume === 'number' ? activeSettings().volume : 0.8;
      const soundTheme = theme() === 'crawler' ? 'crawler' : 'anime';
      SFX.play(kind, { volume: vol, theme: soundTheme });
    }
  }
  function playResult(kind, info) {
    UI.result(kind, info);
    sound(kind === 'wa' && info && info.action === 'submit' ? 'wa-submit' : kind);
  }
  function playAction(action) {
    if (UI.actionStart) UI.actionStart(action);
    sound(action === 'submit' ? 'submit-start' : 'run-start');
  }
  function playTitle(info) { UI.titleCard(info); sound('title'); }

  /* ---- execution & verdicts ------------------------------------------------
     Detected once, for every theme, by src/verdict.js (LeetCode's own check
     JSON first, the DOM as a fallback). Running and submitting states trigger
     tactical overlays and sfx; verdicts trigger terminal stamps. */
  if (globalThis.LCTSVerdict) {
    if (globalThis.LCTSVerdict.subscribeAction) {
      globalThis.LCTSVerdict.subscribeAction((action) => {
        if (!on() || !activeSettings().moments || !UI) return;
        playAction(action);
      });
    }
    globalThis.LCTSVerdict.subscribe((v) => {
      if (!on() || !activeSettings().moments || !UI) return;
      const info = { label: v.label, beats: v.beats, action: v.action, lang: v.lang,
                     runtime: v.runtime, passed: v.passed, total: v.total };
      playResult(v.kind, info);
    });
  }

  /* ---- the episode title card ------------------------------------------------
     every time an UNSOLVED problem is opened (a load, a refresh, or moving to
     another problem in the app). Tab switches inside one problem keep the same
     slug, so they never replay it. */
  const slugOf = () => { const m = /^\/problems\/([^/]+)/.exec(location.pathname); return m ? m[1] : null; };

  function titleEl(slug) {
    const t = document.querySelector('.flexlayout__tab .text-title-large');
    if (!t) return null;
    /* after an in-app navigation the previous title can linger for a moment */
    const a = t.querySelector('a[href]');
    if (a && a.getAttribute('href').indexOf('/problems/' + slug) === -1) return null;
    return t;
  }

  function readTitle(slug) {
    const t = titleEl(slug);
    if (!t) return null;
    const m = /^\s*(\d+)\.\s+(.+?)\s*$/.exec(t.textContent);
    if (!m) return null;
    const d = document.querySelector('.flexlayout__tab [class*="text-difficulty-"]');
    return { number: m[1], title: m[2], difficulty: d ? d.textContent.trim() : '' };
  }

  /* Signed in, LeetCode puts a "Solved" label (with a check icon) in the title
     row. Only the few ancestors around the title are searched, and only text
     nodes whose whole text is the label, so the statistics further down the
     description ("Accepted", "Submissions") can never match. */
  const SOLVED = /^(Solved|已解答)$/;
  function isSolved(slug) {
    const t = titleEl(slug);
    if (!t) return false;
    let box = t;
    for (let i = 0; i < 4 && box.parentElement; i++) box = box.parentElement;
    const walk = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
    let n, budget = 400;
    while ((n = walk.nextNode()) && budget-- > 0) {
      if (n.nodeValue.length < 12 && SOLVED.test(n.nodeValue.trim())) return true;
    }
    return false;
  }

  const whenVisible = () => new Promise((res) => {
    if (document.visibilityState === 'visible') return res();
    const f = () => { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', f); res(); } };
    document.addEventListener('visibilitychange', f);
  });

  let lastSlug = null, cardTicket = 0;
  function maybeTitleCard() {
    const slug = slugOf();
    if (!slug || slug === lastSlug) return;
    lastSlug = slug;
    const ticket = ++cardTicket;
    let tries = 0, titleSince = 0;
    const P = globalThis.LCTSProblem;
    const poll = setInterval(async () => {
      if (ticket !== cardTicket || ++tries > 90) { clearInterval(poll); return; }
      if (!root.hasAttribute('data-lc-theme')) return;     // the theme is still being applied
      let info;
      /* a full page load: the server-rendered data already knows whether you
         solved it, so the card can come as soon as the page shows anything */
      const s = P && P.ssr(slug);
      if (s) {
        clearInterval(poll);
        if (s.status === 'ac') return;
        info = { number: s.number, title: s.title, difficulty: s.difficulty ? s.difficulty[0].toUpperCase() + s.difficulty.slice(1) : '' };
      } else {
        /* an in-app navigation: read the page. The solved label can arrive a
           moment after the title (it comes with your account's data), so give
           it ~0.7 s -- by the clock: counting timer ticks let a busy page
           stretch this to seconds */
        info = readTitle(slug);
        if (!info) return;
        if (isSolved(slug)) { clearInterval(poll); return; }
        if (!titleSince) titleSince = performance.now();
        if (performance.now() - titleSince < 700) return;
        clearInterval(poll);
      }
      if (!on() || !activeSettings().titleCard || !UI) return;
      await whenVisible();
      if (ticket !== cardTicket || !on() || isSolved(slug)) return;
      playTitle(info);
    }, 120);
  }

  maybeTitleCard();
  setInterval(() => {
    maybeTitleCard();
    /* load sounds when universal moments or crawler are active */
    if (SFX && on()) {
      const soundTheme = theme() === 'crawler' ? 'crawler' : 'anime';
      SFX.warm(soundTheme);
      primeSound();
    }
  }, 1000);

  /* Preview from Customize tab or popup: play a moment by name on this tab */
  document.addEventListener('lcts:moment', (e) => {
    if (!UI) return;
    const name = String(e.detail || '');
    if (name === 'title') {
      playTitle(readTitle(slugOf() || '') || { number: '1', title: 'Two Sum', difficulty: 'Easy' });
    } else if (name === 'wa-submit') {
      playResult('wa', { action: 'submit' });
    } else if (name === 'run-start') {
      playAction('run');
    } else if (name === 'submit-start') {
      playAction('submit');
    } else if (UI.VERDICTS && UI.VERDICTS[name]) {
      playResult(name, name === 'ac' ? { beats: '92.4', action: 'submit' } : { action: 'run' });
    }
  });
})();
