/* Popup: render theme cards with live previews, persist the
   choice to storage (the content script applies it live to open LeetCode tabs). */

const KEY = 'lcThemeStudio';
const DEFAULT = 'paper';

/* Per-theme preview palette (mirrors the real editor colors). */
const THEMES = {
  grid: {
    name: 'Grid', desc: 'drafting table, hard edges', accent: '#35e0a1',
    pv: {
      bg: '#141c28', text: '#d7e0ec', line: '#3a4a5f', kw: '#58a6ff',
      fn: '#35e0a1', num: '#ffa657', var: '#d7e0ec', com: '#56687f', pn: '#79c0ff'
    },
    tex: 'grid'
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
const ORDER = ['anime', 'grid', 'game', 'pixel', 'crawler', 'off'];
const LCT_ORDER = [
  'ocean-deep',
  'paper',
  'midnight-ink',
  'lofi-cafe',
  'rainy-window',
  'meadow-breeze',
  'nord',
  'forest-mist',
  'sakura-dream'
];

if (globalThis.LCT && globalThis.LCT.THEMES) {
  globalThis.LCT.THEMES.forEach((t) => {
    THEMES[t.id] = {
      name: t.name,
      desc: t.tagline || t.category,
      accent: t.palette && t.palette.accent ? t.palette.accent : '#dd5e95',
      accent2: t.palette && t.palette.accent2 ? t.palette.accent2 : '#8f7be8',
      category: t.category,
      raw: t
    };
  });
}

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
wallpaperDrawer.innerHTML = `
  <div class="wallpaper-drawer-header">
    <button id="btnBackToThemes" class="wp-back-btn" type="button" aria-label="Back to all curated themes">
      <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="10 13 5 8 10 3"></polyline>
      </svg>
      <span>All Themes</span>
    </button>
    <span class="wp-drawer-title">Wallpapers & Scenes</span>
  </div>
  <div id="wallpaperGrid" class="wallpaper-grid"></div>
`;

const btnBackToThemes = wallpaperDrawer.querySelector('#btnBackToThemes');
if (btnBackToThemes) {
  btnBackToThemes.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleWallpaperDrawer(false);
  });
}

let wallpapersDrawerOpen = false;

function renderWallpaperSkeletons() {
  const box = document.getElementById('wallpaperGrid');
  if (!box) return;
  box.innerHTML = Array.from({ length: 6 }).map(() => `
    <div class="wp-card wp-card-skeleton" aria-hidden="true">
      <div class="wp-skeleton-shimmer"></div>
      <div class="wp-skeleton-badge"></div>
      <div class="wp-skeleton-name"></div>
    </div>
  `).join('');
}

function toggleWallpaperDrawer(force) {
  const container = document.getElementById('majorThemes') || document.getElementById('grid');
  const curated = document.getElementById('curatedGrid');
  if (!container) return;
  wallpapersDrawerOpen = typeof force === 'boolean' ? force : !wallpapersDrawerOpen;
  container.classList.toggle('wallpapers-expanded', wallpapersDrawerOpen);
  if (curated) curated.classList.toggle('hidden', wallpapersDrawerOpen);
  const dividerLine = document.querySelector('.curated-end-divider');
  if (dividerLine) dividerLine.classList.toggle('hidden', wallpapersDrawerOpen);
  document.querySelectorAll('.theme-section-divider').forEach((el) => {
    el.classList.toggle('hidden', wallpapersDrawerOpen);
  });
  if (wallpapersDrawerOpen) {
    const box = document.getElementById('wallpaperGrid');
    if (box && !box.children.length) {
      renderWallpaperSkeletons();
    }
    renderWallpaperGrid();
  }
}

async function renderWallpaperGrid() {
  const box = document.getElementById('wallpaperGrid');
  if (!box) return;

  if (!box.children.length) {
    renderWallpaperSkeletons();
  }

  const res = await chrome.storage.local.get(['lcAnime', 'lcAnimeArt']);
  const cfg = res.lcAnime || {};
  const isLive = cfg.sceneMode === 'live' && cfg.liveWallpaper;
  const activeId = isLive
    ? (cfg.liveWallpaper && cfg.liveWallpaper.id)
    : ((cfg.staticWallpaper && cfg.staticWallpaper.id) || cfg.scene || globalThis.LCTS_SCENE_DEFAULT);

  let items = [];

  // 1. User's uploaded custom picture (if exists)
  if (res.lcAnimeArt && (res.lcAnimeArt.wall || res.lcAnimeArt.blur)) {
    items.push({
      id: 'custom',
      name: res.lcAnimeArt.name || 'Your picture',
      thumb: res.lcAnimeArt.blur || res.lcAnimeArt.wall,
      isCustom: true
    });
  }

  // 2. Wallpapers from Supabase storage bucket (videos -> live, images -> static)
  if (globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.getAll) {
    try {
      const bucketList = await globalThis.LCTSLiveWallpapers.getAll();
      bucketList.forEach(w => {
        if (w.isLive) {
          items.push({
            id: w.id,
            name: w.name,
            thumb: w.thumbUrl || (w.thumb ? chrome.runtime.getURL(w.thumb) : ''),
            isLive: true,
            liveData: w
          });
        } else {
          // Static wallpaper uploaded to bucket
          items.push({
            id: w.id,
            name: w.name,
            thumb: w.thumbUrl || w.imageUrl,
            imageUrl: w.imageUrl,
            isLive: false,
            isSupabase: true,
            bucketData: w
          });
        }
      });
    } catch (e) {
      console.warn('[LeetGlow] Could not fetch bucket wallpapers for drawer:', e);
    }
  }

  // 3. Preset scenes from globalThis.LCTS_SCENES (local to extension)
  const scenes = globalThis.LCTS_SCENES || {};
  Object.entries(scenes).forEach(([sceneId, s]) => {
    items.push({
      id: sceneId,
      name: s.name,
      thumb: chrome.runtime.getURL(s.thumb || s.wall)
    });
  });

  box.innerHTML = '';

  if (!items.length) {
    box.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 24px 12px; font-size: 12px; color: var(--pop-muted);">No wallpapers found.</div>';
    return;
  }

  items.forEach(item => {
    const isActive = (item.id === activeId);

    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wp-card';
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
        if (item.isLive && item.liveData && item.liveData.videoUrl && globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.downloadAndCache) {
          try {
            await globalThis.LCTSLiveWallpapers.downloadAndCache(item.liveData.videoUrl);
          } catch (cacheErr) {
            console.warn('[LeetGlow] Pre-cache warning (falling back to direct):', cacheErr);
          }
        }
        await selectWallpaper(item);
      } finally {
        b.classList.remove('is-loading');
      }
    });

    box.appendChild(b);
  });
}

