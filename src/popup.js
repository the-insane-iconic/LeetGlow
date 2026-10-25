/* Popup: render four theme cards with live mini-editor previews, persist the
   choice to storage (the content script applies it live to open LeetCode tabs). */

const KEY = 'lcThemeStudio';
const DEFAULT = 'anime';

/* Per-theme preview palette (mirrors the real editor colors). */
const THEMES = {
  paper: {
    name: 'Vintage Paper', desc: 'kraft paper, iron-gall ink', accent: '#6d190e',
    pv: {
      bg: '#ad9362', text: '#241d14', line: '#483c25', kw: '#650500',
      fn: '#00208a', num: '#00343f', var: '#1a2d5a', com: '#332e25', pn: '#3a2d1d'
    },
    tex: 'grain'
  },
  sakura: {
    name: 'Sakura Night', desc: 'petal pink on plum indigo', accent: '#ff7eb6',
    pv: {
      bg: '#211d3c', text: '#ece9ff', line: '#4a3f80', kw: '#ff7eb6',
      fn: '#6ee7f0', num: '#b98cff', var: '#ece9ff', com: '#6b6395', pn: '#ff9ec8'
    },
    tex: 'stars'
  },
  grid: {
    name: 'Grid', desc: 'drafting table, hard edges', accent: '#35e0a1',
    pv: {
      bg: '#141c28', text: '#d7e0ec', line: '#3a4a5f', kw: '#58a6ff',
      fn: '#35e0a1', num: '#ffa657', var: '#d7e0ec', com: '#56687f', pn: '#79c0ff'
    },
    tex: 'grid'
  },
  bloom: {
    name: 'Orchid', desc: 'silk velvet, rose-gold trim', accent: '#e3a88f',
    pv: {
      bg: '#221730', text: '#f4ecf7', line: '#5b4272', kw: '#ff9ec9',
      fn: '#7fe3c0', num: '#d89bff', var: '#f4ecf7', com: '#9b86a9', pn: '#e3a88f'
    },
    tex: 'nap'
  },
  crawler: {
    name: 'Web Crawler', desc: 'charcoal web, crimson thread', accent: '#e0223f',
    pv: {
      bg: '#17171c', text: '#eceaf2', line: '#38384a', kw: '#4db2ff',
      fn: '#4ce0b3', num: '#c792ea', var: '#eceaf2', com: '#6e6e7a', pn: '#ff8aa8'
    },
    tex: 'crawler'
  },
  /* Anime Studio's card takes its colours from the default scene's solve
     (scenes.js); paintAnimeCard() swaps in the scene you actually picked */
  anime: (() => {
    const scenes = globalThis.LCTS_SCENES || {};
    const t = (scenes[globalThis.LCTS_SCENE_DEFAULT] || {}).theme;
    const ink = t ? t.ink : {};
    return {
      name: 'Anime Studio', desc: 'your scene, episode moments',
      accent: t ? t.roles['--lc-accent'] : '#f98dc1',
      pv: t ? {
        bg: t.scrim, text: ink.variable, line: t.roles['--lc-text3'], kw: ink.keyword,
        fn: ink.func, num: ink.number, var: ink.param, com: ink.comment, pn: ink.operator
      }
        : { bg: '#150b21', text: '#f3f0f7', line: '#9b8dad', kw: '#f98dc1', fn: '#cb9cfa', num: '#f5993d', var: '#d7c6e9', com: '#9b8dad', pn: '#dab9c9' },
      tex: 'anime'
    };
  })(),
  /* WIP (see CLAUDE_ANKIT.md): only the Easy tier ("The First Realm") has
     art, so the card previews that. Medium/Hard get a plain dark fallback
     on the real page until their own art exists. */
  game: {
    name: 'Adventure', desc: 'RPG night realm, quests and loot', accent: '#7dd3fc',
    /* the theme's own dark inks (INK.game in monaco-ink.js) */
    pv: {
      bg: '#0b1a2e', text: '#eef2ea', line: '#6b86a6', kw: '#d4af6a',
      fn: '#8fb8e0', num: '#7fc9c0', var: '#eef2ea', com: '#8aa0b8', pn: '#d7c9a0'
    },
    tex: 'game'
  },
  /* Pixel Art: its own inks (INK.pixel), and the squad stands in the corner */
  pixel: {
    name: 'Pixel Art', desc: '8-bit, Accepted = boom', accent: '#ffcd75',
    pv: {
      bg: '#262b44', text: '#f4f4f4', line: '#566c86', kw: '#ffcd75',
      fn: '#73eff7', num: '#c9a0ff', var: '#c5d3e0', com: '#8b9bb4', pn: '#ffa36b'
    },
    tex: 'pixel'
  },
  off: {
    name: 'Off', desc: 'hand the page back to LeetCode', accent: '#8a8f98',
    pv: {
      bg: '#1a1a1a', text: '#eff1f6', line: '#5c6370', kw: '#c678dd',
      fn: '#61afef', num: '#d19a66', var: '#eff1f6', com: '#7f848e', pn: '#abb2bf'
    },
    tex: 'none'
  }
};
const ORDER = ['anime', 'sakura', 'grid', 'bloom', 'game', 'crawler', 'pixel', 'paper', 'off'];
/* the Open Anime Studio button lives directly under the Anime card, so it
   reads as belonging to that theme; render() re-seats it after each redraw */
const studioButton = document.getElementById('studio');

