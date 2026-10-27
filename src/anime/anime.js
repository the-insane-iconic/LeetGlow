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
    if (s) {
      return { wall: chrome.runtime.getURL(s.wall), blur: chrome.runtime.getURL(s.blur) };
    }
    if (cfgNow && cfgNow.staticWallpaper && cfgNow.staticWallpaper.imageUrl) {
      return { wall: cfgNow.staticWallpaper.imageUrl, blur: cfgNow.staticWallpaper.imageUrl };
    }
    const def = SCENES[DEF];
    return { wall: chrome.runtime.getURL(def.wall), blur: chrome.runtime.getURL(def.blur) };
  }

  const LIVE_OVERRIDE_CSS = `
html[data-lc-theme="anime"] body::before {
  z-index: -2 !important;
  transition: opacity 0.45s ease-in-out;
}
html.live-ready body::before,
body.live-ready::before {
  opacity: 0 !important;
}
.lc-anime-live-video {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  object-fit: cover !important;
  z-index: -1 !important;
  pointer-events: none !important;
  display: block !important;
  opacity: 0;
  transition: opacity 0.45s ease-in-out;
  background: transparent !important;
}
.lc-anime-live-video.is-ready {
  opacity: 1 !important;
}
html[data-lc-theme="anime"][data-lc-focus] .lc-anime-live-video,
html[data-lc-focus] .lc-anime-live-video {
  display: none !important;
}
`;

  let currentTheme = null, currentUrls = null;
  let cfgNow = null, shownId = null, lastAlpha = null;
  let currentCt = 30, currentEt = 25;
  let currentPalette = 'auto';

  function publish(theme, urls, customAlpha, paletteId) {
    currentTheme = theme;
    if (urls) currentUrls = urls;
    lastAlpha = customAlpha;
    if (paletteId !== undefined && paletteId !== null) currentPalette = paletteId;
    const u = currentUrls || urls;
    globalThis.__lctsAnimeScene = { wall: u ? u.wall : '' };     // read by src/share.js
    let css = globalThis.LCTSAnimeCss.build(theme, u, customAlpha, currentPalette) + LIVE_OVERRIDE_CSS;
    if (css !== published) { styleEl().textContent = css; published = css; }
    globalThis.__lctsAnimeInk = theme.ink;
    const modeChanged = globalThis.__lctsAnimeMode !== theme.mode;
    globalThis.__lctsAnimeMode = theme.mode;
    if (globalThis.__lctsInkRefresh) globalThis.__lctsInkRefresh();
    if (modeChanged && globalThis.__lctsReassertMode) globalThis.__lctsReassertMode();
  }

  function publishPreset(id, customAlpha, paletteId) {
    if (!SCENES[id]) id = DEF;
    publish(SCENES[id].theme, presetUrls(id), customAlpha, paletteId);
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
    if (cfg && cfg.sceneMode === 'live') {
      const liveTheme = (cfg.liveWallpaper && cfg.liveWallpaper.themeId) || (cfg.scene && cfg.scene !== 'neon-rain' ? cfg.scene : null) || 'golden-hour';
      return SCENES[liveTheme] ? liveTheme : DEF;
    }
    if (cfg && cfg.staticWallpaper && cfg.scene === cfg.staticWallpaper.id) {
      return cfg.scene;
    }
    if (!arcsOn(cfg)) return SCENES[cfg.scene] ? cfg.scene : DEF;
    const arcs = Object.assign({}, ARC, cfg.arcScenes || {});
    const id = arcs[difficulty || 'medium'] || arcs.medium;
    return SCENES[id] ? id : DEF;
  }
  /* the Studio saves a solve per scene for the user's glass settings */
  const solvedFor = (cfg, id) =>
    (cfg.themes && cfg.themes[id]) || (cfg.theme && cfg.themeFor === id ? cfg.theme : null) || (SCENES[id] ? SCENES[id].theme : SCENES[DEF].theme);

  function customAlpha(res) {
    const a = {};
    const ct = typeof res.lcContainerTrans === 'number' ? res.lcContainerTrans
      : (res.lcAnime && typeof res.lcAnime.containerTransparency === 'number' ? res.lcAnime.containerTransparency : null);
    const et = typeof res.lcEditorTrans === 'number' ? res.lcEditorTrans
      : (res.lcAnime && typeof res.lcAnime.editorTransparency === 'number' ? res.lcAnime.editorTransparency : null);
    if (ct !== null) { currentCt = ct; a.panel = Math.max(0, Math.min(1, 1 - ct / 100)); }
    if (et !== null) { currentEt = et; a.editor = Math.max(0, Math.min(1, 1 - et / 100)); }
    return Object.keys(a).length ? a : null;
  }

  function showPreset(cfg, alpha) {
    const P = globalThis.LCTSProblem;
    const id = sceneFor(cfg, P ? P.get().difficulty : null);
    shownId = id;
    lastAlpha = alpha;
    releaseObjectUrls();
    publish(solvedFor(cfg, id), presetUrls(id), alpha);
  }

  let liveVideoEl = null;

  function ensureVideoAttached() {
    if (!liveVideoEl) return;
    const target = document.body || root;
    if (liveVideoEl.parentNode !== target) {
      target.prepend(liveVideoEl);
    }
  }

  function updateLiveVideo(url, thumbUrl) {
    if (!url) {
      if (liveVideoEl) {
        liveVideoEl.pause();
        liveVideoEl.removeAttribute('src');
        liveVideoEl.load();
        liveVideoEl.remove();
        liveVideoEl = null;
      }
      root.classList.remove('has-live-wallpaper', 'live-ready');
      if (document.body) document.body.classList.remove('has-live-wallpaper', 'live-ready');
      return;
    }
    if (!liveVideoEl) {
      liveVideoEl = document.createElement('video');
      liveVideoEl.className = 'lc-anime-live-video';
      liveVideoEl.setAttribute('autoplay', '');
      liveVideoEl.setAttribute('loop', '');
      liveVideoEl.setAttribute('muted', '');
      liveVideoEl.setAttribute('playsinline', '');
      liveVideoEl.setAttribute('webkit-playsinline', '');
      liveVideoEl.autoplay = true;
      liveVideoEl.loop = true;
      liveVideoEl.muted = true;
      liveVideoEl.playsInline = true;
      liveVideoEl.defaultMuted = true;
      liveVideoEl.volume = 0;
      liveVideoEl.style.cssText = 'position:fixed !important;top:0 !important;left:0 !important;width:100vw !important;height:100vh !important;object-fit:cover !important;z-index:-1 !important;pointer-events:none !important;display:block !important;opacity:0;transition:opacity 0.45s ease-in-out;background:transparent !important;';

      const markReady = () => {
        if (liveVideoEl && liveVideoEl.dataset.currentUrl) {
          liveVideoEl.classList.add('is-ready');
          liveVideoEl.style.opacity = '1';
          root.classList.add('live-ready');
          if (document.body) document.body.classList.add('live-ready');
        }
      };

      liveVideoEl.addEventListener('playing', markReady);
      liveVideoEl.addEventListener('loadeddata', () => {
        if (liveVideoEl && liveVideoEl.readyState >= 2) markReady();
      });
      liveVideoEl.addEventListener('canplaythrough', markReady);
      liveVideoEl.addEventListener('error', () => {
        liveVideoEl.classList.remove('is-ready');
        liveVideoEl.style.opacity = '0';
        root.classList.remove('live-ready');
        if (document.body) document.body.classList.remove('live-ready');
      });
    }
    if (thumbUrl && !liveVideoEl.poster) {
      liveVideoEl.poster = thumbUrl;
    }
    ensureVideoAttached();
    if (liveVideoEl.dataset.currentUrl !== url) {
      // Transitioning to a new URL: keep static wallpaper visible while buffering
      liveVideoEl.classList.remove('is-ready');
      liveVideoEl.style.opacity = '0';
      root.classList.remove('live-ready');
      if (document.body) document.body.classList.remove('live-ready');

      liveVideoEl.dataset.currentUrl = url;
      liveVideoEl.innerHTML = `
        <source src="${url}" type="video/mp4">
        <source src="${url}" type="video/quicktime">
        <source src="${url}" type="video/webm">
      `;
      liveVideoEl.src = url;
      liveVideoEl.load();

      const playPromise = liveVideoEl.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          // Autoplay policy delayed playback - resume upon user's first click or keypress
          const resume = () => {
            if (liveVideoEl && liveVideoEl.paused) {
              liveVideoEl.play().catch(() => { });
            }
            window.removeEventListener('click', resume);
            window.removeEventListener('keydown', resume);
          };
          window.addEventListener('click', resume, { once: true });
          window.addEventListener('keydown', resume, { once: true });
        });
      }
    }
    root.classList.add('has-live-wallpaper');
    if (document.body) document.body.classList.add('has-live-wallpaper');
  }

  // Ensure live video stays properly prepended inside document.body as the DOM constructs and during SPA transitions
  const spaObserver = new MutationObserver(() => {
    if (root.classList.contains('has-live-wallpaper') && liveVideoEl) {
      ensureVideoAttached();
      if (document.body) {
        if (!document.body.classList.contains('has-live-wallpaper')) {
          document.body.classList.add('has-live-wallpaper');
        }
        if (root.classList.contains('live-ready') && !document.body.classList.contains('live-ready')) {
          document.body.classList.add('live-ready');
        }
      }
    }
  });
  spaObserver.observe(root, { childList: true });
  if (document.body) {
    spaObserver.observe(document.body, { childList: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      ensureVideoAttached();
      if (document.body) spaObserver.observe(document.body, { childList: true });
    });
  }

  let loading = 0;
  function load() {
    const ticket = ++loading;
    chrome.storage.local.get([THEME_KEY, 'lcAnime', 'lcFocus', 'lcContainerTrans', 'lcEditorTrans', 'lcPalette'], async (res) => {
      if (ticket !== loading) return;
      currentPalette = res.lcPalette || 'auto';
      root.toggleAttribute('data-lc-focus', !!res.lcFocus);
      /* nothing saved = a fresh install, which content.js runs as anime (its DEFAULT) */
      if ((res[THEME_KEY] || 'anime') !== 'anime') {
        cfgNow = null;
        updateLiveVideo(null);
        return;
      }

      const alpha = customAlpha(res);
      const cfg = res.lcAnime || {};

      // Check if user has active live wallpaper
      if (cfg.sceneMode === 'live' && cfg.liveWallpaper && cfg.liveWallpaper.videoUrl) {
        let videoUrl = cfg.liveWallpaper.videoUrl;
        // Auto-repair any stale blob: URLs that may have been saved by legacy code
        if (videoUrl.startsWith('blob:')) {
          if (cfg.liveWallpaper.originalUrl) {
            videoUrl = cfg.liveWallpaper.originalUrl;
          } else if (cfg.liveWallpaper.id && cfg.liveWallpaper.id.startsWith('supabase-')) {
            const baseName = cfg.liveWallpaper.id.replace('supabase-', '');
            const sbBase = (globalThis.LEETGLOW_CONFIG && globalThis.LEETGLOW_CONFIG.SUPABASE_URL) || '';
            if (sbBase) {
              videoUrl = `${sbBase}/storage/v1/object/public/livewallpaper/${baseName}.mov`;
            }
          }
        }
        updateLiveVideo(videoUrl, cfg.liveWallpaper.thumbUrl);
      } else {
        updateLiveVideo(null);
      }

      if (cfg.scene !== 'custom') {
        /* a revisited problem's difficulty is cached, so wait for that cache
           (a few ms) and the right scene is up before the first paint */
        if (globalThis.LCTSProblem) await globalThis.LCTSProblem.ready();
        if (ticket !== loading) return;
        cfgNow = cfg;
        showPreset(cfg, alpha);
        return;
      }
      cfgNow = null; shownId = 'custom'; lastAlpha = alpha;
      const customTheme = (cfg.themes && cfg.themes.custom) || cfg.theme;

      chrome.storage.local.get('lcAnimeArt', async (r2) => {
        if (ticket !== loading) return;
        const art = r2.lcAnimeArt;
        if (!art || !art.wall || !art.blur || !customTheme) { publishPreset(DEF, alpha); return; }
        try {
          const urls = { wall: toObjectUrl(art.wall), blur: toObjectUrl(art.blur) };
          if (!(await loads(urls.wall))) { releaseObjectUrls(); publishPreset(DEF, alpha); return; }
          if (ticket !== loading) return;
          publish(customTheme, urls, alpha);
          releaseObjectUrls([urls.wall, urls.blur]);
        } catch (e) {
          publishPreset(DEF, alpha);
        }
      });
    });
  }

  /* a problem's difficulty became known, or you moved to another problem */
  if (globalThis.LCTSProblem) {
    globalThis.LCTSProblem.onChange(() => {
      if (cfgNow && root.getAttribute('data-lc-theme') === 'anime') showPreset(cfgNow, lastAlpha);
    });
  }

  load();
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[THEME_KEY] || changes.lcAnime || changes.lcAnimeArt) {
      if (changes.lcAnime && !changes[THEME_KEY] && !changes.lcAnimeArt) {
        const o = changes.lcAnime.oldValue || {};
        const n = changes.lcAnime.newValue || {};
        const wallChanged = o.scene !== n.scene ||
                            o.sceneMode !== n.sceneMode ||
                            JSON.stringify(o.liveWallpaper) !== JSON.stringify(n.liveWallpaper) ||
                            JSON.stringify(o.staticWallpaper) !== JSON.stringify(n.staticWallpaper) ||
                            JSON.stringify(o.arcScenes) !== JSON.stringify(n.arcScenes) ||
                            o.arcs !== n.arcs ||
                            JSON.stringify(o.themes) !== JSON.stringify(n.themes);
        if (!wallChanged) {
          // Wallpaper did not change - only transparency or settings changed.
          // Smoothly update alpha without reloading scene or resetting live video!
          if (typeof n.containerTransparency === 'number') currentCt = n.containerTransparency;
          if (typeof n.editorTransparency === 'number') currentEt = n.editorTransparency;
          const alpha = {
            panel: Math.max(0, Math.min(1, 1 - currentCt / 100)),
            editor: Math.max(0, Math.min(1, 1 - currentEt / 100))
          };
          lastAlpha = alpha;
          if (currentTheme && currentUrls && root.getAttribute('data-lc-theme') === 'anime') {
            publish(currentTheme, currentUrls, alpha);
          }
          return;
        }
      }
      load();
      return;
    }
    if (changes.lcContainerTrans || changes.lcEditorTrans) {
      if (changes.lcContainerTrans && typeof changes.lcContainerTrans.newValue === 'number') {
        currentCt = changes.lcContainerTrans.newValue;
      }
      if (changes.lcEditorTrans && typeof changes.lcEditorTrans.newValue === 'number') {
        currentEt = changes.lcEditorTrans.newValue;
      }
      const alpha = {
        panel: Math.max(0, Math.min(1, 1 - currentCt / 100)),
        editor: Math.max(0, Math.min(1, 1 - currentEt / 100))
      };
      lastAlpha = alpha;
      if (currentTheme && currentUrls && root.getAttribute('data-lc-theme') === 'anime') {
        publish(currentTheme, currentUrls, alpha, currentPalette);
        return;
      }
      load();
      return;
    }
    if (changes.lcPalette) {
      currentPalette = changes.lcPalette.newValue || 'auto';
      if (currentTheme && currentUrls && root.getAttribute('data-lc-theme') === 'anime') {
        publish(currentTheme, currentUrls, lastAlpha, currentPalette);
        return;
      }
    }
    if (changes.lcFocus) root.toggleAttribute('data-lc-focus', !!changes.lcFocus.newValue);
  });
})();