async function selectWallpaper(item) {

  const res = await chrome.storage.local.get(['lcAnime']);
  const cfg = res.lcAnime || {};

  if (item.isLive) {
    cfg.sceneMode = 'live';
    cfg.liveWallpaper = item.liveData;
    delete cfg.staticWallpaper;
    const themeId = (item.liveData && item.liveData.themeId) || (cfg.scene && cfg.scene !== 'neon-rain' ? cfg.scene : null) || 'golden-hour';
    cfg.scene = themeId;
    cfg.arcScenes = Object.assign({}, cfg.arcScenes || {}, {
      easy: themeId,
      medium: themeId,
      hard: themeId
    });
  } else if (item.isCustom) {
    cfg.sceneMode = 'static';
    cfg.scene = 'custom';
    delete cfg.staticWallpaper;
    delete cfg.liveWallpaper;
  } else if (item.isSupabase && !item.isLive && item.bucketData) {
    cfg.sceneMode = 'static';
    cfg.scene = item.id;
    cfg.staticWallpaper = item.bucketData;
    delete cfg.liveWallpaper;
    cfg.arcScenes = Object.assign({}, cfg.arcScenes || {}, {
      easy: item.id,
      medium: item.id,
      hard: item.id
    });
  } else {
    cfg.sceneMode = 'static';
    cfg.scene = item.id;
    delete cfg.staticWallpaper;
    delete cfg.liveWallpaper;
    cfg.arcScenes = Object.assign({}, cfg.arcScenes || {}, {
      easy: item.id,
      medium: item.id,
      hard: item.id
    });
  }

  cfg.arcs = false;
  animeCfgCache = cfg;

  await chrome.storage.local.set({
    lcAnime: cfg,
    [KEY]: 'anime'
  });

  markSelected('anime');

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

const FX_CLASSES = {
  petals: 'fx-petals',
  dust: 'fx-dust',
  rain: 'fx-rain',
  stars: 'fx-stars',
  bubbles: 'fx-bubbles',
  leaves: 'fx-leaves',
  fireflies: 'fx-fireflies',
  snow: 'fx-snow'
};

function makeThemePreview(theme) {
  const preview = document.createElement('span');
  const particles = theme.effects && theme.effects.particles;
  preview.className = 'preview ' + (FX_CLASSES[particles] || '');
  const palette = theme.palette || {};
  preview.style.setProperty('--pv-bg', palette.bg || '#0b0b12');
  preview.style.setProperty('--pv-surface', palette.surface || '#16161f');
  preview.style.setProperty('--pv-text', palette.text || '#f4f4fa');
  preview.style.setProperty('--pv-accent', palette.accent || '#c4a6ff');
  preview.style.setProperty('--pv-accent2', palette.accent2 || '#22d3ee');
  preview.style.setProperty('--pv-border', palette.border || 'rgba(255,255,255,.12)');

  preview.innerHTML = [
    '<span class="scene"></span>',
    '<span class="veil"></span>',
    '<span class="mini-nav"><span class="logo"></span><span class="bar"></span><span class="bar"></span><span class="avatar"></span></span>',
    '<span class="mini-body">',
    '  <span class="mini-title">Two Sum</span>',
    '  <span class="mini-tags"><b class="easy">Easy</b><b class="soft">array</b><b class="soft">hash</b></span>',
    '  <span class="mini-code"><i></i><i></i><i></i></span>',
    '  <span class="mini-run">Run</span>',
    '</span>',
    '<span class="grain"></span>'
  ].join('');

  if (particles && particles !== 'none') {
    for (let i = 0; i < 5; i += 1) {
      const dot = document.createElement('i');
      dot.className = 'p-dot';
      dot.style.setProperty('--x', (8 + Math.random() * 84).toFixed(1) + '%');
      dot.style.setProperty('--y', (12 + Math.random() * 76).toFixed(1) + '%');
      dot.style.setProperty('--s', (2 + Math.random() * 3).toFixed(1) + 'px');
      dot.style.setProperty('--d', (5 + Math.random() * 7).toFixed(1) + 's');
      dot.style.setProperty('--delay', (-Math.random() * 8).toFixed(1) + 's');
      preview.appendChild(dot);
    }
  }
  return preview;
}

function makeThemeCard(theme, selectedId) {
  const isSelected = theme.id === selectedId;
  const button = document.createElement('button');
  button.className = 'theme-card' + (isSelected ? ' active' : '');
  button.type = 'button';
  button.dataset.id = theme.id;
  button.setAttribute('role', 'radio');
  button.setAttribute('aria-checked', String(isSelected));
  button.title = theme.name + (theme.tagline ? ' — ' + theme.tagline : '');

  const palette = theme.palette || {};
  button.style.setProperty('--pv-accent', palette.accent || '#c4a6ff');
  button.style.setProperty('--pv-accent2', palette.accent2 || '#22d3ee');

  const preview = makeThemePreview(theme);
  if (isSelected) {
    const check = document.createElement('span');
    check.className = 'active-check';
    check.textContent = '✓';
    preview.appendChild(check);
  }

  const meta = document.createElement('span');
  meta.className = 'theme-meta';

  const name = document.createElement('span');
  name.className = 'theme-name';
  name.textContent = theme.name;

  const cat = document.createElement('span');
  cat.className = 'theme-cat';
  cat.textContent = theme.category || 'Theme';

  meta.appendChild(name);
  meta.appendChild(cat);

  button.appendChild(preview);
  button.appendChild(meta);

  button.addEventListener('click', () => {
    choose(theme.id);
  });

  return button;
}

function makeMatrixCard() {
  const card = document.createElement('div');
  card.className = 'quick-matrix-card';
  card.innerHTML = `
    <div class="quick-matrix-grid">
      <button class="quick-action-btn" data-action="focus" type="button" title="Toggle focus mode">
        <span class="q-icon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9V4h5v2H6v3H4Zm11-5h5v5h-2V6h-3V4ZM4 15h2v3h3v2H4v-5Zm14 0h2v5h-5v-2h3v-3Z"/></svg>
        </span>
        <span class="q-label">Focus</span>
      </button>
      <button class="quick-action-btn" data-action="audio" type="button" title="Toggle lofi audio">
        <span class="q-icon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z"/></svg>
        </span>
        <span class="q-label">Lofi</span>
      </button>
      <button class="quick-action-btn" data-action="timer" type="button" title="Toggle pomodoro timer">
        <span class="q-icon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 2h6v2H9V2Zm3 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm1 3h-2v6l4.2 2.5 1-1.7-3.2-1.9V9Z"/></svg>
        </span>
        <span class="q-label">Timer</span>
      </button>
      <button class="quick-action-btn" data-action="studio" type="button" title="Anime wallpapers & scenes">
        <span class="q-icon">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 0 0 0 18c1.3 0 2-.8 2-2 0-.6-.2-1.1-.6-1.5-.3-.4-.4-.7-.4-1 0-.7.5-1.2 1.3-1.2H16a5 5 0 0 0 5-5.1C21 6.6 17 3 12 3Zm-4.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm2.8-4.2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm4.4 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3.3 3.2a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"/></svg>
        </span>
        <span class="q-label">Anime</span>
      </button>
    </div>
  `;

  const focusBtn = card.querySelector('[data-action="focus"]');
  const audioBtn = card.querySelector('[data-action="audio"]');
  const timerBtn = card.querySelector('[data-action="timer"]');
  const studioBtn = card.querySelector('[data-action="studio"]');

  chrome.storage.local.get(['lcFocus', 'lctSettings'], (res) => {
    if (res && res.lcFocus) focusBtn.classList.add('active');
    const audioOn = (res && res.lctSettings && res.lctSettings.audio && typeof res.lctSettings.audio.enabled === 'boolean')
      ? res.lctSettings.audio.enabled
      : true;
    if (audioOn) {
      audioBtn.classList.add('active');
    }
    if (res && res.lctSettings && res.lctSettings.pomodoro && res.lctSettings.pomodoro.enabled) {
      timerBtn.classList.add('active');
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.lcFocus) {
      focusBtn.classList.toggle('active', !!changes.lcFocus.newValue);
    }
    if (changes.lctSettings && changes.lctSettings.newValue) {
      const s = changes.lctSettings.newValue;
      if (s.audio) audioBtn.classList.toggle('active', !!s.audio.enabled);
      if (s.pomodoro) timerBtn.classList.toggle('active', !!s.pomodoro.enabled);
    }
  });

  focusBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'lct:toggle-focus' }, (resp) => {
          const active = resp && resp.focus;
          focusBtn.classList.toggle('active', !!active);
          chrome.storage.local.set({ lcFocus: !!active });
        });
      }
    });
  });

  audioBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'lct:toggle-audio' }, (resp) => {
          if (resp && typeof resp.playing === 'boolean') {
            audioBtn.classList.toggle('active', resp.playing);
            return;
          }
          chrome.storage.local.get(['lctSettings'], (res) => {
            const cfg = res.lctSettings || {};
            cfg.audio = cfg.audio || {};
            const cur = typeof cfg.audio.enabled === 'boolean' ? cfg.audio.enabled : true;
            const next = !cur;
            cfg.audio.enabled = next;
            chrome.storage.local.set({ lctSettings: cfg });
            audioBtn.classList.toggle('active', next);
          });
        });
      } else {
        chrome.storage.local.get(['lctSettings'], (res) => {
          const cfg = res.lctSettings || {};
          cfg.audio = cfg.audio || {};
          const cur = typeof cfg.audio.enabled === 'boolean' ? cfg.audio.enabled : true;
          const next = !cur;
          cfg.audio.enabled = next;
          chrome.storage.local.set({ lctSettings: cfg });
          audioBtn.classList.toggle('active', next);
        });
      }
    });
  });

  timerBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'lct:toggle-pomodoro' }, (resp) => {
          if (resp && typeof resp.enabled === 'boolean') {
            timerBtn.classList.toggle('active', resp.enabled);
            return;
          }
          chrome.storage.local.get(['lctSettings'], (res) => {
            const cfg = res.lctSettings || {};
            cfg.pomodoro = cfg.pomodoro || {};
            const next = !cfg.pomodoro.enabled;
            cfg.pomodoro.enabled = next;
            chrome.storage.local.set({ lctSettings: cfg });
            timerBtn.classList.toggle('active', next);
          });
        });
      } else {
        chrome.storage.local.get(['lctSettings'], (res) => {
          const cfg = res.lctSettings || {};
          cfg.pomodoro = cfg.pomodoro || {};
          const next = !cfg.pomodoro.enabled;
          cfg.pomodoro.enabled = next;
          chrome.storage.local.set({ lctSettings: cfg });
          timerBtn.classList.toggle('active', next);
        });
      }
    });
  });

  studioBtn.addEventListener('click', () => {
    switchTab('tab-themes');
    choose('anime');
    toggleWallpaperDrawer(true);
  });

  return card;
}