/* Preview snippet, tokenized by hand so it shows off each palette.
   Each line: [lineNo, [ {t:'kw'|'fn'|..., s:'text'} | 'plain string' ]]  */
const SNIPPET = [
  [1, [k('def'), ' ', f('dfs'), pn('('), v('node'), pn('):')]],
  [2, ['    ', k('if'), ' ', k('not'), ' ', v('node'), pn(':'), '  ', c('# base case')]],
  [3, ['        ', k('return'), ' ', n('0')]],
  [4, ['    ', k('return'), ' ', n('1'), ' + ', f('dfs'), pn('('), v('node'), pn('.'), v('next'), pn(')')]]
];
function k(s) { return { t: 'kw', s }; } function f(s) { return { t: 'fn', s }; }
function n(s) { return { t: 'num', s }; } function v(s) { return { t: 'var', s }; }
function c(s) { return { t: 'com', s }; } function pn(s) { return { t: 'pn', s }; }

function esc(str) { return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function previewHTML() {
  return SNIPPET.map(([no, parts]) => {
    const code = parts.map(p =>
      typeof p === 'string' ? esc(p)
        : `<span class="tok-${p.t}">${esc(p.s)}</span>`
    ).join('');
    return `<div class="row"><span class="ln">${no}</span><span class="code">${code}</span></div>`;
  }).join('');
}

const CHECK = '<svg viewBox="0 0 12 12" fill="none"><path d="M2.5 6.2 5 8.7 9.6 3.5" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function pvVars(pv) {
  return `--pv-bg:${pv.bg};--pv-text:${pv.text};--pv-line:${pv.line};`
    + `--pv-kw:${pv.kw};--pv-fn:${pv.fn};--pv-num:${pv.num};`
    + `--pv-var:${pv.var};--pv-com:${pv.com};--pv-pn:${pv.pn};`;
}

/* Wallpaper Drawer in Sidepanel (2*n Grid) */
const wallpaperDrawer = document.createElement('div');
wallpaperDrawer.id = 'wallpaperDrawer';
wallpaperDrawer.className = 'wallpaper-drawer';
wallpaperDrawer.innerHTML = '<div id="wallpaperGrid" class="wallpaper-grid"></div>';

let wallpapersDrawerOpen = false;

function toggleWallpaperDrawer(force) {
  const grid = document.getElementById('grid');
  if (!grid) return;
  wallpapersDrawerOpen = typeof force === 'boolean' ? force : !wallpapersDrawerOpen;
  grid.classList.toggle('wallpapers-expanded', wallpapersDrawerOpen);
  if (wallpapersDrawerOpen) {
    renderWallpaperGrid();
  }
}

async function renderWallpaperGrid() {
  const box = document.getElementById('wallpaperGrid');
  if (!box) return;

  let isPrem = false;
  try {
    const pData = await chrome.storage.local.get('leetglowPremium');
    isPrem = !!(pData.leetglowPremium && pData.leetglowPremium.active === true);
  } catch (e) { }

  const res = await chrome.storage.local.get(['lcAnime', 'lcAnimeArt']);
  const cfg = res.lcAnime || {};
  const isLive = cfg.sceneMode === 'live' && cfg.liveWallpaper;
  const activeId = isLive ? cfg.liveWallpaper.id : (cfg.scene || globalThis.LCTS_SCENE_DEFAULT);

  box.innerHTML = '';
  const items = [];

  // 1. User's uploaded custom picture (if exists)
  if (res.lcAnimeArt && (res.lcAnimeArt.wall || res.lcAnimeArt.blur)) {
    items.push({
      id: 'custom',
      name: res.lcAnimeArt.name || 'Your picture',
      thumb: res.lcAnimeArt.blur || res.lcAnimeArt.wall,
      isCustom: true,
      isPro: true
    });
  }

  // 2. User's uploaded live wallpapers from Supabase
  if (globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.getAll) {
    try {
      const liveList = await globalThis.LCTSLiveWallpapers.getAll();
      liveList.forEach(w => {
        items.push({
          id: w.id,
          name: w.name,
          thumb: w.thumbUrl || (w.thumb ? chrome.runtime.getURL(w.thumb) : ''),
          isLive: true,
          liveData: w,
          isPro: false
        });
      });
    } catch (e) {
      console.warn('[LeetGlow] Could not fetch live wallpapers for drawer:', e);
    }
  }

  // 3. Preset scenes from globalThis.LCTS_SCENES
  const scenes = globalThis.LCTS_SCENES || {};
  Object.entries(scenes).forEach(([sceneId, s]) => {
    items.push({
      id: sceneId,
      name: s.name,
      thumb: chrome.runtime.getURL(s.thumb || s.wall),
      isPro: sceneId !== 'golden-hour'
    });
  });

  items.forEach(item => {
    const isLocked = !isPrem && item.isPro;
    const isActive = (item.id === activeId);

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wp-card' + (isLocked ? ' is-locked' : '');
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(isActive));
    b.dataset.wpId = item.id;
    if (item.thumb) {
      b.style.backgroundImage = `url("${item.thumb}")`;
    }

    if (!item.thumb && item.isLive && globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.getThumbnail) {
      globalThis.LCTSLiveWallpapers.getThumbnail(item.liveData).then(tUrl => {
        if (tUrl) b.style.backgroundImage = `url("${tUrl}")`;
      }).catch(() => { });
    }

    let badgeHTML = '';
    if (item.isLive) {
      badgeHTML = '<span class="wp-live-badge"><span class="wp-live-dot"></span> LIVE</span><span class="wp-spinner" aria-hidden="true"></span>';
    } else if (isLocked) {
      badgeHTML = '<span class="wp-pro-badge">PRO</span>';
    }

    b.innerHTML = `
      ${badgeHTML}
      <span class="wp-check">${CHECK}</span>
      <span class="wp-name">${item.name}</span>
    `;

    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (item.isLive) b.classList.add('is-loading');
      try {
        await selectWallpaper(item, isLocked);
        if (item.isLive && item.liveData && item.liveData.videoUrl && globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.downloadAndCache) {
          globalThis.LCTSLiveWallpapers.downloadAndCache(item.liveData.videoUrl).catch(() => { });
        }
      } finally {
        b.classList.remove('is-loading');
      }
    });

    box.appendChild(b);
  });
}

