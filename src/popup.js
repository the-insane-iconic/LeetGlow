/* Popup: render four theme cards with live mini-editor previews, persist the
   choice to storage (the content script applies it live to open LeetCode tabs). */

const KEY = 'lcThemeStudio';
const DEFAULT = 'anime';

/* Per-theme preview palette (mirrors the real editor colors). */
const THEMES = {
  paper: {
    name: 'Vintage Paper', desc: 'kraft paper, iron-gall ink', accent: '#6d190e',
    pv: { bg:'#ad9362', text:'#241d14', line:'#483c25', kw:'#650500',
          fn:'#00208a', num:'#00343f', var:'#1a2d5a', com:'#332e25', pn:'#3a2d1d' },
    tex: 'grain'
  },
  sakura: {
    name: 'Sakura Night', desc: 'petal pink on plum indigo', accent: '#ff7eb6',
    pv: { bg:'#211d3c', text:'#ece9ff', line:'#4a3f80', kw:'#ff7eb6',
          fn:'#6ee7f0', num:'#b98cff', var:'#ece9ff', com:'#6b6395', pn:'#ff9ec8' },
    tex: 'stars'
  },
  grid: {
    name: 'Grid', desc: 'drafting table, hard edges', accent: '#35e0a1',
    pv: { bg:'#141c28', text:'#d7e0ec', line:'#3a4a5f', kw:'#58a6ff',
          fn:'#35e0a1', num:'#ffa657', var:'#d7e0ec', com:'#56687f', pn:'#79c0ff' },
    tex: 'grid'
  },
  bloom: {
    name: 'Orchid', desc: 'silk velvet, rose-gold trim', accent: '#e3a88f',
    pv: { bg:'#221730', text:'#f4ecf7', line:'#5b4272', kw:'#ff9ec9',
          fn:'#7fe3c0', num:'#d89bff', var:'#f4ecf7', com:'#9b86a9', pn:'#e3a88f' },
    tex: 'nap'
  },
  crawler: {
    name: 'Web Crawler', desc: 'charcoal web, crimson thread', accent: '#e0223f',
    pv: { bg:'#17171c', text:'#eceaf2', line:'#38384a', kw:'#4db2ff',
          fn:'#4ce0b3', num:'#c792ea', var:'#eceaf2', com:'#6e6e7a', pn:'#ff8aa8' },
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
      pv: t ? { bg: t.scrim, text: ink.variable, line: t.roles['--lc-text3'], kw: ink.keyword,
                fn: ink.func, num: ink.number, var: ink.param, com: ink.comment, pn: ink.operator }
            : { bg:'#150b21', text:'#f3f0f7', line:'#9b8dad', kw:'#f98dc1', fn:'#cb9cfa', num:'#f5993d', var:'#d7c6e9', com:'#9b8dad', pn:'#dab9c9' },
      tex: 'anime'
    };
  })(),
  /* WIP (see CLAUDE_ANKIT.md): only the Easy tier ("The First Realm") has
     art, so the card previews that. Medium/Hard get a plain dark fallback
     on the real page until their own art exists. */
  game: {
    name: 'Adventure', desc: 'RPG night realm, quests and loot', accent: '#7dd3fc',
    /* the theme's own dark inks (INK.game in monaco-ink.js) */
    pv: { bg:'#0b1a2e', text:'#eef2ea', line:'#6b86a6', kw:'#d4af6a',
          fn:'#8fb8e0', num:'#7fc9c0', var:'#eef2ea', com:'#8aa0b8', pn:'#d7c9a0' },
    tex: 'game'
  },
  /* Pixel Art: its own inks (INK.pixel), and the squad stands in the corner */
  pixel: {
    name: 'Pixel Art', desc: '8-bit, Accepted = boom', accent: '#ffcd75',
    pv: { bg:'#262b44', text:'#f4f4f4', line:'#566c86', kw:'#ffcd75',
          fn:'#73eff7', num:'#c9a0ff', var:'#c5d3e0', com:'#8b9bb4', pn:'#ffa36b' },
    tex: 'pixel'
  },
  off: {
    name: 'Off', desc: 'hand the page back to LeetCode', accent: '#8a8f98',
    pv: { bg:'#1a1a1a', text:'#eff1f6', line:'#5c6370', kw:'#c678dd',
          fn:'#61afef', num:'#d19a66', var:'#eff1f6', com:'#7f848e', pn:'#abb2bf' },
    tex: 'none'
  }
};
const ORDER = ['paper', 'anime', 'sakura', 'grid', 'bloom', 'game', 'crawler', 'pixel', 'off'];
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
function k(s){return {t:'kw',s};}  function f(s){return {t:'fn',s};}
function n(s){return {t:'num',s};} function v(s){return {t:'var',s};}
function c(s){return {t:'com',s};} function pn(s){return {t:'pn',s};}

function esc(str){ return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
    card.addEventListener('click', () => choose(id));
    grid.appendChild(card);
    if (id === 'anime') {
      paintAnimeCard(card.querySelector('.preview'));
      grid.appendChild(studioButton);
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
    if (custom) { urls = [res.lcAnimeArt.blur]; inkFrom = 'custom'; }
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
    } else if (urls[0]) {
      preview.style.setProperty('--pv-scene', `url("${urls[0]}")`);
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
  document.getElementById('studio').classList.toggle('lit', id === 'anime');
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
} catch (e) {}

/* boot */
chrome.storage.local.get(KEY, (res) => {
  const selected = (res && res[KEY]) || DEFAULT;
  render(selected);
  document.getElementById('studio').classList.toggle('lit', selected === 'anime');
});

document.getElementById('studio').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/studio.html') });
  window.close();
});

/* keyboard: arrow keys move between radio cards and select, as a radio group does */
document.addEventListener('keydown', (e) => {
  if (!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft'].includes(e.key)) return;
  const cards = [...document.querySelectorAll('.card')];
  const idx = cards.findIndex((c) => c === document.activeElement);
  if (idx === -1) return;
  e.preventDefault();
  const dir = (e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1;
  const next = cards[(idx + dir + cards.length) % cards.length];
  next.focus();
  choose(next.dataset.id);
});

/* Premium status & Links (src/support.js & src/premium.js) */
const premBtn = document.getElementById('premiumStatus');
if (premBtn) {
  premBtn.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/studio.html') });
    window.close();
  });
  if (globalThis.LeetGlowPremium) {
    globalThis.LeetGlowPremium.checkServerEntitlement().then((res) => {
      const dot = document.getElementById('popupBadgeDot');
      if (dot) {
        dot.style.background = res && res.active ? '#22c55e' : '#ef4444';
        dot.style.boxShadow = res && res.active ? '0 0 8px #22c55e' : '0 0 6px #ef4444';
      }
      premBtn.title = res && res.active ? 'LeetGlow Premium Active (Click to manage)' : 'LeetGlow Premium Inactive (Click to upgrade)';
    });
  }
}
if (globalThis.LCTSBugButton) globalThis.LCTSBugButton(document.getElementById('bug'));
if (globalThis.LCTSConnectButton) globalThis.LCTSConnectButton(document.getElementById('connect'));