function renderOriginalCards(selected, container) {
  if (!container) return;
  const preview = previewHTML();
  ORDER.forEach((id) => {
    const t = THEMES[id];
    if (!t) return;

    if (id === 'anime') {
      const card = document.createElement('button');
      card.className = 'card anime-studio-card';
      card.type = 'button';
      card.setAttribute('role', 'radio');
      card.setAttribute('aria-checked', String(selected === 'anime'));
      card.setAttribute('aria-label', 'Anime Themes with curated aesthetic wallpapers and live glass');
      card.dataset.id = 'anime';

      chrome.storage.local.get(['lcHideAnimeCard'], (res) => {
        if (res && res.lcHideAnimeCard) card.style.display = 'none';
      });

      card.innerHTML = `
        <div class="anime-card-content">
          <span class="studio-jp" aria-hidden="true"><i>ア</i><i>ニ</i><i>メ</i></span>
          <span class="studio-text">
            <b>Anime Themes</b>
            <span>Curated wallpapers, live glass & sounds</span>
          </span>
          <div class="anime-meta-title-row" aria-label="Toggle wallpapers">
            <span class="click-here-text">click here</span>
            <svg class="anime-down-arrow" viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4.5L6 8l3.5-3.5"/></svg>
          </div>
          <div class="meta check-only">
            <span class="check">${CHECK}</span>
          </div>
          <button class="anime-hide-btn" type="button" title="Hide Anime card from main list" aria-label="Hide Anime Themes card">
            <svg viewBox="0 0 16 16" width="9" height="9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>
          </button>
        </div>
      `;
      card.addEventListener('click', (e) => {
        if (e.target.closest('.anime-hide-btn')) {
          e.stopPropagation();
          e.preventDefault();
          chrome.storage.local.set({ lcHideAnimeCard: true });
          card.style.display = 'none';
          const toggle = document.getElementById('toggleAnimeCard');
          if (toggle) toggle.checked = false;
          return;
        }
        choose('anime');
        toggleWallpaperDrawer();
      });
      container.appendChild(card);
      container.appendChild(wallpaperDrawer);
      return;
    }

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
      toggleWallpaperDrawer(false);
      choose(id);
    });
    container.appendChild(card);

    if (id === 'game') {
      const url = chrome.runtime.getURL('textures/game/card.webp');
      card.querySelector('.preview').style.setProperty('--pv-scene', `url("${url}")`);
    }
    if (id === 'pixel') paintPixelCard(card.querySelector('.preview'));
  });
}