async function selectWallpaper(item, isLocked) {
  if (isLocked) {
    const purchaseModal = document.getElementById('purchaseModal');
    if (purchaseModal) purchaseModal.showModal();
    return;
  }

  const res = await chrome.storage.local.get(['lcAnime']);
  const cfg = res.lcAnime || {};

  if (item.isLive) {
    cfg.sceneMode = 'live';
    cfg.liveWallpaper = item.liveData;
    const themeId = (item.liveData && item.liveData.themeId) || 'neon-rain';
    cfg.scene = themeId;
    if (cfg.arcs) {
      cfg.arcScenes = Object.assign({}, cfg.arcScenes || {}, {
        easy: themeId,
        medium: themeId,
        hard: themeId
      });
    }
  } else if (item.isCustom) {
    cfg.sceneMode = 'static';
    cfg.scene = 'custom';
  } else {
    cfg.sceneMode = 'static';
    cfg.scene = item.id;
    if (cfg.arcs) {
      cfg.arcScenes = Object.assign({}, cfg.arcScenes || {}, {
        easy: item.id,
        medium: item.id,
        hard: item.id
      });
    }
  }

  await chrome.storage.local.set({
    lcAnime: cfg,
    [KEY]: 'anime'
  });

  markSelected('anime');
  if (studioButton) studioButton.classList.add('lit');

  const animeCard = document.querySelector('.card[data-id="anime"]');
  if (animeCard) {
    paintAnimeCard(animeCard.querySelector('.preview'));
  }

  document.querySelectorAll('.wp-card').forEach(c => {
    c.setAttribute('aria-checked', String(c.dataset.wpId === item.id));
  });

  const status = document.getElementById('status');
  if (status) {
    status.textContent = `Applied "${item.name}" wallpaper to your open problem tabs.`;
  }
}

function render(selected) {
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  const preview = previewHTML();
  ORDER.forEach((id) => {
    const t = THEMES[id];
    const card = document.createElement('button');
    card.className = 'card';
    card.type = 'button';
    card.setAttribute('role', 'radio');
    card.setAttribute('aria-checked', String(id === selected));
    card.setAttribute('aria-label', `${t.name} theme`);
    card.dataset.id = id;
    card.style.setProperty('--card-accent', t.accent);
    card.innerHTML =
      `<div class="preview tex-${t.tex}" style="${pvVars(t.pv)}">${preview}</div>` +
      `<div class="meta">` +
      `<span class="name">${t.name}</span>` +
      `<span class="desc">${t.desc}</span>` +
      `<span class="spacer"></span>` +
      `<span class="check">${CHECK}</span>` +
      `</div>`;
    card.addEventListener('click', () => {
      if (id === 'anime') {
        choose(id);
        toggleWallpaperDrawer();
      } else {
        toggleWallpaperDrawer(false);
        choose(id);
      }
    });
    grid.appendChild(card);
    if (id === 'anime') {
      paintAnimeCard(card.querySelector('.preview'));
      const ribbon = document.createElement('div');
      ribbon.className = 'corner-ribbon-wrap';
      ribbon.setAttribute('aria-hidden', 'true');
      ribbon.innerHTML = '<span class="corner-ribbon">Premium</span>';
      card.appendChild(ribbon);

      const meta = card.querySelector('.meta');
      if (meta) {
        const toggleBadge = document.createElement('span');
        toggleBadge.className = 'drawer-toggle-badge';
        toggleBadge.setAttribute('aria-label', 'Toggle wallpapers');
        toggleBadge.innerHTML = `<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6l4 4 4-4"/></svg>`;
        const check = meta.querySelector('.check');
        if (check) meta.insertBefore(toggleBadge, check);
        else meta.appendChild(toggleBadge);
      }

      grid.appendChild(studioButton);
      grid.appendChild(wallpaperDrawer);
    }
    if (id === 'game') {
      /* a baked card: the night realm with an RPG HUD (scripts/build-game-card.py) */
      const url = chrome.runtime.getURL('textures/game/card.webp');
      card.querySelector('.preview').style.setProperty('--pv-scene', `url("${url}")`);
    }
    if (id === 'pixel') paintPixelCard(card.querySelector('.preview'));
  });
  setAccent(selected);
}

