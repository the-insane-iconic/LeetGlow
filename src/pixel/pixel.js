/* =============================================================================
   pixel.js  (isolated world, LeetCode) — the Pixel Art theme's moments

   ACCEPTED (Submit): the page gets wrecked, then rewinds. A pixel gunner
   jets in, a rocket blows Submit and Run out of the top bar, a railgun beam
   slices across and the tab bars snap and swing down, a second rocket
   knocks the problem title apart letter by letter. The blasts punch holes
   through the page onto a pixel night sky; their edges burn, smoke rises,
   debris piles up. STAGE CLEAR! shows the Beats %. Then time runs backwards:
   every piece flies home, the holes close, and the real page is back.
   About 4 s; any key or click skips it.

   Other verdicts get a small pixel stamp (GAME OVER, TIME UP, ...), a
   passing Run a 1UP.

   HOW THE PAGE BREAKS WITHOUT BREAKING IT
   Nothing of LeetCode's is moved or changed except one class, .lcpx-broken
   (visibility: hidden, themes/pixel.css), on the pieces while they are away.
   What flies is a COPY of each piece with its computed style inlined and
   its classes, ids and data-e2e-locator stripped, so the page's own rules
   and scripts never see it. The holes, fire and smoke are drawn on canvases
   at 1/3 resolution and scaled up with image-rendering: pixelated, which is
   what makes every effect come out as chunky pixels.

   COST CONTROL
   Nothing runs between moments: no observer, no timer. A moment is one fixed
   layer, one requestAnimationFrame loop, and is removed when it ends; a
   safety timer removes it even if frames stop (a hidden tab), per CLAUDE.md's
   overlay rule. Particles, pieces and cloned nodes are capped.

   TEST HOOKS (scripts/harness/pixel-moment.mjs)
     lcts:pixel       detail = JSON {kind, action, beats, lang, runtime}
     lcts:pixel-seek  detail = ms: freeze at that time (forward only; the
                      simulation runs at a fixed step), -1 ends it
============================================================================= */
(() => {
  'use strict';
  if (globalThis.LCTSPixel) return;

  const root = document.documentElement;
  const SP = globalThis.LCTSPixelSprites;
  const SFX = globalThis.LCTSSounds;
  const on = () => root.getAttribute('data-lc-theme') === 'pixel' && !root.hasAttribute('data-lc-focus');

  /* lcPixel has no settings UI yet; like Web Crawler, it runs on defaults.
     Every moment follows a Run or Submit click, so the tab may play its own
     sound: no offscreen priming. */
  const DEFAULTS = { moments: true, sound: true, volume: 1 };
  let settings = Object.assign({}, DEFAULTS);
  chrome.storage.local.get('lcPixel', (r) => {
    if (r && r.lcPixel) settings = Object.assign({}, DEFAULTS, r.lcPixel);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.lcPixel) settings = Object.assign({}, DEFAULTS, ch.lcPixel.newValue || {});
  });
  function sound(kind) {
    if (settings.sound && SFX) SFX.play(kind, { volume: settings.volume, theme: 'pixel' });
  }

  const PAL = SP.PAL;
  const PX = 3;                  // CSS px per effect pixel
  const G = 2000;                // gravity, px/s²
  const STEP = 1 / 120;
  const Z = 2147482600;          // above the page, below the game theme's title card
  const MAX_PARTS = 1200;
  const MAX_NODES = 1500;        // cloned DOM nodes, all pieces together
  const FONT = '"Pixelify Sans", "Courier New", monospace';
  const FIRE = ['#fff2c2', '#ffcd75', '#ef7d57', '#b13e53', '#4a2a36'];

  /* ---- the timeline (seconds) --------------------------------------------- */
  const T = {
    heroIn: 0.45, rocketA: 0.5, boomA: 0.72, rail: 0.98, rocketB: 1.2, boomB: 1.42,
    banner: 1.75, rewind: 2.75, rewindDur: 0.7, restore: 3.62, heroOut: 3.5, end: 3.95
  };

  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, p) => a + (b - a) * p;
  const clamp01 = (p) => Math.max(0, Math.min(1, p));
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  const shown = (r) => r.width > 4 && r.height > 4 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;

  let live = null;

  /* ---- the pieces ------------------------------------------------------------ */
  function gather() {
    const submit = document.querySelector('[data-e2e-locator="console-submit-button"]');
    if (!submit || !shown(submit.getBoundingClientRect())) return null;
    const pieces = [];
    const add = (el, kind) => {
      if (!el || pieces.some((p) => p.el === el || p.el.contains(el) || el.contains(p.el))) return;
      const r = el.getBoundingClientRect();
      if (shown(r)) pieces.push({ el, kind, r });
    };
    add(submit, 'slab');
    add(document.querySelector('[data-e2e-locator="console-run-button"]'), 'slab');
    const group = document.getElementById('ide-top-btns');
    if (group) group.querySelectorAll('button').forEach((b) => add(b, 'slab'));
    /* the top bar's links and buttons */
    const nav = document.querySelector('#__next nav');
    if (nav) {
      const items = [...nav.querySelectorAll('a, button, img')]
        .filter((el) => !(group && (group.contains(el) || el.contains(group))))
        .filter((el) => { const r = el.getBoundingClientRect(); return shown(r) && r.width < 240 && r.height < 64; });
      items.filter((el) => !items.some((o) => o !== el && o.contains(el))).slice(0, 16).forEach((el) => add(el, 'slab'));
    }
    /* the tab bars across the top of the panels */
    document.querySelectorAll('.flexlayout__tabset_tabbar_outer').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.top < innerHeight * 0.45 && r.width > 140) add(b, 'bar');
    });
    /* the problem's title, letter by letter */
    add(document.querySelector('.flexlayout__tab .text-title-large'), 'text');
    return pieces;
  }

  /* a copy of an element with its computed look inlined; no class, id or
     locator survives, so neither LeetCode's CSS nor its scripts see it */
  const PROPS = ['display', 'box-sizing', 'width', 'height', 'min-width', 'max-width', 'padding-top', 'padding-right',
    'padding-bottom', 'padding-left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius',
    'background-color', 'background-image', 'background-size', 'background-position', 'background-repeat',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
    'text-transform', 'text-align', 'text-decoration-line', 'white-space', 'text-overflow', 'overflow',
    'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'align-items', 'align-self',
    'justify-content', 'column-gap', 'row-gap', 'opacity', 'box-shadow', 'fill', 'stroke', 'stroke-width',
    'vertical-align', 'position', 'top', 'left', 'right', 'bottom', 'transform', 'z-index'];
  let budget = 0;
  function copyOf(el, r) {
    const copy = el.cloneNode(true);
    const a = [el, ...el.querySelectorAll('*')], b = [copy, ...copy.querySelectorAll('*')];
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      if (budget-- > 0) {
        const cs = getComputedStyle(a[i]);
        let css = '';
        for (const p of PROPS) { const v = cs.getPropertyValue(p); if (v) css += p + ':' + v + ';'; }
        b[i].setAttribute('style', css);
      } else if (b[i].style) b[i].style.visibility = 'hidden';
      ['class', 'id', 'data-e2e-locator', 'href', 'tabindex'].forEach((k) => b[i].removeAttribute && b[i].removeAttribute(k));
    }
    const s = copy.style;
    s.setProperty('position', 'absolute', 'important');
    s.setProperty('left', r.left + 'px', 'important');
    s.setProperty('top', r.top + 'px', 'important');
    s.setProperty('width', r.width + 'px', 'important');
    s.setProperty('height', r.height + 'px', 'important');
    s.setProperty('margin', '0', 'important');
    s.setProperty('transform', 'none');
    s.setProperty('visibility', 'visible', 'important');
    s.setProperty('will-change', 'transform');
    s.setProperty('transform-origin', '50% 50%');
    return copy;
  }

  function lettersOf(el) {
    const out = [];
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let t;
    while ((t = walk.nextNode()) && out.length < 80) {
      const cs = getComputedStyle(t.parentElement);
      for (let i = 0; i < t.nodeValue.length && out.length < 80; i++) {
        const ch = t.nodeValue[i];
        if (!ch.trim()) continue;
        range.setStart(t, i); range.setEnd(t, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        const s = document.createElement('span');
        s.textContent = ch;
        s.style.cssText = 'position:absolute;left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height +
          'px;line-height:' + r.height + 'px;white-space:pre;font-family:' + cs.fontFamily + ';font-size:' + cs.fontSize +
          ';font-weight:' + cs.fontWeight + ';font-style:' + cs.fontStyle + ';color:' + cs.color +
          ';will-change:transform;transform-origin:50% 50%';
        out.push({ node: s, r: { left: r.left, top: r.top, width: r.width, height: r.height } });
      }
    }
    return out;
  }

  function body(node, r, kind) {
    return { node, kind, w: r.width, h: r.height, ox: r.left + r.width / 2, oy: r.top + r.height / 2,
             cx: r.left + r.width / 2, cy: r.top + r.height / 2, a: 0, vx: 0, vy: 0, va: 0,
             mode: 'still', lag: Math.random() * 0.22, burn: Math.random() < 0.45 };
  }

  /* ---- the sky behind the page ------------------------------------------------ */
  function paintSky(w, h) {
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a2466'); g.addColorStop(0.45, '#3b3a8f'); g.addColorStop(0.8, '#6b2f6e'); g.addColorStop(1, '#a63d5e');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h / 90; i++) {
      c.fillStyle = Math.random() < 0.8 ? 'rgba(244,244,244,' + rnd(0.25, 0.9).toFixed(2) + ')' : PAL.y;
      c.fillRect(Math.floor(rnd(0, w)), Math.floor(rnd(0, h * 0.7)), 1, 1);
    }
    /* a far city, its windows lit */
    let x = 0;
    while (x < w) {
      const bw = Math.floor(rnd(5, 14)), bh = Math.floor(rnd(h * 0.08, h * 0.32));
      c.fillStyle = '#10111d'; c.fillRect(x, h - bh, bw, bh);
      for (let yy = h - bh + 2; yy < h - 2; yy += 3) {
        for (let xx = x + 1; xx < x + bw - 1; xx += 2) {
          if (Math.random() < 0.28) { c.fillStyle = [PAL.y, PAL.o, PAL.t][Math.floor(rnd(0, 3))]; c.fillRect(xx, yy, 1, 1); }
        }
      }
      x += bw + Math.floor(rnd(0, 3));
    }
    return cv;
  }

  /* ---- the stage ------------------------------------------------------------------ */
  function makeStage() {
    const box = document.createElement('div');
    box.id = 'lcpx-stage';
    const W = innerWidth, H = innerHeight;
    box.style.cssText = 'position:fixed;left:0;top:0;width:' + W + 'px;height:' + H + 'px;z-index:' + Z +
      ';pointer-events:none;overflow:hidden;contain:strict';
    const low = (z) => {
      const cv = document.createElement('canvas');
      cv.width = Math.ceil(W / PX); cv.height = Math.ceil(H / PX);
      cv.style.cssText = 'position:absolute;left:0;top:0;width:' + cv.width * PX + 'px;height:' + cv.height * PX +
        'px;image-rendering:pixelated;z-index:' + z;
      box.appendChild(cv);
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      return { cv, c };
    };
    const holes = low(1);
    const layer = document.createElement('div');
    layer.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;z-index:2';
    box.appendChild(layer);
    const fx = low(3);
    document.body.appendChild(box);
    return { box, holes, layer, fx, W, H, lw: holes.cv.width, lh: holes.cv.height };
  }

  function banner(S, v) {
    const el = document.createElement('div');
    const bits = [];
    if (v.beats) bits.push('BEATS ' + v.beats + '%');
    if (v.lang) bits.push(String(v.lang).toUpperCase());
    if (v.runtime) bits.push(String(v.runtime).toUpperCase());
    el.style.cssText = 'position:absolute;left:0;right:0;top:34%;z-index:4;text-align:center;font-family:' + FONT +
      ';color:' + PAL.y + ';opacity:0;will-change:transform,opacity';
    el.innerHTML = '<div style="font-size:' + Math.round(Math.min(76, S.W / 13)) + 'px;line-height:1;font-weight:700;letter-spacing:.02em;' +
      'text-shadow:4px 4px 0 #0d0e17,-3px 0 0 #0d0e17,3px 0 0 #0d0e17,0 -3px 0 #0d0e17,0 3px 0 #0d0e17,0 0 26px rgba(255,205,117,.55)">STAGE CLEAR!</div>' +
      '<div style="margin-top:14px;font-size:20px;letter-spacing:.08em;color:' + PAL.t +
      ';text-shadow:2px 2px 0 #0d0e17,0 0 12px rgba(115,239,247,.5)"></div>';
    el.lastChild.textContent = bits.length ? bits.join('  ·  ') : 'ACCEPTED';
    S.box.appendChild(el);
    return el;
  }

  /* ---- ACCEPTED: wreck it, then rewind -------------------------------------------- */
  async function wreck(v) {
    const pieces = gather();
    if (!pieces) { stamp(v); return; }
    if (document.fonts && document.fonts.load) { try { await document.fonts.load('40px "Pixelify Sans"'); } catch (e) {} }
    if (live || !on()) return;

    budget = MAX_NODES;
    const bodies = [];
    const made = [];
    pieces.forEach((p) => {
      if (p.kind === 'text') lettersOf(p.el).forEach((l) => made.push({ node: l.node, r: l.r, kind: 'letter' }));
      else made.push({ node: copyOf(p.el, p.r), r: p.r, kind: p.kind });
    });

    const S = makeStage();
    /* bars at the back, letters in front */
    const order = { bar: 0, slab: 1, letter: 2 };
    made.sort((a, b) => order[a.kind] - order[b.kind]).forEach((mm) => { S.layer.appendChild(mm.node); bodies.push(body(mm.node, mm.r, mm.kind)); });
    pieces.forEach((p) => p.el.classList.add('lcpx-broken'));
    const sky = paintSky(S.lw, S.lh);

    const sr = pieces[0].r;
    const bars = bodies.filter((b) => b.kind === 'bar').sort((a, b) => a.ox - b.ox);
    const letters = bodies.filter((b) => b.kind === 'letter');
    const nav = document.querySelector('#__next nav');
    const navBottom = nav ? nav.getBoundingClientRect().bottom : sr.bottom + 8;

    /* where the gunner hovers, and what each shot is aimed at */
    const hero = { x: Math.max(120, Math.min(S.W - 160, sr.left + sr.width / 2 + 40)), y: navBottom + 150, fx: S.W + 60, fy: S.H * 0.8 };
    const aimA = { x: sr.left + sr.width * 0.3, y: sr.top + sr.height / 2 };
    const right = bars.length ? bars[bars.length - 1] : null;
    const aimRail = right ? { x: right.ox + right.w * 0.42, y: right.oy } : { x: S.W - 40, y: navBottom - 20 };
    const left = bars.length > 1 ? bars[0] : null;
    const titleAt = letters.length ? { x: letters[Math.floor(letters.length / 2)].ox, y: letters[0].oy } : null;
    const aimB = titleAt ? { x: titleAt.x, y: titleAt.y - 8 } : left ? { x: left.ox, y: left.oy } : { x: S.W * 0.2, y: navBottom + 30 };

    const m = {
      S, bodies, pieces, sim: 0, start: performance.now(), done: false, paused: false, raf: 0, safety: 0,
      parts: [], holes: [], cuts: [], flashes: [], rockets: [], beam: null, shake: 0, fired: {}, restored: false
    };
    live = m;
    const flag = (k) => (m.fired[k] ? false : (m.fired[k] = true));

    /* -- where the hero is at time t, and the gun's muzzle -- */
    function heroAt(t) {
      if (t < T.heroIn) { const p = easeOut(t / T.heroIn); return { x: lerp(hero.fx, hero.x, p), y: lerp(hero.fy, hero.y, p) }; }
      if (t > T.heroOut) { const p = (t - T.heroOut) / 0.45; return { x: hero.x + p * p * 900, y: hero.y - p * p * 700 }; }
      return { x: hero.x, y: hero.y + Math.sin(t * 5) * 5 };
    }
    function aimAt(t) {
      if (t < T.rocketA + 0.08) return aimA;
      if (t < T.rail + 0.1) return aimRail;
      if (t < T.rocketB + 0.12) return aimB;
      const h = heroAt(t);
      return { x: h.x + 200, y: h.y - 120 };
    }
    const GUN = SP.frame('gun');
    function muzzle(t) {
      const h = heroAt(t), a = aimAt(t);
      const sx = h.x + (SP.SHOULDER.x - 6) * PX * (a.x < h.x ? -1 : 1), sy = h.y + (SP.SHOULDER.y - 9) * PX;
      const ang = Math.atan2(a.y - sy, a.x - sx);
      const len = (GUN.width - SP.GUN_GRIP.x) * PX;
      return { x: sx + Math.cos(ang) * len, y: sy + Math.sin(ang) * len, ang, sx, sy };
    }

    /* -- particles -- */
    function part(p) { if (m.parts.length < MAX_PARTS) m.parts.push(p); }
    function flame(x, y, speed, life, size) {
      const a = rnd(0, Math.PI * 2), s = rnd(0, speed);
      part({ type: 'flame', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 + rnd(-20, 40), life, max: life, size: size || 1 });
    }
    function smoke(x, y, life) {
      part({ type: 'smoke', x, y, vx: rnd(-30, 30), vy: rnd(-90, -25), life, max: life, size: rnd(2, 3) });
    }
    function spark(x, y, speed) {
      const a = rnd(0, Math.PI * 2), s = rnd(speed * 0.4, speed);
      part({ type: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 150, life: rnd(0.25, 0.6), max: 0.6, size: 1 });
    }

    function hole(x, y, R) {
      const pts = [];
      for (let i = 0; i < 22; i++) pts.push(rnd(0.72, 1.12));
      m.holes.push({ x, y, R, pts, born: m.sim });
    }

    function hingeFrom(b, hitX) {
      const pinLeft = hitX > b.cx;
      b.mode = 'hinge';
      b.px = pinLeft ? b.ox - b.w / 2 : b.ox + b.w / 2; b.py = b.cy;
      b.rx = pinLeft ? b.w / 2 : -b.w / 2;
      b.snapAt = m.sim + rnd(0.55, 1.0);
    }
    function launch(b, dx, dy, f) {
      if (b.mode === 'hinge') { b.va += (dx > 0 ? 1 : -1) * rnd(1.5, 3); return; }
      b.mode = 'fly';
      const d = Math.hypot(dx, dy) + 1;
      b.vx += dx / d * f * rnd(0.6, 1.2) + rnd(-60, 60);
      b.vy += dy / d * f * 0.55 - rnd(260, 560);
      b.va += rnd(-9, 9) * Math.min(1, 60 / Math.max(20, b.w));
    }

    function explode(x, y, R) {
      m.flashes.push({ x, y, R, born: m.sim });
      /* a fireball: a dense slow core that billows up, a fast outer burst */
      for (let i = 0; i < 90; i++) flame(x + rnd(-R, R) * 0.35, y + rnd(-R, R) * 0.3, rnd(40, 220), rnd(0.45, 1.05), Math.random() < 0.55 ? 3 : 2);
      for (let i = 0; i < 60; i++) flame(x, y, rnd(200, 520), rnd(0.2, 0.55), Math.random() < 0.3 ? 2 : 1);
      for (let i = 0; i < 34; i++) spark(x, y, 820);
      for (let i = 0; i < 26; i++) smoke(x + rnd(-R, R) * 0.6, y + rnd(-R, R) * 0.4, rnd(1.0, 1.9));
      hole(x, y, R);
      m.shake = 0.32;
      bodies.forEach((b) => {
        const dx = b.cx - x, dy = b.cy - y, d = Math.hypot(dx, dy);
        const reach = R * 2.8 + Math.max(b.w, b.h) / 2;
        if (d > reach) return;
        if (b.kind === 'bar') { if (b.mode === 'still') hingeFrom(b, x); b.va += (dx > 0 ? 1 : -1) * rnd(1, 2.5); return; }
        launch(b, dx, dy, 950 * (1 - d / reach) + 120);
      });
    }

    function railgun(from, to) {
      const ang = Math.atan2(to.y - from.y, to.x - from.x), ux = Math.cos(ang), uy = Math.sin(ang);
      /* to the edge of the screen */
      let len = 0;
      while (len < 4000) { const x = from.x + ux * len, y = from.y + uy * len; if (x < -20 || x > S.W + 20 || y < -20 || y > S.H + 20) break; len += 8; }
      m.beam = { x0: from.x, y0: from.y, x1: from.x + ux * len, y1: from.y + uy * len, born: m.sim };
      m.cuts.push({ x0: from.x + ux * 30, y0: from.y + uy * 30, x1: from.x + ux * len, y1: from.y + uy * len, born: m.sim });
      m.shake = 0.18;
      bodies.forEach((b) => {
        for (let s = 20; s < len; s += 8) {
          const x = from.x + ux * s, y = from.y + uy * s;
          if (Math.abs(x - b.cx) < b.w / 2 && Math.abs(y - b.cy) < b.h / 2) {
            for (let i = 0; i < 8; i++) spark(x, y, 500);
            if (b.kind === 'bar') { if (b.mode === 'still') hingeFrom(b, x); b.va += rnd(1, 2) * (x > b.cx ? 1 : -1); }
            else launch(b, ux * 100 + rnd(-40, 40), uy * 100 - 60, 720);
            return;
          }
        }
      });
    }

    /* -- the simulation, one fixed step -- */
    function step(dt) {
      const t = m.sim;
      const rewinding = t >= T.rewind;

      if (t >= T.rocketA && flag('rA')) { const mz = muzzle(t); m.rockets.push({ x0: mz.x, y0: mz.y, x1: aimA.x, y1: aimA.y, t0: t, dur: T.boomA - T.rocketA, boom: 66 }); }
      if (t >= T.rail && flag('rail')) { const mz = muzzle(t); railgun(mz, aimRail); }
      if (t >= T.rocketB && flag('rB')) { const mz = muzzle(t); m.rockets.push({ x0: mz.x, y0: mz.y, x1: aimB.x, y1: aimB.y, t0: t, dur: T.boomB - T.rocketB, boom: 58 }); }

      /* rockets: fly with a smoke trail, blow up on arrival */
      m.rockets.forEach((r) => {
        if (r.done) return;
        const p = (t - r.t0) / r.dur;
        if (p >= 1) { r.done = true; explode(r.x1, r.y1, r.boom); return; }
        const x = lerp(r.x0, r.x1, p), y = lerp(r.y0, r.y1, p) - Math.sin(p * Math.PI) * 30;
        if (Math.random() < 0.9) smoke(x, y, rnd(0.3, 0.6));
        if (Math.random() < 0.8) flame(x, y, 30, 0.14);
      });

      /* the jetpack */
      if (t < T.end) {
        const h = heroAt(t);
        if (Math.random() < 0.85) part({ type: 'flame', x: h.x - 12 * (aimAt(t).x < h.x ? -1 : 1), y: h.y + 22, vx: rnd(-20, 20), vy: rnd(120, 260), life: 0.16, max: 0.16, size: 1 });
      }

      /* burning edges while the fire is lit */
      if (!rewinding) {
        m.holes.forEach((hl) => {
          for (let k = 0; k < 2; k++) if (Math.random() < 0.6) { const a = rnd(0, Math.PI * 2); flame(hl.x + Math.cos(a) * hl.R, hl.y + Math.sin(a) * hl.R * 0.9, 30, rnd(0.3, 0.7), Math.random() < 0.4 ? 2 : 1); }
          if (Math.random() < 0.2) smoke(hl.x + rnd(-hl.R, hl.R), hl.y - hl.R * 0.5, rnd(0.9, 1.6));
        });
        m.cuts.forEach((c) => {
          if (Math.random() < 0.8) { const p = Math.random(); flame(lerp(c.x0, c.x1, p), lerp(c.y0, c.y1, p), 20, rnd(0.25, 0.5)); }
        });
        bodies.forEach((b) => { if (b.mode === 'rest' && b.burn && Math.random() < 0.18) flame(b.cx + rnd(-b.w / 2, b.w / 2), b.cy - 4, 18, rnd(0.25, 0.5)); });
      }

      /* the pieces */
      bodies.forEach((b) => {
        if (rewinding) {
          if (!b.from) {
            b.from = true; b.fx = b.cx; b.fy = b.cy;
            b.fa = Math.atan2(Math.sin(b.a), Math.cos(b.a));
          }
          const p = ease(clamp01((t - T.rewind - b.lag) / T.rewindDur));
          b.cx = lerp(b.fx, b.ox, p); b.cy = lerp(b.fy, b.oy, p); b.a = lerp(b.fa, 0, p);
          return;
        }
        if (b.mode === 'hinge') {
          const I = b.w * b.w / 3;
          b.va += G * (b.cx - b.px) / I * dt;
          b.va *= 0.994;
          b.a += b.va * dt;
          b.cx = b.px + Math.cos(b.a) * b.rx; b.cy = b.py + Math.sin(b.a) * b.rx;
          if (t >= b.snapAt) {
            b.mode = 'fly';
            b.vx = -b.va * (b.cy - b.py); b.vy = b.va * (b.cx - b.px);
            for (let i = 0; i < 10; i++) spark(b.px, b.py, 400);
          }
          return;
        }
        if (b.mode !== 'fly') return;
        b.vy += G * dt;
        b.cx += b.vx * dt; b.cy += b.vy * dt; b.a += b.va * dt;
        const ex = Math.abs(b.w / 2 * Math.cos(b.a)) + Math.abs(b.h / 2 * Math.sin(b.a));
        const ey = Math.abs(b.w / 2 * Math.sin(b.a)) + Math.abs(b.h / 2 * Math.cos(b.a));
        if (b.cx - ex < 0) { b.cx = ex; b.vx = Math.abs(b.vx) * 0.4; }
        if (b.cx + ex > S.W) { b.cx = S.W - ex; b.vx = -Math.abs(b.vx) * 0.4; }
        if (b.cy + ey > S.H) {
          b.cy = S.H - ey; b.vy = -b.vy * 0.28; b.vx *= 0.7; b.va *= 0.5;
          /* settle flat */
          const flat = Math.round(b.a / Math.PI) * Math.PI;
          b.a += (flat - b.a) * 0.25;
          if (Math.abs(b.vy) < 60) { b.vy = 0; b.va = 0; b.mode = 'rest'; b.a = flat; b.cy = S.H - b.h / 2; }
        }
      });

      /* particles */
      for (let i = m.parts.length - 1; i >= 0; i--) {
        const p = m.parts[i];
        p.life -= rewinding ? dt * 2.5 : dt;
        if (p.life <= 0) { m.parts.splice(i, 1); continue; }
        /* the blasts sit near the top of the screen: flames drag to a
           billowing ball and rise only gently, so it stays in view */
        if (p.type === 'flame') { p.vy -= 160 * dt; p.vx *= 0.95; p.vy *= 0.95; }
        else if (p.type === 'smoke') { p.vy -= 30 * dt; p.vx *= 0.99; }
        else { p.vy += G * 0.7 * dt; }
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      if (m.shake > 0) m.shake -= dt;

      if (t >= T.restore && !m.restored) {
        m.restored = true;
        pieces.forEach((p) => p.el.classList.remove('lcpx-broken'));
        S.layer.remove();
      }
    }

    /* -- drawing -- */
    const L = (val) => Math.round(val / PX);
    function poly(c, x, y, R, pts, s) {
      c.beginPath();
      pts.forEach((f, i) => {
        const a = i / pts.length * Math.PI * 2;
        const px = L(x + Math.cos(a) * R * f * s), py = L(y + Math.sin(a) * R * f * s * 0.9);
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      });
      c.closePath();
    }
    const heat = (age) => FIRE[Math.min(FIRE.length - 1, Math.floor(age / 0.35))];
    function drawHoles(t) {
      const c = S.holes.c;
      c.clearRect(0, 0, S.lw, S.lh);
      const close = t >= T.rewind ? 1 - ease(clamp01((t - T.rewind) / 0.6)) : 1;
      m.holes.forEach((h) => {
        const s = Math.min(1, (t - h.born) / 0.08) * close;
        if (s <= 0.02) return;
        c.fillStyle = 'rgba(13,14,23,.85)';                         // scorch
        poly(c, h.x, h.y, h.R * 1.18, h.pts, s); c.fill();
        c.save(); poly(c, h.x, h.y, h.R, h.pts, s); c.clip(); c.drawImage(sky, 0, 0); c.restore();
        c.strokeStyle = heat(t - h.born); c.lineWidth = 1;
        poly(c, h.x, h.y, h.R, h.pts, s); c.stroke();
      });
      m.cuts.forEach((k) => {
        const grow = Math.min(1, (t - k.born) / 0.06) * close;
        if (grow <= 0.02) return;
        const ang = Math.atan2(k.y1 - k.y0, k.x1 - k.x0), nx = -Math.sin(ang), ny = Math.cos(ang);
        const hw = 10 * grow;
        const quad = (w) => {
          c.beginPath();
          c.moveTo(L(k.x0 + nx * w), L(k.y0 + ny * w)); c.lineTo(L(k.x1 + nx * w), L(k.y1 + ny * w));
          c.lineTo(L(k.x1 - nx * w), L(k.y1 - ny * w)); c.lineTo(L(k.x0 - nx * w), L(k.y0 - ny * w)); c.closePath();
        };
        c.fillStyle = 'rgba(13,14,23,.85)'; quad(hw + 5); c.fill();
        c.save(); quad(hw); c.clip(); c.drawImage(sky, 0, 0); c.restore();
        c.strokeStyle = heat(t - k.born); c.lineWidth = 1; quad(hw); c.stroke();
      });
    }

    function drawSprite(c, img, x, y, flip) {
      c.save();
      c.translate(L(x), L(y));
      if (flip) c.scale(-1, 1);
      c.drawImage(img, -Math.round(img.width / 2), -Math.round(img.height / 2));
      c.restore();
    }

    const SHOTS = [T.rocketA, T.rail, T.rocketB];
    function drawFx(t) {
      const c = S.fx.c;
      c.clearRect(0, 0, S.lw, S.lh);
      /* particles */
      m.parts.forEach((p) => {
        const age = 1 - p.life / p.max;
        if (p.type === 'flame') c.fillStyle = FIRE[Math.min(FIRE.length - 1, Math.floor(age * FIRE.length))];
        else if (p.type === 'smoke') c.fillStyle = 'rgba(86,90,112,' + (0.7 * (1 - age)).toFixed(2) + ')';
        else c.fillStyle = age < 0.5 ? PAL.w : PAL.y;
        /* flames shrink as they cool; smoke spreads */
        const s = p.type === 'smoke' ? Math.round(p.size + age * 5) : p.type === 'flame' ? Math.max(1, Math.round(p.size * (1.2 - age))) : p.size;
        c.fillRect(L(p.x) - (s >> 1), L(p.y) - (s >> 1), s, s);
      });
      /* blast flashes and shock rings */
      m.flashes.forEach((f) => {
        const a = t - f.born;
        if (a < 0.09) { c.fillStyle = 'rgba(255,248,220,' + (1 - a / 0.09).toFixed(2) + ')'; c.beginPath(); c.arc(L(f.x), L(f.y), L(f.R * (0.6 + a * 8)), 0, Math.PI * 2); c.fill(); }
        if (a < 0.3) { c.strokeStyle = 'rgba(255,205,117,' + (1 - a / 0.3).toFixed(2) + ')'; c.lineWidth = 1; c.beginPath(); c.arc(L(f.x), L(f.y), L(f.R * (0.5 + a * 7)), 0, Math.PI * 2); c.stroke(); }
      });
      /* rockets */
      const RK = SP.frame('rocket');
      m.rockets.forEach((r) => {
        if (r.done) return;
        const p = (t - r.t0) / r.dur;
        if (p < 0) return;
        const x = lerp(r.x0, r.x1, p), y = lerp(r.y0, r.y1, p) - Math.sin(p * Math.PI) * 30;
        const ang = Math.atan2(r.y1 - r.y0 - Math.cos(p * Math.PI) * 30 * Math.PI, r.x1 - r.x0);
        c.save(); c.translate(L(x), L(y)); c.rotate(ang); c.drawImage(RK, -3, -2); c.restore();
      });
      /* the railgun beam */
      if (m.beam && t - m.beam.born < 0.2) {
        const k = 1 - (t - m.beam.born) / 0.2;
        [[5, 'rgba(65,166,246,' + (0.5 * k).toFixed(2) + ')'], [3, 'rgba(115,239,247,' + k.toFixed(2) + ')'], [1, 'rgba(255,255,255,' + k.toFixed(2) + ')']].forEach(([w, col]) => {
          c.strokeStyle = col; c.lineWidth = w;
          c.beginPath(); c.moveTo(L(m.beam.x0), L(m.beam.y0)); c.lineTo(L(m.beam.x1), L(m.beam.y1)); c.stroke();
        });
      }
      /* the gunner */
      if (t < T.end) {
        const h = heroAt(t), aim = aimAt(t), flip = aim.x < h.x;
        drawSprite(c, SP.outlined(Math.floor(t / 0.12) % 2 ? 'hero-a' : 'hero-b', 'rgba(244,244,244,.85)'), h.x, h.y, flip);
        const mz = muzzle(t);
        const recoil = SHOTS.some((s) => t >= s && t < s + 0.08) ? -2 : 0;
        const gun = SP.outlined('gun', 'rgba(244,244,244,.85)');
        c.save();
        c.translate(L(mz.sx), L(mz.sy));
        c.rotate(mz.ang);
        c.drawImage(gun, -SP.GUN_GRIP.x - 1 + recoil, -SP.GUN_GRIP.y - 1);
        c.restore();
        if (SHOTS.some((s) => t >= s && t < s + 0.06)) {          // muzzle flash
          c.fillStyle = PAL.w; c.fillRect(L(mz.x) - 2, L(mz.y) - 2, 4, 4);
          c.fillStyle = PAL.y; c.fillRect(L(mz.x) - 3, L(mz.y) - 1, 6, 2); c.fillRect(L(mz.x) - 1, L(mz.y) - 3, 2, 6);
        }
      }
      /* the real page is back: a quick white flash where each piece lands */
      if (m.restored && t < T.restore + 0.14) {
        c.fillStyle = 'rgba(244,244,244,' + (0.5 * (1 - (t - T.restore) / 0.14)).toFixed(2) + ')';
        pieces.forEach((p) => c.fillRect(L(p.r.left), L(p.r.top), L(p.r.width), L(p.r.height)));
      }
    }

    let bannerEl = null;
    function draw() {
      const t = m.sim;
      drawHoles(t);
      if (!m.restored) {
        bodies.forEach((b) => {
          const key = b.cx.toFixed(1) + ',' + b.cy.toFixed(1) + ',' + b.a.toFixed(3);
          if (b.key === key) return;
          b.key = key;
          b.node.style.transform = 'translate(' + (b.cx - b.ox).toFixed(1) + 'px,' + (b.cy - b.oy).toFixed(1) + 'px) rotate(' + b.a.toFixed(3) + 'rad)';
        });
      }
      drawFx(t);
      S.box.style.transform = m.shake > 0 ? 'translate(' + Math.round(rnd(-5, 5)) + 'px,' + Math.round(rnd(-4, 4)) + 'px)' : '';
      /* the banner pops in stepped, like a sprite, and drops out before the rewind */
      if (t >= T.banner) {
        if (!bannerEl) bannerEl = banner(S, v);
        const s = [0.4, 0.8, 1.14, 1][Math.min(3, Math.floor((t - T.banner) / 0.05))];
        const drop = t > T.rewind - 0.15 ? Math.pow((t - (T.rewind - 0.15)) * 5, 2) * 120 : 0;
        bannerEl.style.opacity = drop > 400 ? '0' : '1';
        bannerEl.style.transform = 'translateY(' + drop.toFixed(0) + 'px) scale(' + s + ')';
      }
    }

    run(m, draw, step, T.end);
    sound('ac');
  }

  /* ---- the small stamps ------------------------------------------------------------ */
  const STAMPS = {
    run: { text: '1UP!', sub: 'TESTS PASSED', col: 'y' },
    wa: { text: 'GAME OVER', sub: 'WRONG ANSWER', col: 'r' },
    'wa-run': { text: 'MISS!', sub: 'WRONG ANSWER', col: 'o' },
    tle: { text: 'TIME UP!', sub: 'TIME LIMIT EXCEEDED', col: 'y' },
    mle: { text: 'OUT OF MEMORY', sub: 'MEMORY LIMIT EXCEEDED', col: 'o' },
    err: { text: 'BUG!', sub: 'ERROR', col: 'r' },
    ac: { text: 'STAGE CLEAR!', sub: 'ACCEPTED', col: 'y' }
  };
  function stamp(v) {
    if (live) return;
    const key = v.kind === 'wa' && v.action === 'run' ? 'wa-run' : v.kind;
    const st = STAMPS[key] || STAMPS.err;
    const S = makeStage();
    const anchor = document.getElementById('ide-top-btns');
    const ar = anchor ? anchor.getBoundingClientRect() : { left: S.W / 2, width: 0, bottom: 60 };
    const x = Math.min(S.W - 180, Math.max(180, ar.left + ar.width / 2));
    const el = document.createElement('div');
    el.style.cssText = 'position:absolute;left:' + (x - 200) + 'px;width:400px;top:' + (ar.bottom + 36) + 'px;text-align:center;font-family:' + FONT +
      ';z-index:4;will-change:transform,opacity';
    el.innerHTML = '<div style="font-size:40px;font-weight:700;line-height:1;color:' + PAL[st.col] +
      ';text-shadow:3px 3px 0 #0d0e17,-2px 0 0 #0d0e17,2px 0 0 #0d0e17,0 -2px 0 #0d0e17,0 2px 0 #0d0e17"></div>' +
      '<div style="margin-top:6px;font-size:14px;letter-spacing:.1em;color:#f4f4f4;text-shadow:2px 2px 0 #0d0e17"></div>';
    el.firstChild.textContent = st.text;
    el.lastChild.textContent = String(v.kind === 'err' && v.label ? v.label : st.sub).toUpperCase();
    S.box.appendChild(el);
    const m = { S, sim: 0, start: performance.now(), done: false, paused: false, raf: 0, safety: 0, pieces: [], parts: [] };
    live = m;
    const D = 1.5, cx = x, cy = ar.bottom + 60;
    const bad = key !== 'run';
    run(m, () => {
      const t = m.sim, c = S.fx.c;
      const s = [0.5, 1.2, 0.95, 1][Math.min(3, Math.floor(t / 0.05))];
      let y = key === 'run' ? -Math.min(1, t / 0.6) * 18 : 0;
      if (t > D - 0.25) y += Math.pow((t - (D - 0.25)) * 4, 2) * 30;
      const shake = key === 'wa' && t < 0.35 ? Math.round(rnd(-4, 4)) : 0;
      el.style.transform = 'translate(' + shake + 'px,' + y.toFixed(0) + 'px) scale(' + s + ')';
      el.style.opacity = t > D - 0.1 ? '0' : '1';
      c.clearRect(0, 0, S.lw, S.lh);
      m.parts.forEach((p) => {
        const age = 1 - p.life / p.max;
        c.fillStyle = bad ? 'rgba(74,79,99,' + (0.6 * (1 - age)).toFixed(2) + ')' : (age < 0.5 ? PAL.w : PAL.y);
        c.fillRect(Math.round(p.x / PX), Math.round(p.y / PX), bad ? 2 : 1, bad ? 2 : 1);
      });
    }, (dt) => {
      if (m.sim < 0.3 && Math.random() < 0.7) {
        const a = rnd(0, Math.PI * 2), sp = rnd(40, bad ? 120 : 320);
        m.parts.push({ x: cx + rnd(-60, 60), y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, life: 0.8, max: 0.8 });
      }
      for (let i = m.parts.length - 1; i >= 0; i--) {
        const p = m.parts[i];
        p.life -= dt;
        if (p.life <= 0) { m.parts.splice(i, 1); continue; }
        p.vy += (bad ? -40 : 900) * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      }
    }, D);
    sound(v.kind === 'wa' && v.action === 'submit' ? 'wa-submit' : v.kind);
  }

  /* ---- the loop ------------------------------------------------------------------------ */
  function run(m, draw, step, dur) {
    const tick = () => {
      if (m.done) return;
      /* a hidden tab ends it -- except a moment frozen by the test hook, whose
         window Chrome may report hidden while it is covered */
      if (!on() || (!m.paused && document.visibilityState !== 'visible')) { finish(m); return; }
      if (!m.paused) {
        const target = Math.min(dur, (performance.now() - m.start) / 1000);
        while (m.sim + STEP <= target) { step(STEP); m.sim += STEP; }
        draw();
        if (m.sim + STEP > dur) { finish(m); return; }
      }
      m.raf = requestAnimationFrame(tick);
    };
    m.seek = (sec) => {
      m.paused = true;
      clearTimeout(m.safety);
      while (m.sim + STEP <= Math.min(dur, sec)) { step(STEP); m.sim += STEP; }
      draw();
    };
    m.safety = setTimeout(() => finish(m), (dur + 0.9) * 1000);
    m.skip = () => finish(m);
    addEventListener('keydown', m.skip, true);
    addEventListener('pointerdown', m.skip, true);
    draw();
    m.raf = requestAnimationFrame(tick);
  }

  function finish(m) {
    if (!m || m.done) return;
    m.done = true;
    cancelAnimationFrame(m.raf);
    clearTimeout(m.safety);
    removeEventListener('keydown', m.skip, true);
    removeEventListener('pointerdown', m.skip, true);
    (m.pieces || []).forEach((p) => p.el.classList.remove('lcpx-broken'));
    if (m.S && m.S.box) m.S.box.remove();
    if (live === m) live = null;
  }

  /* ---- wiring ------------------------------------------------------------------------- */
  function play(v) {
    if (!on() || !settings.moments || live || document.visibilityState !== 'visible') return;
    if (v.kind === 'ac' && v.action === 'submit') wreck(v); else stamp(v);
  }
  if (globalThis.LCTSVerdict) globalThis.LCTSVerdict.subscribe((v) => play(v));
  document.addEventListener('lcts:pixel', (e) => {
    try { play(JSON.parse(e.detail)); } catch (err) {}
  });
  document.addEventListener('lcts:pixel-seek', (e) => {
    const ms = Number(e.detail);
    if (!live) return;
    if (ms < 0) finish(live); else if (live.seek) live.seek(ms / 1000);
  });
  /* switching theme mid-moment ends it (the loop also checks every frame) */
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.lcThemeStudio && live) finish(live);
  });

  globalThis.LCTSPixel = { play };
})();