function render(selected) {
  const curatedBox = document.getElementById('curatedGrid');
  const majorBox = document.getElementById('majorThemes');
  const fallbackGrid = document.getElementById('grid');

  if (curatedBox) {
    curatedBox.innerHTML = '';
    // Row 1, Column 1: 2x2 Matrix Card
    const matrixCard = makeMatrixCard();
    curatedBox.appendChild(matrixCard);

    // Row 1 Col 2 onwards: Curated 9 themes in exact specified order
    const themesList = LCT_ORDER.map((id) => {
      return (globalThis.LCT && globalThis.LCT.themeById ? globalThis.LCT.themeById(id) : null)
        || (THEMES[id] && THEMES[id].raw);
    }).filter(Boolean);

    themesList.forEach((theme) => {
      const card = makeThemeCard(theme, selected);
      curatedBox.appendChild(card);
    });
  }

  if (majorBox) {
    majorBox.innerHTML = '';
    renderOriginalCards(selected, majorBox);
  } else if (fallbackGrid && !curatedBox) {
    fallbackGrid.innerHTML = '';
    renderOriginalCards(selected, fallbackGrid);
  }

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
    document.querySelectorAll('.studio-jp').forEach((e) => { e.hidden = cfg.japanese !== true; });
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
    } else if (cfg.staticWallpaper && cfg.staticWallpaper.imageUrl) {
      urls = [cfg.staticWallpaper.thumbUrl || cfg.staticWallpaper.imageUrl];
      inkFrom = cfg.staticWallpaper.themeId || DEF;
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
  const t = THEMES[id];
  if (t && t.accent) {
    document.documentElement.style.setProperty('--pop-accent', t.accent);
  }
}

function markSelected(id) {
  document.querySelectorAll('.theme-card, .card').forEach((c) => {
    const isThis = c.dataset.id === id;
    c.classList.toggle('active', isThis);
    c.setAttribute('aria-checked', String(isThis));
    const oldCheck = c.querySelector('.active-check');
    if (oldCheck) oldCheck.remove();
    if (isThis && c.classList.contains('theme-card')) {
      const check = document.createElement('span');
      check.className = 'active-check';
      check.textContent = '✓';
      const pv = c.querySelector('.preview');
      if (pv) pv.appendChild(check);
    }
  });
  setAccent(id);
}