/* Pixel Art's card: the gunner from src/pixel/sprites.js, mid-shot */
function paintPixelCard(preview) {
  const SP = globalThis.LCTSPixelSprites;
  if (!SP) return;
  const cv = document.createElement('canvas');
  cv.width = 58; cv.height = 17;
  const c = cv.getContext('2d');
  const hero = SP.outlined('hero-a', 'rgba(244,244,244,.8)'), gun = SP.outlined('gun', 'rgba(244,244,244,.8)');
  c.drawImage(hero, 30, -2);
  c.save(); c.translate(30 + 1 + SP.SHOULDER.x, -2 + 1 + SP.SHOULDER.y); c.rotate(-0.35);
  c.drawImage(gun, -SP.GUN_GRIP.x - 1, -SP.GUN_GRIP.y - 1); c.restore();
  /* a blast where it is aiming */
  [['#fff2c2', 55, 3, 2], ['#ffcd75', 53, 2, 3], ['#ef7d57', 51, 4, 2], ['#ef7d57', 56, 6, 1], ['#b13e53', 52, 7, 2]]
    .forEach(([col, x, y, s]) => { c.fillStyle = col; c.fillRect(x, y, s, s); });
  preview.style.setProperty('--pv-scene', `url("${cv.toDataURL()}")`);
}

/* The Anime card shows the scenes you actually picked: with a scene per
   difficulty, the three of them side by side (Easy | Medium | Hard); with one
   scene, that scene; with your own picture, its small blurred copy. */
function paintAnimeCard(preview) {
  chrome.storage.local.get(['lcAnime', 'lcAnimeArt'], (res) => {
    const cfg = res.lcAnime || {};
    document.querySelectorAll('.studio-jp').forEach((e) => { e.hidden = cfg.japanese === false; });
    const scenes = globalThis.LCTS_SCENES || {}, DEF = globalThis.LCTS_SCENE_DEFAULT;
    const ARC = globalThis.LCTS_ARC_DEFAULT || {};
    const thumb = (id) => { const s = scenes[id] || scenes[DEF]; return s ? chrome.runtime.getURL(s.thumb || s.wall) : null; };
    const custom = cfg.scene === 'custom' && res.lcAnimeArt;
    const arcs = !custom && (cfg.arcs !== undefined ? !!cfg.arcs : !cfg.scene);

    let urls, inkFrom;
    const isLive = cfg.sceneMode === 'live' && cfg.liveWallpaper;
    if (isLive) {
      const liveThumb = cfg.liveWallpaper.thumbUrl || (cfg.liveWallpaper.thumb ? chrome.runtime.getURL(cfg.liveWallpaper.thumb) : thumb(cfg.scene));
      urls = [liveThumb];
      inkFrom = cfg.liveWallpaper.themeId || cfg.scene || DEF;
    } else if (custom) { urls = [res.lcAnimeArt.blur]; inkFrom = 'custom'; }
    else if (arcs) {
      const pick = (d) => (scenes[(cfg.arcScenes || {})[d]] ? cfg.arcScenes[d] : ARC[d]);
      const ids = ['easy', 'medium', 'hard'].map(pick);
      urls = ids.map(thumb); inkFrom = ids[1];
    } else { urls = [thumb(cfg.scene)]; inkFrom = scenes[cfg.scene] ? cfg.scene : DEF; }

    const t = (cfg.themes && cfg.themes[inkFrom]) || (inkFrom !== 'custom' && scenes[inkFrom] && scenes[inkFrom].theme) || cfg.theme;
    if (t && t.ink) {
      const ink = t.ink;
      preview.setAttribute('style', preview.getAttribute('style') + pvVars({
        bg: t.scrim, text: ink.variable, line: t.roles['--lc-text3'], kw: ink.keyword, fn: ink.func,
        num: ink.number, var: ink.param, com: ink.comment, pn: ink.operator
      }));
    }
    const scrim = 'linear-gradient(color-mix(in srgb, var(--pv-bg) 58%, transparent), color-mix(in srgb, var(--pv-bg) 58%, transparent))';
    if (urls.length === 3) {
      /* three slices with a hairline between them */
      const line = 'linear-gradient(90deg, transparent calc(33.33% - 1px), rgba(255,255,255,.35) calc(33.33% - 1px) 33.33%, transparent 33.33% calc(66.66% - 1px), rgba(255,255,255,.35) calc(66.66% - 1px) 66.66%, transparent 66.66%)';
      preview.style.backgroundImage = [scrim, line].concat(urls.map((u) => `url("${u}")`)).join(',');
      preview.style.backgroundSize = 'auto, auto, 33.4% 100%, 33.4% 100%, 33.4% 100%';
      preview.style.backgroundPosition = '0 0, 0 0, 0 0, 50% 0, 100% 0';
      preview.style.backgroundRepeat = 'no-repeat';
    } else {
      preview.style.backgroundImage = '';
      preview.style.backgroundSize = '';
      preview.style.backgroundPosition = '';
      preview.style.backgroundRepeat = '';
      if (urls[0]) {
        preview.style.setProperty('--pv-scene', `url("${urls[0]}")`);
      }
    }

    if (isLive && (!cfg.liveWallpaper.thumbUrl && !urls[0]) && globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.getThumbnail) {
      globalThis.LCTSLiveWallpapers.getThumbnail(cfg.liveWallpaper).then(tUrl => {
        if (tUrl) {
          preview.style.backgroundImage = '';
          preview.style.setProperty('--pv-scene', `url("${tUrl}")`);
        }
      }).catch(() => { });
    }
  });
}

function setAccent(id) {
  document.documentElement.style.setProperty('--pop-accent', THEMES[id].accent);
}

function markSelected(id) {
  document.querySelectorAll('.card').forEach((c) =>
    c.setAttribute('aria-checked', String(c.dataset.id === id)));
  setAccent(id);
}

