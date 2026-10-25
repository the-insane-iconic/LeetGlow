/* =============================================================================
   anime.js  (isolated world, LeetCode)

   Publishes the chosen scene: the solved role block, the syntax inks for
   monaco-ink.js, the light/dark mode for content.js, and focus mode.

   Nothing here decodes, resizes or solves. Anime Studio did that when the
   scene was picked; this reads the result.

   STORAGE
     lcAnime     { scene, arcs, arcScenes, glass, visibility, titleCard, moments,
                 themes, theme, themeFor }
                 arcs: a scene per difficulty (arcScenes overrides
                 LCTS_ARC_DEFAULT); themes: the Studio's solve per scene id
                 ('custom' for your own picture); a scene with no saved solve
                 uses the copy pre-solved in scenes.js
     lcAnimeArt  { wall, blur } data URLs, only for your own picture. Read only
                 while the anime theme is actually on, so a big picture costs
                 nothing on a page using another theme.
     lcFocus     true while focus mode is on
============================================================================= */
(() => {
  const SCENES = globalThis.LCTS_SCENES, DEF = globalThis.LCTS_SCENE_DEFAULT;
  const THEME_KEY = 'lcThemeStudio';
  const STYLE_ID = 'lcts-anime-roles';
  const root = document.documentElement;

  let objectUrls = [];
  let published = '';

  function styleEl() {
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || root).appendChild(el);
    }
    return el;
  }

  function presetUrls(id) {
    const s = SCENES[id];
    return { wall: chrome.runtime.getURL(s.wall), blur: chrome.runtime.getURL(s.blur) };
  }

  function publish(theme, urls) {
    globalThis.__lctsAnimeScene = { wall: urls.wall };     // read by src/share.js
    const css = globalThis.LCTSAnimeCss.build(theme, urls);
    if (css !== published) { styleEl().textContent = css; published = css; }
    globalThis.__lctsAnimeInk = theme.ink;
    const modeChanged = globalThis.__lctsAnimeMode !== theme.mode;
    globalThis.__lctsAnimeMode = theme.mode;
    if (globalThis.__lctsInkRefresh) globalThis.__lctsInkRefresh();
    if (modeChanged && globalThis.__lctsReassertMode) globalThis.__lctsReassertMode();
  }

  function publishPreset(id) {
    if (!SCENES[id]) id = DEF;
    publish(SCENES[id].theme, presetUrls(id));
  }

  /* a data URL becomes a short blob: URL, so the stylesheet carries a few
     dozen characters rather than megabytes of base64 through every recalc */
  function toObjectUrl(dataUrl) {
    const comma = dataUrl.indexOf(',');
    const type = (dataUrl.slice(5, comma).split(';')[0]) || 'image/webp';
    const bin = atob(dataUrl.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    objectUrls.push(url);
    return url;
  }
  function releaseObjectUrls(keep) {
    objectUrls = objectUrls.filter((u) => {
      if (keep && keep.indexOf(u) > -1) return true;
      URL.revokeObjectURL(u);
      return false;
    });
  }

  /* if a future page policy ever refuses blob: images, fall back to the
     default scene instead of leaving the panels bare */
  const loads = (url) => new Promise((res) => {
    const im = new Image();
    im.onload = () => res(true);
    im.onerror = () => res(false);
    im.src = url;
  });

  /* the pre-solved default goes in at once, before storage answers, so the
     first paint under the anime theme is never unstyled */
  publishPreset(DEF);

  /* ---- scenes by difficulty ------------------------------------------------
     With arcs on (the default for new users), each difficulty has its own
     scene: LCTS_ARC_DEFAULT in scenes.js, overridable per slot in the Studio.
     Your own picture always wins, for every difficulty. Someone who had
     picked a single scene before arcs existed keeps it (arcs off). */
  const ARC = globalThis.LCTS_ARC_DEFAULT || {};
  const arcsOn = (cfg) => cfg.scene !== 'custom' && (cfg.arcs !== undefined ? !!cfg.arcs : !cfg.scene);
  function sceneFor(cfg, difficulty) {
    if (!arcsOn(cfg)) return SCENES[cfg.scene] ? cfg.scene : DEF;
    const arcs = Object.assign({}, ARC, cfg.arcScenes || {});
    const id = arcs[difficulty || 'medium'] || arcs.medium;
    return SCENES[id] ? id : DEF;
  }
  /* the Studio saves a solve per scene for the user's glass settings */
  const solvedFor = (cfg, id) =>
    (cfg.themes && cfg.themes[id]) || (cfg.theme && cfg.themeFor === id ? cfg.theme : null) || SCENES[id].theme;

  let cfgNow = null, shownId = null;
  function showPreset(cfg) {
    const P = globalThis.LCTSProblem;
    const id = sceneFor(cfg, P ? P.get().difficulty : null);
    if (id === shownId) return;
    shownId = id;
    releaseObjectUrls();
    publish(solvedFor(cfg, id), presetUrls(id));
  }

  let loading = 0;
  function load() {
    const ticket = ++loading;
    chrome.storage.local.get([THEME_KEY, 'lcAnime', 'lcFocus'], async (res) => {
      if (ticket !== loading) return;
      root.toggleAttribute('data-lc-focus', !!res.lcFocus);
      /* nothing saved = a fresh install, which content.js runs as anime (its DEFAULT) */
      if ((res[THEME_KEY] || 'anime') !== 'anime') { cfgNow = null; return; }   // nothing to load for other themes

      const cfg = res.lcAnime || {};
      if (cfg.scene !== 'custom') {
        /* a revisited problem's difficulty is cached, so wait for that cache
           (a few ms) and the right scene is up before the first paint */
        if (globalThis.LCTSProblem) await globalThis.LCTSProblem.ready();
        if (ticket !== loading) return;
        cfgNow = cfg; shownId = null;
        showPreset(cfg);
        return;
      }
      cfgNow = null; shownId = 'custom';
      const customTheme = (cfg.themes && cfg.themes.custom) || cfg.theme;

      chrome.storage.local.get('lcAnimeArt', async (r2) => {
        if (ticket !== loading) return;
        const art = r2.lcAnimeArt;
        if (!art || !art.wall || !art.blur || !customTheme) { publishPreset(DEF); return; }
        try {
          const urls = { wall: toObjectUrl(art.wall), blur: toObjectUrl(art.blur) };
          if (!(await loads(urls.wall))) { releaseObjectUrls(); publishPreset(DEF); return; }
          if (ticket !== loading) return;
          publish(customTheme, urls);
          releaseObjectUrls([urls.wall, urls.blur]);
        } catch (e) {
          publishPreset(DEF);
        }
      });
    });
  }

  /* a problem's difficulty became known, or you moved to another problem */
  if (globalThis.LCTSProblem) {
    globalThis.LCTSProblem.onChange(() => {
      if (cfgNow && root.getAttribute('data-lc-theme') === 'anime') showPreset(cfgNow);
    });
  }

  load();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[THEME_KEY] || changes.lcAnime || changes.lcAnimeArt) { load(); return; }
    if (changes.lcFocus) root.toggleAttribute('data-lc-focus', !!changes.lcFocus.newValue);
  });
})();