function choose(id) {
  markSelected(id);
  chrome.storage.local.set({ [KEY]: id });
  /* content.js hears the storage change and applies it live in every open
     problem tab, so there is nothing to refresh */
  try {
    chrome.tabs.query({ url: ['https://*.leetcode.com/*', 'https://*.leetcode.cn/*'] }, (tabs) => {
      (tabs || []).forEach(t => {
        chrome.tabs.sendMessage(t.id, { type: 'theme-change', theme: id });
        chrome.tabs.sendMessage(t.id, { type: 'lct:set-theme', theme: id });
      });
    });
  } catch (e) { }
  const status = document.getElementById('status');
  if (status) {
    const tName = (THEMES[id] && THEMES[id].name) ||
      (globalThis.LCT && globalThis.LCT.themeById && globalThis.LCT.themeById(id) && globalThis.LCT.themeById(id).name) ||
      id;
    status.textContent = id === 'off'
      ? 'Theme off. LeetCode is back to its own look.'
      : `${tName} applied to your open problem tabs.`;
  }
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
chrome.storage.local.get([KEY], (res) => {
  let selected = (res && res[KEY]);
  if (!selected || !THEMES[selected]) {
    selected = DEFAULT;
    chrome.storage.local.set({ [KEY]: DEFAULT });
  }
  render(selected);
});

/* keyboard: arrow keys move between radio cards and select, as a radio group does */
document.addEventListener('keydown', (e) => {
  if (!['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
  const cards = [...document.querySelectorAll('.theme-card, .card')];
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

function updateSliderFill(slider) {
  if (!slider) return;
  const min = Number(slider.min) || 0;
  const max = Number(slider.max) || 100;
  const val = Number(slider.value);
  const pct = Math.max(0, Math.min(100, ((val - min) / (max - min)) * 100));
  slider.style.background = `linear-gradient(to right, #ec4899 0%, #ec4899 ${pct}%, #ede9fe ${pct}%, #ede9fe 100%)`;
}

function switchTab(targetId) {
  if (document.body) document.body.dataset.activeTab = targetId;
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

// Set default active tab
if (document.body) document.body.dataset.activeTab = 'tab-themes';

/* Color Palette Selector */
const paletteGrid = document.getElementById('colorPaletteGrid');
const paletteSwatches = document.querySelectorAll('.palette-swatch-item');

function setActivePaletteUI(paletteId) {
  paletteSwatches.forEach((btn) => {
    const isSelected = btn.dataset.palette === paletteId;
    btn.classList.toggle('active', isSelected);
    btn.setAttribute('aria-checked', String(isSelected));
  });
}

chrome.storage.local.get(['lcPalette'], (res) => {
  const currentPal = res.lcPalette || 'auto';
  setActivePaletteUI(currentPal);
});

if (paletteGrid) {
  paletteGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.palette-swatch-item');
    if (!btn) return;
    const palId = btn.dataset.palette;
    if (!palId) return;
    setActivePaletteUI(palId);
    chrome.storage.local.set({ lcPalette: palId });
  });
}

/* Customize sliders: Container Transparency, Editor Transparency, Volume, Pomodoro */
const containerTransSlider = document.getElementById('containerTransSlider');
const containerTransVal = document.getElementById('containerTransVal');
const editorTransSlider = document.getElementById('editorTransSlider');
const editorTransVal = document.getElementById('editorTransVal');
const volumeSlider = document.getElementById('volumeSlider');
const volumeVal = document.getElementById('volumeVal');
const testSoundBtn = document.getElementById('testSoundBtn');

const pomoWorkSlider = document.getElementById('pomoWorkSlider');
const pomoWorkVal = document.getElementById('pomoWorkVal');
const pomoBreakSlider = document.getElementById('pomoBreakSlider');
const pomoBreakVal = document.getElementById('pomoBreakVal');
const pomoLongSlider = document.getElementById('pomoLongSlider');
const pomoLongVal = document.getElementById('pomoLongVal');
const pomoSoundToggle = document.getElementById('pomoSoundToggle');
const pomoAutoToggle = document.getElementById('pomoAutoToggle');

/* Anime Experience & Moments toggles in Customize */
const toggleTitleCard = document.getElementById('toggleTitleCard');
const toggleMoments = document.getElementById('toggleMoments');
const toggleJapanese = document.getElementById('toggleJapanese');
const toggleShareCard = document.getElementById('toggleShareCard');
const toggleAnimeCard = document.getElementById('toggleAnimeCard');

let animeCfgCache = null;
let pixelCfgCache = null;

chrome.storage.local.get(['lcContainerTrans', 'lcEditorTrans', 'lcVolume', 'lcAnime', 'lcPixel', 'lcGameVolume', 'lctSettings'], (res) => {
  animeCfgCache = res.lcAnime || {};
  pixelCfgCache = res.lcPixel || {};

  // Container Transparency (default 30%)
  const cVal = typeof res.lcContainerTrans === 'number' ? res.lcContainerTrans
    : (typeof animeCfgCache.containerTransparency === 'number' ? animeCfgCache.containerTransparency : 30);
  if (containerTransSlider && containerTransVal) {
    containerTransSlider.value = cVal;
    containerTransVal.textContent = cVal + '%';
    updateSliderFill(containerTransSlider);
  }

  // Editor Transparency (default 25%)
  const eVal = typeof res.lcEditorTrans === 'number' ? res.lcEditorTrans
    : (typeof animeCfgCache.editorTransparency === 'number' ? animeCfgCache.editorTransparency : 25);
  if (editorTransSlider && editorTransVal) {
    editorTransSlider.value = eVal;
    editorTransVal.textContent = eVal + '%';
    updateSliderFill(editorTransSlider);
  }

  // Volume (default 50%)
  const vVal = typeof res.lcVolume === 'number' ? res.lcVolume
    : (typeof animeCfgCache.volume === 'number' ? Math.round(animeCfgCache.volume * 100)
      : (typeof res.lcGameVolume === 'number' ? Math.round(res.lcGameVolume * 100) : 50));
  if (volumeSlider && volumeVal) {
    volumeSlider.value = vVal;
    volumeVal.textContent = vVal + '%';
    updateSliderFill(volumeSlider);
  }

  // Pomodoro Settings
  const pCfg = (res && res.lctSettings && res.lctSettings.pomodoro) || {};
  const work = typeof pCfg.work === 'number' ? pCfg.work : 25;
  const brk = typeof pCfg.break === 'number' ? pCfg.break : 5;
  const longBrk = typeof pCfg.longBreak === 'number' ? pCfg.longBreak : 15;
  const sound = pCfg.sound !== false;
  const autoStart = Boolean(pCfg.autoStart);

  if (pomoWorkSlider && pomoWorkVal) {
    pomoWorkSlider.value = work;
    pomoWorkVal.textContent = work + ' min';
    updateSliderFill(pomoWorkSlider);
  }
  if (pomoBreakSlider && pomoBreakVal) {
    pomoBreakSlider.value = brk;
    pomoBreakVal.textContent = brk + ' min';
    updateSliderFill(pomoBreakSlider);
  }
  if (pomoLongSlider && pomoLongVal) {
    pomoLongSlider.value = longBrk;
    pomoLongVal.textContent = longBrk + ' min';
    updateSliderFill(pomoLongSlider);
  }
  if (pomoSoundToggle) pomoSoundToggle.checked = sound;
  if (pomoAutoToggle) pomoAutoToggle.checked = autoStart;
});

let debounceAnimeTimer = null;
function queueAnimeSave() {
  clearTimeout(debounceAnimeTimer);
  debounceAnimeTimer = setTimeout(() => {
    chrome.storage.local.get(['lcAnime'], (r) => {
      const current = r.lcAnime || {};
      if (animeCfgCache && typeof animeCfgCache.containerTransparency === 'number') {
        current.containerTransparency = animeCfgCache.containerTransparency;
      }
      if (animeCfgCache && typeof animeCfgCache.editorTransparency === 'number') {
        current.editorTransparency = animeCfgCache.editorTransparency;
      }
      animeCfgCache = current;
      chrome.storage.local.set({ lcAnime: current });
    });
  }, 100);
}

let debounceVolumeTimer = null;
function queueVolumeSave(norm) {
  clearTimeout(debounceVolumeTimer);
  debounceVolumeTimer = setTimeout(() => {
    chrome.storage.local.get(['lcAnime', 'lcPixel'], (r) => {
      const a = r.lcAnime || {};
      a.volume = norm;
      animeCfgCache = a;
      const p = r.lcPixel || {};
      p.volume = norm;
      pixelCfgCache = p;
      chrome.storage.local.set({ lcAnime: a, lcPixel: p });
    });
  }, 100);
}

if (containerTransSlider) {
  containerTransSlider.addEventListener('input', () => {
    const val = Number(containerTransSlider.value);
    if (containerTransVal) containerTransVal.textContent = val + '%';
    updateSliderFill(containerTransSlider);
    chrome.storage.local.set({ lcContainerTrans: val });
    if (!animeCfgCache) animeCfgCache = {};
    animeCfgCache.containerTransparency = val;
    queueAnimeSave();
  });
}

if (editorTransSlider) {
  editorTransSlider.addEventListener('input', () => {
    const val = Number(editorTransSlider.value);
    if (editorTransVal) editorTransVal.textContent = val + '%';
    updateSliderFill(editorTransSlider);
    chrome.storage.local.set({ lcEditorTrans: val });
    if (!animeCfgCache) animeCfgCache = {};
    animeCfgCache.editorTransparency = val;
    queueAnimeSave();
  });
}

if (volumeSlider) {
  volumeSlider.addEventListener('input', () => {
    const val = Number(volumeSlider.value);
    if (volumeVal) volumeVal.textContent = val + '%';
    updateSliderFill(volumeSlider);
    const norm = val / 100;
    chrome.storage.local.set({ lcVolume: val, lcGameVolume: norm });
    queueVolumeSave(norm);
  });
}

let debouncePomoTimer = null;
function savePomodoroSettings(patch) {
  clearTimeout(debouncePomoTimer);
  debouncePomoTimer = setTimeout(() => {
    chrome.storage.local.get(['lctSettings'], (res) => {
      const cfg = res.lctSettings || {};
      cfg.pomodoro = Object.assign({
        enabled: false,
        work: 25,
        break: 5,
        longBreak: 15,
        longEvery: 4,
        autoStart: false,
        sound: true
      }, cfg.pomodoro || {}, patch);
      chrome.storage.local.set({ lctSettings: cfg });
    });
  }, 100);
}

if (pomoWorkSlider) {
  pomoWorkSlider.addEventListener('input', () => {
    const val = Number(pomoWorkSlider.value);
    if (pomoWorkVal) pomoWorkVal.textContent = val + ' min';
    updateSliderFill(pomoWorkSlider);
    savePomodoroSettings({ work: val });
  });
}

if (pomoBreakSlider) {
  pomoBreakSlider.addEventListener('input', () => {
    const val = Number(pomoBreakSlider.value);
    if (pomoBreakVal) pomoBreakVal.textContent = val + ' min';
    updateSliderFill(pomoBreakSlider);
    savePomodoroSettings({ break: val });
  });
}

if (pomoLongSlider) {
  pomoLongSlider.addEventListener('input', () => {
    const val = Number(pomoLongSlider.value);
    if (pomoLongVal) pomoLongVal.textContent = val + ' min';
    updateSliderFill(pomoLongSlider);
    savePomodoroSettings({ longBreak: val });
  });
}

if (pomoSoundToggle) {
  pomoSoundToggle.addEventListener('change', () => {
    savePomodoroSettings({ sound: pomoSoundToggle.checked });
  });
}

if (pomoAutoToggle) {
  pomoAutoToggle.addEventListener('change', () => {
    savePomodoroSettings({ autoStart: pomoAutoToggle.checked });
  });
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.lcAnime && changes.lcAnime.newValue) {
    animeCfgCache = changes.lcAnime.newValue;
  }
  if (changes.lcPixel && changes.lcPixel.newValue) {
    pixelCfgCache = changes.lcPixel.newValue;
  }
  if (changes.lcPalette && changes.lcPalette.newValue) {
    setActivePaletteUI(changes.lcPalette.newValue);
  }
  if (changes.lcHideAnimeCard) {
    const hide = !!changes.lcHideAnimeCard.newValue;
    const animeCard = document.querySelector('.card.anime-studio-card');
    if (animeCard) animeCard.style.display = hide ? 'none' : '';
    if (toggleAnimeCard) toggleAnimeCard.checked = !hide;
  }
  if (changes.lcContainerTrans && containerTransSlider && document.activeElement !== containerTransSlider) {
    const v = changes.lcContainerTrans.newValue;
    containerTransSlider.value = v;
    if (containerTransVal) containerTransVal.textContent = v + '%';
    updateSliderFill(containerTransSlider);
  }
  if (changes.lcEditorTrans && editorTransSlider && document.activeElement !== editorTransSlider) {
    const v = changes.lcEditorTrans.newValue;
    editorTransSlider.value = v;
    if (editorTransVal) editorTransVal.textContent = v + '%';
    updateSliderFill(editorTransSlider);
  }
  if (changes.lcVolume && volumeSlider && document.activeElement !== volumeSlider) {
    const v = changes.lcVolume.newValue;
    volumeSlider.value = v;
    if (volumeVal) volumeVal.textContent = v + '%';
    updateSliderFill(volumeSlider);
  }
  if (changes.lctSettings && changes.lctSettings.newValue) {
    const p = changes.lctSettings.newValue.pomodoro;
    if (p) {
      if (typeof p.work === 'number' && pomoWorkSlider && document.activeElement !== pomoWorkSlider) {
        pomoWorkSlider.value = p.work;
        if (pomoWorkVal) pomoWorkVal.textContent = p.work + ' min';
        updateSliderFill(pomoWorkSlider);
      }
      if (typeof p.break === 'number' && pomoBreakSlider && document.activeElement !== pomoBreakSlider) {
        pomoBreakSlider.value = p.break;
        if (pomoBreakVal) pomoBreakVal.textContent = p.break + ' min';
        updateSliderFill(pomoBreakSlider);
      }
      if (typeof p.longBreak === 'number' && pomoLongSlider && document.activeElement !== pomoLongSlider) {
        pomoLongSlider.value = p.longBreak;
        if (pomoLongVal) pomoLongVal.textContent = p.longBreak + ' min';
        updateSliderFill(pomoLongSlider);
      }
      if (typeof p.sound === 'boolean' && pomoSoundToggle) {
        pomoSoundToggle.checked = p.sound;
      }
      if (typeof p.autoStart === 'boolean' && pomoAutoToggle) {
        pomoAutoToggle.checked = p.autoStart;
      }
    }
  }
});

/* Anime Experience & Moments storage initialization */
chrome.storage.local.get(['lcAnime', 'lcShare', 'lcHideAnimeCard'], (res) => {
  const anime = res.lcAnime || {};
  const share = res.lcShare || {};
  if (toggleTitleCard) toggleTitleCard.checked = anime.titleCard !== false;
  if (toggleMoments) toggleMoments.checked = anime.moments !== false;
  if (toggleJapanese) toggleJapanese.checked = anime.japanese === true;
  if (toggleShareCard) toggleShareCard.checked = share.enabled !== false;
  if (toggleAnimeCard) toggleAnimeCard.checked = res.lcHideAnimeCard !== true;
});

function updateAnimeSetting(key, val) {
  chrome.storage.local.get(['lcAnime'], (res) => {
    const cfg = res.lcAnime || {};
    cfg[key] = val;
    animeCfgCache = cfg;
    chrome.storage.local.set({ lcAnime: cfg });
  });
}

if (toggleTitleCard) {
  toggleTitleCard.addEventListener('change', () => {
    updateAnimeSetting('titleCard', toggleTitleCard.checked);
  });
}
if (toggleMoments) {
  toggleMoments.addEventListener('change', () => {
    updateAnimeSetting('moments', toggleMoments.checked);
  });
}
if (toggleJapanese) {
  toggleJapanese.addEventListener('change', () => {
    updateAnimeSetting('japanese', toggleJapanese.checked);
  });
}
if (toggleShareCard) {
  toggleShareCard.addEventListener('change', () => {
    chrome.storage.local.set({ lcShare: { enabled: toggleShareCard.checked } });
  });
}
if (toggleAnimeCard) {
  toggleAnimeCard.addEventListener('change', () => {
    const hide = !toggleAnimeCard.checked;
    chrome.storage.local.set({ lcHideAnimeCard: hide });
    const animeCard = document.querySelector('.card.anime-studio-card');
    if (animeCard) animeCard.style.display = hide ? 'none' : '';
  });
}

/* Animations & SFX live preview badges */
function previewMoment(momentName) {
  const vol = Number(volumeSlider ? volumeSlider.value : 50) / 100;
  if (globalThis.LCTSSounds && globalThis.LCTSSounds.play) {
    globalThis.LCTSSounds.play(momentName, { volume: vol, theme: 'anime' });
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs && tabs[0] && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'lcts:play-moment', moment: momentName }, () => {
        if (chrome.runtime.lastError) {} // suppress if not on problem tab
      });
    }
  });
}