function choose(id) {
  markSelected(id);
  chrome.storage.local.set({ [KEY]: id });
  /* content.js hears the storage change and applies it live in every open
     problem tab, so there is nothing to refresh */
  if (studioButton) studioButton.classList.toggle('lit', id === 'anime');
  const status = document.getElementById('status');
  status.textContent = id === 'off'
    ? 'Theme off. LeetCode is back to its own look.'
    : `${THEMES[id].name} applied to your open problem tabs.`;
}

/* Stamp the running version into the footer. If this does not match the
   version of the folder you loaded, Chrome is still serving a cached copy of
   the extension and needs the reload button on chrome://extensions. */
try {
  const v = chrome.runtime.getManifest().version;
  const el = document.getElementById('ver');
  if (el) el.textContent = 'v' + v;
} catch (e) { }

/* boot */
chrome.storage.local.get(KEY, (res) => {
  const selected = (res && res[KEY]) || DEFAULT;
  render(selected);
  if (studioButton) studioButton.classList.toggle('lit', selected === 'anime');
});

if (studioButton) {
  studioButton.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/studio.html') });
  });
}

/* keyboard: arrow keys move between radio cards and select, as a radio group does */
document.addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const cards = [...document.querySelectorAll('.card')];
  const idx = cards.findIndex((c) => c === document.activeElement);
  if (idx === -1) return;
  e.preventDefault();
  const dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
  const next = cards[(idx + dir + cards.length) % cards.length];
  next.focus();
  choose(next.dataset.id);
});

/* Tab navigation: Themes / Customize / My Space */
const tabButtons = [
  { btn: document.getElementById('tab-themes'), view: document.getElementById('view-themes') },
  { btn: document.getElementById('tab-customize'), view: document.getElementById('view-customize') },
  { btn: document.getElementById('tab-myspace'), view: document.getElementById('view-myspace') }
];

function switchTab(targetId) {
  tabButtons.forEach(({ btn, view }) => {
    if (!btn || !view) return;
    const isActive = btn.id === targetId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
    if (isActive) {
      view.removeAttribute('hidden');
      view.classList.add('active');
    } else {
      view.setAttribute('hidden', '');
      view.classList.remove('active');
    }
  });
}

tabButtons.forEach(({ btn }) => {
  if (!btn) return;
  btn.addEventListener('click', () => switchTab(btn.id));
});

/* Customize sliders: Container Transparency, Editor Transparency, Volume */
const containerTransSlider = document.getElementById('containerTransSlider');
const containerTransVal = document.getElementById('containerTransVal');
const editorTransSlider = document.getElementById('editorTransSlider');
const editorTransVal = document.getElementById('editorTransVal');
const volumeSlider = document.getElementById('volumeSlider');
const volumeVal = document.getElementById('volumeVal');
const testSoundBtn = document.getElementById('testSoundBtn');

chrome.storage.local.get(['lcContainerTrans', 'lcEditorTrans', 'lcVolume', 'lcAnime', 'lcGameVolume'], (res) => {
  const cfg = res.lcAnime || {};

  // Container Transparency (default 30%)
  const cVal = typeof res.lcContainerTrans === 'number' ? res.lcContainerTrans
    : (typeof cfg.containerTransparency === 'number' ? cfg.containerTransparency : 30);
  if (containerTransSlider && containerTransVal) {
    containerTransSlider.value = cVal;
    containerTransVal.textContent = cVal + '%';
  }

  // Editor Transparency (default 25%)
  const eVal = typeof res.lcEditorTrans === 'number' ? res.lcEditorTrans
    : (typeof cfg.editorTransparency === 'number' ? cfg.editorTransparency : 25);
  if (editorTransSlider && editorTransVal) {
    editorTransSlider.value = eVal;
    editorTransVal.textContent = eVal + '%';
  }

  // Volume (default 80%)
  const vVal = typeof res.lcVolume === 'number' ? res.lcVolume
    : (typeof cfg.volume === 'number' ? Math.round(cfg.volume * 100)
      : (typeof res.lcGameVolume === 'number' ? Math.round(res.lcGameVolume * 100) : 80));
  if (volumeSlider && volumeVal) {
    volumeSlider.value = vVal;
    volumeVal.textContent = vVal + '%';
  }
});

if (containerTransSlider) {
  containerTransSlider.addEventListener('input', () => {
    const val = Number(containerTransSlider.value);
    if (containerTransVal) containerTransVal.textContent = val + '%';
    chrome.storage.local.get(['lcAnime'], (r) => {
      const cfg = r.lcAnime || {};
      cfg.containerTransparency = val;
      chrome.storage.local.set({ lcContainerTrans: val, lcAnime: cfg });
    });
  });
}

if (editorTransSlider) {
  editorTransSlider.addEventListener('input', () => {
    const val = Number(editorTransSlider.value);
    if (editorTransVal) editorTransVal.textContent = val + '%';
    chrome.storage.local.get(['lcAnime'], (r) => {
      const cfg = r.lcAnime || {};
      cfg.editorTransparency = val;
      chrome.storage.local.set({ lcEditorTrans: val, lcAnime: cfg });
    });
  });
}

if (volumeSlider) {
  volumeSlider.addEventListener('input', () => {
    const val = Number(volumeSlider.value);
    if (volumeVal) volumeVal.textContent = val + '%';
    const norm = val / 100;
    chrome.storage.local.get(['lcAnime', 'lcPixel'], (r) => {
      const cfg = r.lcAnime || {};
      cfg.volume = norm;
      const pix = r.lcPixel || {};
      pix.volume = norm;
      chrome.storage.local.set({
        lcVolume: val,
        lcGameVolume: norm,
        lcAnime: cfg,
        lcPixel: pix
      });
    });
  });
}

