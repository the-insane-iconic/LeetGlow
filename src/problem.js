/* =============================================================================
   problem.js  (isolated world, LeetCode) — which problem is open

     LCTSProblem.get()        { slug, number, title, difficulty } (fields may be
                              null until the page has rendered them)
     LCTSProblem.onChange(fn) fn(problem) whenever the slug changes, and again
                              when its title/difficulty become known
     LCTSProblem.ssr(slug)    { number, title, difficulty, status } from the
                              server-rendered page data, or null

   Difficulty is cached per slug in chrome.storage (lcProblemCache, last 400),
   so a revisit knows it at document_start -- the anime theme uses that to
   pick the right difficulty scene before the first paint.

   COST: a one-second pathname comparison; after a change, a 150 ms poll of
   one querySelector for at most 8 s. No observers.
============================================================================= */
(() => {
  if (globalThis.LCTSProblem) return;

  const KEY = 'lcProblemCache';
  const subs = [];
  let cache = {};
  let cur = { slug: null, number: null, title: null, difficulty: null };
  let cacheReady = false;
  const readyWaiters = [];

  const slugOf = () => { const m = /^\/problems\/([^/]+)/.exec(location.pathname); return m ? m[1] : null; };
  const norm = (d) => { d = String(d || '').trim().toLowerCase(); return /^(easy|medium|hard)$/.test(d) ? d : null; };

  function fire() { subs.forEach((fn) => { try { fn(Object.assign({}, cur)); } catch (e) {} }); }

  /* the title is only trusted once its link points at the current slug:
     after an in-app navigation the previous problem's title lingers briefly */
  function readDom(slug) {
    const t = document.querySelector('.flexlayout__tab .text-title-large');
    if (!t) return null;
    const a = t.querySelector('a[href]');
    if (a && a.getAttribute('href').indexOf('/problems/' + slug) === -1) return null;
    const m = /^\s*(\d+)\.\s+(.+?)\s*$/.exec(t.textContent);
    if (!m) return null;
    const d = document.querySelector('.flexlayout__tab [class*="text-difficulty-"]');
    return { number: m[1], title: m[2], difficulty: d ? norm(d.textContent) : null };
  }

  function remember(slug, info) {
    const prev = cache[slug];
    if (prev && prev.d === info.difficulty && prev.n === info.number && prev.t === info.title) return;
    cache[slug] = { d: info.difficulty, n: info.number, t: info.title };
    const keys = Object.keys(cache);
    if (keys.length > 400) keys.slice(0, keys.length - 400).forEach((k) => delete cache[k]);
    try { chrome.storage.local.set({ [KEY]: cache }); } catch (e) {}
  }

  /* On a full page load, LeetCode's server-rendered data (__NEXT_DATA__) has
     the problem -- number, title, difficulty and YOUR status ('ac' = solved,
     'notac' = attempted, null) -- about 1.2 s in, while the page only draws
     its title into the panel layout at 3-4.5 s and the Solved label later
     still. It is parsed once per document. After an in-app navigation it is
     stale (it still describes the first problem), so a slug that is not in
     it returns null and callers fall back to the DOM. */
  let ssrMap = null;
  function ssr(slug) {
    if (!ssrMap) {
      const el = document.getElementById('__NEXT_DATA__');
      if (!el) return null;                       // not parsed yet: try again later
      /* the HTML streams in, so the element can exist with half its JSON:
         a failed parse is retried until the document has finished loading */
      let data;
      try { data = JSON.parse(el.textContent); } catch (e) {
        if (document.readyState === 'loading') return null;
      }
      ssrMap = {};
      try {
        data.props.pageProps.dehydratedState.queries.forEach((q) => {
          const d = q && q.state && q.state.data && q.state.data.question;
          if (d && d.titleSlug && d.questionFrontendId) {
            ssrMap[d.titleSlug] = { number: String(d.questionFrontendId), title: d.title || d.questionTitle || '',
                                    difficulty: norm(d.difficulty), status: d.status || null };
          }
        });
      } catch (e) {}
    }
    return ssrMap[slug] || null;
  }

  /* the difficulty of the problem you looked at last, so the Anime Studio opens
     on that slot: you came from an Easy problem, you are choosing for Easy */
  let lastSaved = null;
  function rememberLast(d) {
    if (!d || d === lastSaved) return;
    lastSaved = d;
    try { chrome.storage.local.set({ lcLastDifficulty: d }); } catch (e) {}
  }

  let pollTimer = 0;
  function watch(slug) {
    clearInterval(pollTimer);
    let tries = 0;
    pollTimer = setInterval(() => {
      if (slug !== cur.slug || ++tries > 55) { clearInterval(pollTimer); return; }
      const info = readDom(slug) || ssr(slug);
      if (!info) return;
      const changed = info.title !== cur.title || (info.difficulty && info.difficulty !== cur.difficulty);
      Object.assign(cur, { number: info.number, title: info.title, difficulty: info.difficulty || cur.difficulty });
      if (info.difficulty) { clearInterval(pollTimer); remember(slug, cur); rememberLast(cur.difficulty); }
      if (changed) fire();
    }, 150);
  }

  function check() {
    const slug = slugOf();
    if (!slug || slug === cur.slug) return;
    const c = cache[slug] || {};
    cur = { slug, number: c.n || null, title: c.t || null, difficulty: c.d || null };
    fire();
    watch(slug);
  }

  chrome.storage.local.get(KEY, (res) => {
    cache = (res && res[KEY]) || {};
    cacheReady = true;
    check();
    readyWaiters.splice(0).forEach((fn) => fn());
  });
  setInterval(() => { if (cacheReady) check(); }, 1000);

  globalThis.LCTSProblem = {
    get: () => Object.assign({}, cur),
    onChange(fn) { subs.push(fn); },
    /* resolves once the per-slug cache is loaded, so a caller can decide
       before the first paint whether the difficulty is already known */
    ready: () => new Promise((res) => { if (cacheReady) res(); else readyWaiters.push(res); }),
    slugOf,
    /* the server-rendered record for this slug, or null (see above) */
    ssr
  };
})();