document.querySelectorAll('.sfx-badge-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const moment = btn.dataset.moment;
    if (!moment) return;
    btn.classList.add('playing');
    setTimeout(() => btn.classList.remove('playing'), 500);
    previewMoment(moment);
  });
});

if (testSoundBtn) {
  testSoundBtn.addEventListener('click', () => {
    previewMoment('ac');
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
    const DEFAULT_VOLUME = 50;
    const DEFAULT_VOLUME_NORM = 0.5;

    if (containerTransSlider) {
      containerTransSlider.value = DEFAULT_CONTAINER;
      updateSliderFill(containerTransSlider);
    }
    if (containerTransVal) containerTransVal.textContent = DEFAULT_CONTAINER + '%';

    if (editorTransSlider) {
      editorTransSlider.value = DEFAULT_EDITOR;
      updateSliderFill(editorTransSlider);
    }
    if (editorTransVal) editorTransVal.textContent = DEFAULT_EDITOR + '%';

    if (volumeSlider) {
      volumeSlider.value = DEFAULT_VOLUME;
      updateSliderFill(volumeSlider);
    }
    if (volumeVal) volumeVal.textContent = DEFAULT_VOLUME + '%';

    if (pomoWorkSlider) {
      pomoWorkSlider.value = 25;
      updateSliderFill(pomoWorkSlider);
    }
    if (pomoWorkVal) pomoWorkVal.textContent = '25 min';
    if (pomoBreakSlider) {
      pomoBreakSlider.value = 5;
      updateSliderFill(pomoBreakSlider);
    }
    if (pomoBreakVal) pomoBreakVal.textContent = '5 min';
    if (pomoLongSlider) {
      pomoLongSlider.value = 15;
      updateSliderFill(pomoLongSlider);
    }
    if (pomoLongVal) pomoLongVal.textContent = '15 min';
    if (pomoSoundToggle) pomoSoundToggle.checked = true;
    if (pomoAutoToggle) pomoAutoToggle.checked = false;

    chrome.storage.local.get(['lctSettings'], (lctRes) => {
      const lctCfg = lctRes.lctSettings || {};
      lctCfg.pomodoro = Object.assign({}, lctCfg.pomodoro || {}, {
        work: 25,
        break: 5,
        longBreak: 15,
        sound: true,
        autoStart: false
      });
      chrome.storage.local.set({ lctSettings: lctCfg });
    });

    if (focusSwitch) focusSwitch.checked = false;
    setActivePaletteUI('auto');

    if (toggleTitleCard) toggleTitleCard.checked = true;
    if (toggleMoments) toggleMoments.checked = true;
    if (toggleJapanese) toggleJapanese.checked = false;
    if (toggleShareCard) toggleShareCard.checked = true;

    chrome.storage.local.get(['lcAnime', 'lcPixel'], (r) => {
      const cfg = r.lcAnime || {};
      cfg.containerTransparency = DEFAULT_CONTAINER;
      cfg.editorTransparency = DEFAULT_EDITOR;
      cfg.volume = DEFAULT_VOLUME_NORM;
      cfg.titleCard = true;
      cfg.moments = true;
      cfg.japanese = false;

      const pix = r.lcPixel || {};
      pix.volume = DEFAULT_VOLUME_NORM;

      chrome.storage.local.set({
        lcContainerTrans: DEFAULT_CONTAINER,
        lcEditorTrans: DEFAULT_EDITOR,
        lcVolume: DEFAULT_VOLUME,
        lcGameVolume: DEFAULT_VOLUME_NORM,
        lcPalette: 'auto',
        lcFocus: false,
        lcAnime: cfg,
        lcPixel: pix,
        lcShare: { enabled: true }
      }, () => {
        if (resetStatusText) {
          resetStatusText.hidden = false;
          setTimeout(() => { resetStatusText.hidden = true; }, 2200);
        }
      });
    });
  });
}