if (testSoundBtn) {
  testSoundBtn.addEventListener('click', () => {
    const vol = Number(volumeSlider ? volumeSlider.value : 80) / 100;
    try {
      const audio = new Audio(chrome.runtime.getURL('sounds/game/checkpoint.mp3'));
      audio.volume = Math.max(0, Math.min(1, vol));
      audio.play().catch(() => { });
    } catch (e) { }
  });
}

/* Focus mode toggle in Customize tab */
const focusSwitch = document.getElementById('focusSwitch');
if (focusSwitch) {
  chrome.storage.local.get(['lcFocus'], (res) => {
    focusSwitch.checked = !!res.lcFocus;
  });
  focusSwitch.addEventListener('change', () => {
    chrome.storage.local.set({ lcFocus: focusSwitch.checked });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lcFocus) {
      focusSwitch.checked = !!changes.lcFocus.newValue;
    }
  });
}

/* Reset Customize sliders to original configuration */
const resetCustomizeBtn = document.getElementById('resetCustomizeBtn');
const resetStatusText = document.getElementById('resetStatusText');

if (resetCustomizeBtn) {
  resetCustomizeBtn.addEventListener('click', () => {
    const DEFAULT_CONTAINER = 30;
    const DEFAULT_EDITOR = 25;
    const DEFAULT_VOLUME = 80;
    const DEFAULT_VOLUME_NORM = 0.8;

    if (containerTransSlider) containerTransSlider.value = DEFAULT_CONTAINER;
    if (containerTransVal) containerTransVal.textContent = DEFAULT_CONTAINER + '%';

    if (editorTransSlider) editorTransSlider.value = DEFAULT_EDITOR;
    if (editorTransVal) editorTransVal.textContent = DEFAULT_EDITOR + '%';

    if (volumeSlider) volumeSlider.value = DEFAULT_VOLUME;
    if (volumeVal) volumeVal.textContent = DEFAULT_VOLUME + '%';

    if (focusSwitch) focusSwitch.checked = false;

    chrome.storage.local.get(['lcAnime', 'lcPixel'], (r) => {
      const cfg = r.lcAnime || {};
      cfg.containerTransparency = DEFAULT_CONTAINER;
      cfg.editorTransparency = DEFAULT_EDITOR;
      cfg.volume = DEFAULT_VOLUME_NORM;

      const pix = r.lcPixel || {};
      pix.volume = DEFAULT_VOLUME_NORM;

      chrome.storage.local.set({
        lcContainerTrans: DEFAULT_CONTAINER,
        lcEditorTrans: DEFAULT_EDITOR,
        lcVolume: DEFAULT_VOLUME,
        lcGameVolume: DEFAULT_VOLUME_NORM,
        lcFocus: false,
        lcAnime: cfg,
        lcPixel: pix
      }, () => {
        if (resetStatusText) {
          resetStatusText.hidden = false;
          setTimeout(() => { resetStatusText.hidden = true; }, 2200);
        }
      });
    });
  });
}

/* Quick studio jump buttons in Customize and My Space */
['openStudioTuner', 'openStudioArcs'].forEach((id) => {
  const el = document.getElementById(id);
  if (el) {
    el.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/studio.html') });
    });
  }
});

/* =============================================================================
   My Space: Custom Wallpapers Gallery, Upload & Premium Gating
   ============================================================================= */
(function initMySpace() {
  const badge = document.getElementById('myspacePremBadge');
  const dropzone = document.getElementById('customUploadDropzone');
  const fileInput = document.getElementById('customUploadInput');
  const dropzoneContent = document.getElementById('dropzoneContent');
  const statusText = document.getElementById('uploadStatusText');
  const galleryList = document.getElementById('customGalleryList');
  const galleryCount = document.getElementById('customGalleryCount');
  const upgradeModal = document.getElementById('popupUpgradeModal');
  const closeUpgradeModal = document.getElementById('closePopupUpgradeModal');
  const modalUpgradeBtn = document.getElementById('modalUpgradeBtn');
  const modalActivateKeyBtn = document.getElementById('modalActivateKeyBtn');

  if (!dropzone || !galleryList) return;

  let isPremium = false;

  async function checkPremium() {
    try {
      const data = await chrome.storage.local.get('leetglowPremium');
      isPremium = !!(data.leetglowPremium && data.leetglowPremium.active === true);
    } catch (e) {
      isPremium = false;
    }
    updatePremiumUI();
  }

  function updatePremiumUI() {
    if (badge) {
      if (isPremium) {
        badge.innerHTML = '<span class="badge-dot"></span><span>Premium Active</span>';
        badge.className = 'prem-tier-badge pro';
      } else {
        badge.innerHTML = '<span>Free Plan</span>';
        badge.className = 'prem-tier-badge free';
      }
    }

    if (dropzone) {
      if (isPremium) {
        dropzone.classList.remove('locked');
        dropzoneContent.innerHTML = `
          <div class="dropzone-active-body">
            <div class="dropzone-icon-box active">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <div class="dropzone-text">
              <span class="dropzone-title">Upload Custom Wallpaper</span>
              <span class="dropzone-sub">Click or drop any 4K illustration (PNG, JPG, WebP)</span>
            </div>
          </div>
        `;
      } else {
        dropzone.classList.add('locked');
        dropzoneContent.innerHTML = `
          <div class="dropzone-locked-body">
            <div class="dropzone-icon-box locked">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div class="dropzone-text">
              <span class="dropzone-title">Custom Wallpaper Uploads</span>
              <span class="dropzone-sub">Transform your problem workspace with your own artwork</span>
            </div>
            <button id="btnUnlockPremDropzone" class="btn-unlock-prem" type="button">
              <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
                <path d="M8 1.5l1.8 3.6 4 .6-2.9 2.8.7 4L8 10.6l-3.6 1.9.7-4L2.2 5.7l4-.6L8 1.5z"/>
              </svg>
              <span>Unlock Custom Art · ₹29</span>
            </button>
          </div>
        `;
        const unlockBtn = document.getElementById('btnUnlockPremDropzone');
        if (unlockBtn) {
          unlockBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openUpgrade();
          });
        }
      }
    }
  }

  function openUpgrade() {
    if (upgradeModal && typeof upgradeModal.showModal === 'function') {
      upgradeModal.showModal();
    } else {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/studio.html#upgrade') });
    }
  }

  function showStatus(text, isError = false, isBusy = false) {
    if (!statusText) return;
    statusText.hidden = false;
    statusText.textContent = text;
    statusText.className = 'upload-status-text' + (isError ? ' error' : isBusy ? ' busy' : ' success');
    if (!isBusy) {
      setTimeout(() => { statusText.hidden = true; }, 4000);
    }
  }

  /* Render Gallery */
  function renderGallery() {
    chrome.storage.local.get(['lcCustomGallery', 'lcAnimeArt', 'lcAnime'], (res) => {
      let gallery = res.lcCustomGallery || [];
      const currentArt = res.lcAnimeArt;
      const cfg = res.lcAnime || {};
      const isCustomActive = cfg.scene === 'custom';

      // Backfill legacy custom image if gallery was never initialized
      if (gallery.length === 0 && currentArt && currentArt.wall) {
        gallery = [{
          id: 'cg_' + Date.now(),
          name: currentArt.name || 'Custom Wallpaper',
          wall: currentArt.wall,
          thumb: currentArt.blur || currentArt.wall,
          blur: currentArt.blur || currentArt.wall,
          uploadedAt: Date.now()
        }];
        chrome.storage.local.set({ lcCustomGallery: gallery });
      }

      if (galleryCount) galleryCount.textContent = gallery.length;

      if (gallery.length === 0) {
        galleryList.innerHTML = `
          <div class="custom-gallery-empty">
            <div class="empty-icon-wrap">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <circle cx="8.5" cy="8.5" r="1.5"/>
                <path d="M21 15l-5-5L5 21"/>
              </svg>
            </div>
            <div class="empty-title">No Custom Wallpapers</div>
            <div class="empty-sub">Upload your favorite artwork to skin your LeetCode problem workspace.</div>
          </div>
        `;
        return;
      }

      galleryList.innerHTML = gallery.map((item) => {
        const isActive = isCustomActive && currentArt && (currentArt.name === item.name || currentArt.wall === item.wall);
        return `
          <div class="custom-wallpaper-card ${isActive ? 'active' : ''}" data-id="${item.id}">
            <div class="custom-wallpaper-thumb" style="background-image: url('${item.thumb || item.wall}')">
              ${isActive ? '<span class="active-indicator-tag">● Active</span>' : ''}
            </div>
            <div class="custom-wallpaper-info">
              <span class="custom-wallpaper-name" title="${item.name || 'Wallpaper'}">${item.name || 'Custom Wallpaper'}</span>
              <div class="custom-wallpaper-actions">
                ${isActive
            ? '<span class="active-chip">Applied</span>'
            : `<button class="btn-micro-action btn-apply-wall" data-id="${item.id}" type="button">Apply</button>`
          }
                <button class="btn-micro-icon btn-delete-wall" data-id="${item.id}" type="button" title="Delete wallpaper">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M2.5 4.5h11M5.5 4.5V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M6 7.5v4.5M10 7.5v4.5M3.5 4.5l.8 9.5a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9l.8-9.5"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    });
  }

  /* Handle Apply & Delete */
  galleryList.addEventListener('click', async (e) => {
    const applyBtn = e.target.closest('.btn-apply-wall');
    if (applyBtn) {
      const id = applyBtn.dataset.id;
      if (!isPremium) {
        openUpgrade();
        return;
      }
      chrome.storage.local.get(['lcCustomGallery', 'lcAnime'], (res) => {
        const item = (res.lcCustomGallery || []).find((g) => g.id === id);
        if (!item) return;
        const cfg = res.lcAnime || {};
        cfg.scene = 'custom';
        cfg.themes = cfg.themes || {};
        if (item.theme) {
          cfg.themes.custom = item.theme;
          cfg.theme = item.theme;
          cfg.themeFor = 'custom';
        }
        chrome.storage.local.set({
          lcAnimeArt: { wall: item.wall, blur: item.blur || item.thumb, name: item.name },
          lcAnime: cfg,
          lcThemeStudio: 'anime'
        }, () => {
          showStatus(`Applied "${item.name}"!`);
          renderGallery();
        });
      });
      return;
    }

    const deleteBtn = e.target.closest('.btn-delete-wall');
    if (deleteBtn) {
      const id = deleteBtn.dataset.id;
      chrome.storage.local.get(['lcCustomGallery', 'lcAnimeArt', 'lcAnime'], (res) => {
        const gallery = res.lcCustomGallery || [];
        const toDelete = gallery.find((g) => g.id === id);
        const filtered = gallery.filter((g) => g.id !== id);
        const updates = { lcCustomGallery: filtered };

        const currentArt = res.lcAnimeArt;
        if (toDelete && currentArt && (currentArt.name === toDelete.name || currentArt.wall === toDelete.wall)) {
          if (filtered.length > 0) {
            const next = filtered[0];
            updates.lcAnimeArt = { wall: next.wall, blur: next.blur || next.thumb, name: next.name };
            if (next.theme) {
              const cfg = res.lcAnime || {};
              cfg.themes = cfg.themes || {};
              cfg.themes.custom = next.theme;
              cfg.theme = next.theme;
              updates.lcAnime = cfg;
            }
          } else {
            const cfg = res.lcAnime || {};
            cfg.scene = 'moonlit-shrine';
            updates.lcAnime = cfg;
            chrome.storage.local.remove('lcAnimeArt');
          }
        }
        chrome.storage.local.set(updates, () => {
          showStatus('Wallpaper removed.');
          renderGallery();
        });
      });
    }
  });

  /* Dropzone and File Upload logic */
  dropzone.addEventListener('click', () => {
    if (!isPremium) {
      openUpgrade();
      return;
    }
    if (fileInput) fileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (!isPremium) {
      openUpgrade();
      return;
    }
    const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) handleUpload(file);
  });

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) handleUpload(file);
      fileInput.value = '';
    });
  }

  async function handleUpload(file) {
    if (!isPremium) {
      openUpgrade();
      return;
    }
    if (!file.type.startsWith('image/')) {
      showStatus('Please select an image file (PNG, JPEG, WebP).', true);
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      showStatus('Image exceeds 30 MB size limit.', true);
      return;
    }

    dropzone.classList.add('busy');
    showStatus('Preparing 4K wallpaper & solving color palette…', false, true);

    try {
      const Proc = globalThis.LCTSAnimeProcess;
      const Solver = globalThis.LCTSAnimeSolver;
      if (!Proc || !Solver) {
        throw new Error('Process/Solver module not loaded');
      }

      const prepared = await Proc.prepare(file);
      const [wall, blur] = await Promise.all([
        Proc.blobToDataURL(prepared.wallBlob),
        Proc.blobToDataURL(prepared.blurBlob)
      ]);

      const theme = Solver.analyze(prepared.sharp, prepared.blurSamples, {
        visibility: 0.85,
        glass: 'auto',
        mode: 'dark'
      });

      chrome.storage.local.get(['lcAnime', 'lcCustomGallery'], (res) => {
        const cfg = res.lcAnime || {};
        cfg.scene = 'custom';
        cfg.themes = cfg.themes || {};
        cfg.themes.custom = theme;
        cfg.theme = theme;
        cfg.themeFor = 'custom';

        const existingGal = res.lcCustomGallery || [];
        const newItem = {
          id: 'cg_' + Date.now(),
          name: file.name,
          wall,
          thumb: blur,
          blur,
          theme,
          uploadedAt: Date.now()
        };
        const updatedGal = [newItem, ...existingGal.filter((g) => g.name !== file.name)].slice(0, 10);

        chrome.storage.local.set({
          lcAnimeArt: { wall, blur, name: file.name },
          lcAnime: cfg,
          lcThemeStudio: 'anime',
          lcCustomGallery: updatedGal
        }, () => {
          dropzone.classList.remove('busy');
          showStatus(`Applied "${file.name}" to LeetCode!`);
          renderGallery();
        });
      });
    } catch (err) {
      console.error('[LeetGlow MySpace] Upload error:', err);
      dropzone.classList.remove('busy');
      showStatus('Failed to process image. Try another PNG or JPEG.', true);
    }
  }

  /* Modal Close Handlers */
  if (closeUpgradeModal && upgradeModal) {
    closeUpgradeModal.addEventListener('click', () => upgradeModal.close());
    upgradeModal.addEventListener('click', (e) => {
      if (e.target === upgradeModal) upgradeModal.close();
    });
  }

  if (modalUpgradeBtn) {
    modalUpgradeBtn.addEventListener('click', () => {
      if (upgradeModal) upgradeModal.close();
      chrome.tabs.create({ url: chrome.runtime.getURL('src/studio.html#upgrade') });
    });
  }

  if (modalActivateKeyBtn) {
    modalActivateKeyBtn.addEventListener('click', () => {
      if (upgradeModal) upgradeModal.close();
      chrome.tabs.create({ url: chrome.runtime.getURL('src/studio.html#activate') });
    });
  }

  /* Listen for storage changes */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.leetglowPremium) {
      isPremium = !!changes.leetglowPremium.newValue?.active;
      updatePremiumUI();
      renderGallery();
    }
    if (changes.lcCustomGallery || changes.lcAnimeArt || changes.lcAnime) {
      renderGallery();
    }
  });

  checkPremium();
  renderGallery();
})();

/* Footer pill actions */
if (globalThis.LCTSBugButton) {
  globalThis.LCTSBugButton(document.getElementById('bug'));
}

const shortcutsBtn = document.getElementById('shortcutsBtn');
if (shortcutsBtn) {
  shortcutsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });
}

const rateBtn = document.getElementById('rateBtn');
if (rateBtn) {
  rateBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://github.com/the-insane-iconic/LeetGlow' });
  });
}

const docsBtn = document.getElementById('docsBtn');
if (docsBtn) {
  docsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/studio.html') });
  });
}