/* Quick jump buttons in Customize and My Space */
const openThemeDrawerBtn = document.getElementById('openThemeDrawerBtn');
if (openThemeDrawerBtn) {
  openThemeDrawerBtn.addEventListener('click', () => {
    switchTab('tab-themes');
    choose('anime');
    toggleWallpaperDrawer(true);
  });
}

/* =============================================================================
   My Space: Custom Wallpapers Gallery & Local Upload
   ============================================================================= */
(function initMySpace() {
  const dropzone = document.getElementById('customUploadDropzone');
  const dropContainer = document.getElementById('myspaceDropContainer') || dropzone;
  const uploadBtn = document.getElementById('myspaceUploadBtn');
  const fileInput = document.getElementById('customUploadInput');
  const statusText = document.getElementById('uploadStatusText');
  const galleryList = document.getElementById('customGalleryList');
  const galleryCount = document.getElementById('customGalleryCount');

  if (!dropzone || !galleryList) return;

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
        if (dropzone) dropzone.hidden = false;
        if (galleryList) {
          galleryList.hidden = true;
          galleryList.innerHTML = '';
        }
        return;
      }

      if (dropzone) dropzone.hidden = true;
      if (galleryList) {
        galleryList.hidden = false;
        const cardsHtml = gallery.map((item) => {
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

        const addMoreHtml = `
          <button class="custom-wallpaper-add-card" id="btnAddMoreWallpapers" type="button" title="Upload another artwork">
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="8" y1="3" x2="8" y2="13"></line>
              <line x1="3" y1="8" x2="13" y2="8"></line>
            </svg>
            <span>Upload Another Artwork</span>
          </button>
        `;
        galleryList.innerHTML = cardsHtml + addMoreHtml;
      }
    });
  }

  /* Handle Apply, Delete & Add More */
  galleryList.addEventListener('click', async (e) => {
    const addMoreBtn = e.target.closest('#btnAddMoreWallpapers');
    if (addMoreBtn) {
      if (fileInput) fileInput.click();
      return;
    }

    const applyBtn = e.target.closest('.btn-apply-wall');
    if (applyBtn) {
      const id = applyBtn.dataset.id;
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
        animeCfgCache = cfg;
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
            cfg.scene = 'golden-hour';
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

  /* Header Upload Button */
  if (uploadBtn) {
    uploadBtn.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }

  /* Dropzone and File Upload logic */
  if (dropzone) {
    dropzone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });
  }

  if (dropContainer) {
    dropContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropContainer.classList.add('dragover');
      if (dropzone) dropzone.classList.add('dragover');
    });

    dropContainer.addEventListener('dragleave', (e) => {
      if (!dropContainer.contains(e.relatedTarget)) {
        dropContainer.classList.remove('dragover');
        if (dropzone) dropzone.classList.remove('dragover');
      }
    });

    dropContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      dropContainer.classList.remove('dragover');
      if (dropzone) dropzone.classList.remove('dragover');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleUpload(file);
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files && fileInput.files[0];
      if (file) handleUpload(file);
      fileInput.value = '';
    });
  }

  async function handleUpload(file) {
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

  /* Listen for storage changes */
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.lcCustomGallery || changes.lcAnimeArt || changes.lcAnime) {
      renderGallery();
    }
  });

  renderGallery();
})();

/* Footer pill actions */
if (globalThis.LCTSBugButton) {
  globalThis.LCTSBugButton(document.getElementById('bug'));
}

const supportUsBtn = document.getElementById('supportUsBtn');
if (supportUsBtn) {
  supportUsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://leetglow.vercel.app/support' });
  });
}

const bmcUsBtn = document.getElementById('bmcUsBtn');
if (bmcUsBtn) {
  bmcUsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://buymeacoffee.com/leetglow' });
  });
}

const rateUsBtn = document.getElementById('rateUsBtn');
if (rateUsBtn) {
  rateUsBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://chromewebstore.google.com/detail/ecpfpadofaimilfpjedgoedhoaglpjdb/reviews' });
  });
}

/* Header "Daily Challenge" badge: opens LeetCode daily coding challenge directly */
const openLeetCodeBtn = document.getElementById('openLeetCodeBtn');
if (openLeetCodeBtn) {
  openLeetCodeBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://leetcode.com/problemset/?topicSlugs=daily' });
  });
}
