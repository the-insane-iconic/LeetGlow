/* =============================================================================
   share.js  (isolated world, LeetCode) — the "episode cleared" share card

   After an Accepted SUBMIT, a small toast offers a card made for this clear:
   the user's own scene (or theme colours), the problem, its arc, Beats %,
   language, runtime and their day streak. One click opens it with a caption
   already written and four buttons: LinkedIn, X, Copy image, Download.
   LinkedIn and X take text through a link but not an image, so those buttons
   copy the card to the clipboard first and then open the composer with the
   text filled in -- the user pastes (Ctrl/Cmd+V) and posts.

   Everything is drawn here, locally, into a canvas; nothing is uploaded. Off
   with one click ("Don't show again" on the toast, or Anime Studio), stored
   as lcShare.enabled.

   STATS (lcStats, local only): the days with an Accepted submission, for the
   streak, and a count of clears. Recorded on every Accepted submit while a
   theme is on, whether or not the card is offered.

   COST: nothing until an Accepted submit. The card is one 1200x630 canvas,
   drawn once (~30 ms), then an image; the toast and dialog are removed when
   closed.
============================================================================= */
(() => {
  if (globalThis.LCTSShare) return;

  /* where a viewer of the post can get the extension */
  const SHARE_URL = 'https://extensions.vinaytz.com/theme-studio';
  const W = 1200, H = 630;
  const root = document.documentElement;
  const themeId = () => root.getAttribute('data-lc-theme');

  let enabled = true, japanese = true;
  chrome.storage.local.get(['lcShare', 'lcAnime'], (r) => {
    enabled = !(r.lcShare && r.lcShare.enabled === false);
    japanese = !(r.lcAnime && r.lcAnime.japanese === false);
  });
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area === 'local' && ch.lcShare) enabled = !(ch.lcShare.newValue && ch.lcShare.newValue.enabled === false);
    if (area === 'local' && ch.lcAnime) japanese = !(ch.lcAnime.newValue && ch.lcAnime.newValue.japanese === false);
  });
  const turnOff = () => { enabled = false; chrome.storage.local.set({ lcShare: { enabled: false } }); };

  /* ---- streak ------------------------------------------------------------- */
  const localDay = (d) => { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  function recordClear() {
    return new Promise((res) => {
      chrome.storage.local.get('lcStats', (r) => {
        const st = r.lcStats || { days: [], clears: 0 };
        const today = localDay();
        if (st.days[st.days.length - 1] !== today) st.days.push(today);
        if (st.days.length > 400) st.days = st.days.slice(-400);
        st.clears = (st.clears || 0) + 1;
        chrome.storage.local.set({ lcStats: st });
        /* consecutive days ending today */
        const set = new Set(st.days);
        let streak = 0; const d = new Date();
        while (set.has(localDay(d))) { streak++; d.setDate(d.getDate() - 1); }
        res({ streak, clears: st.clears });
      });
    });
  }

  /* ---- the card ------------------------------------------------------------ */
  const ARC = { easy: ['日常編', 'SLICE-OF-LIFE ARC'], medium: ['修行編', 'TRAINING ARC'], hard: ['最終決戦', 'FINAL BATTLE'] };
  const DIFF_COLOR = { easy: '#34d399', medium: '#fbbf24', hard: '#fb7185' };
  const cssVar = (n, fb) => (getComputedStyle(root).getPropertyValue(n) || '').trim() || fb;
  const DISPLAY = '"Dela Gothic One", "Inter", system-ui, sans-serif';
  const SANS = '"Inter", "Segoe UI", system-ui, -apple-system, sans-serif';

  /* colours as the browser resolves them, so hex, rgb() and color-mix() all work */
  function rgbOf(css) {
    const p = document.createElement('span'); p.style.color = css; p.style.display = 'none';
    document.body.appendChild(p);
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(getComputedStyle(p).color); p.remove();
    return m ? [+m[1], +m[2], +m[3]] : [249, 141, 193];
  }
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
  const hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  /* the card is always dark, so a light theme's accent (an ink tuned for
     paper) is swapped for its rule colour, or lifted toward white */
  function brightOnDark(candidates) {
    for (const cc of candidates) { const c = rgbOf(cc); if (lum(c) >= 0.18) return hex(c); }
    const c = rgbOf(candidates[0]);
    let mix = c;
    for (let t = 0.1; t <= 1 && lum(mix) < 0.18; t += 0.1) mix = c.map((v) => v + (255 - v) * t);
    return hex(mix);
  }
  const inkOn = (bg) => (lum(rgbOf(bg)) > 0.35 ? '#0b0a10' : '#ffffff');

  async function bitmapFrom(url) {
    try { const b = await (await fetch(url)).blob(); return await createImageBitmap(b); } catch (e) { return null; }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function chip(c, x, y, text, fg, bg, font) {
    c.font = font || '600 22px ' + SANS;
    const w = c.measureText(text).width + 32;
    roundRect(c, x, y, w, 42, 21); c.fillStyle = bg; c.fill();
    c.fillStyle = fg; c.textBaseline = 'middle'; c.fillText(text, x + 16, y + 22);
    return x + w + 12;
  }
  function wrap(c, text, maxW, maxLines) {
    const words = String(text).split(/\s+/), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…'; }
    return lines;
  }

  async function drawCard(d) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const accent = brightOnDark([cssVar('--lc-accent', '#f98dc1'), cssVar('--lc-rule', '#f98dc1')]);
    const accent2 = brightOnDark([cssVar('--lc-accent-2', '#a78bfa'), cssVar('--lc-rule', '#a78bfa')]);
    const desk = cssVar('--lc-desk', '#120d1c');
    try { await document.fonts.load('80px "Dela Gothic One"'); } catch (e) {}

    /* background: the scene the user codes on, or the theme's own colours */
    const scene = themeId() === 'anime' && globalThis.__lctsAnimeScene;
    const bmp = scene && scene.wall ? await bitmapFrom(scene.wall) : null;
    c.fillStyle = desk; c.fillRect(0, 0, W, H);
    if (bmp) {
      const s = Math.max(W / bmp.width, H / bmp.height);
      c.drawImage(bmp, (W - bmp.width * s) / 2, (H - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    } else {
      const g = c.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, desk); g.addColorStop(1, cssVar('--lc-bg2', '#1f1830'));
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.globalAlpha = 0.18; c.strokeStyle = accent; c.lineWidth = 2;
      for (let x = -H; x < W; x += 34) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + H, 0); c.stroke(); }
      c.globalAlpha = 1;
      const glow = c.createRadialGradient(W * 0.85, H * 0.2, 10, W * 0.85, H * 0.2, 520);
      glow.addColorStop(0, accent + '66'); glow.addColorStop(1, 'transparent');
      c.fillStyle = glow; c.fillRect(0, 0, W, H);
    }
    /* a readable dark side for the words, the art stays bright on the right */
    const veil = c.createLinearGradient(0, 0, W * 0.78, 0);
    veil.addColorStop(0, 'rgba(8,6,14,.92)'); veil.addColorStop(0.62, 'rgba(8,6,14,.62)'); veil.addColorStop(1, 'rgba(8,6,14,0)');
    c.fillStyle = veil; c.fillRect(0, 0, W, H);
    const foot = c.createLinearGradient(0, H - 150, 0, H);
    foot.addColorStop(0, 'rgba(8,6,14,0)'); foot.addColorStop(1, 'rgba(8,6,14,.75)');
    c.fillStyle = foot; c.fillRect(0, H - 150, W, 150);

    const X = 64;
    const arc = ARC[d.difficulty] || null;
    /* each theme's card speaks its own moments' language */
    const n = d.number;
    const WORDS = {
      anime:   { kick: (n ? 'EPISODE ' + n : 'EPISODE') + (arc ? '  ·  ' + arc[1] : ''), stamp: japanese ? (n ? '第' + n + '話' : '完了！') : (n ? 'EP. ' + n : 'CLEARED!'), line: 'CLEARED' },
      crawler: { kick: (n ? 'NODE #' + n : 'NODE') + '  ·  CRAWL COMPLETE', stamp: '200 OK', line: 'NODE COMPILED' },
      game:    { kick: n ? 'LEVEL ' + n : 'LEVEL', stamp: 'QUEST', line: 'COMPLETE' },
      pixel:   { kick: n ? 'STAGE ' + n : 'STAGE', stamp: 'STAGE', line: 'CLEAR!' }
    };
    const w = WORDS[themeId()] || { kick: n ? 'PROBLEM ' + n : 'LEETCODE', stamp: 'SOLVED', line: 'ACCEPTED' };
    c.textBaseline = 'alphabetic';
    c.font = '26px ' + DISPLAY; c.fillStyle = accent;
    c.fillText(w.kick, X, 84);

    /* the stamp, shrunk to fit if it is a long word */
    c.save();
    c.translate(X - 6, 236); c.rotate(-0.05);
    let size = 132;
    c.font = size + 'px ' + DISPLAY;
    while (c.measureText(w.stamp).width > 640 && size > 60) { size -= 6; c.font = size + 'px ' + DISPLAY; }
    c.lineJoin = 'round'; c.lineWidth = 14; c.strokeStyle = 'rgba(8,6,14,.9)'; c.strokeText(w.stamp, 0, 0);
    c.fillStyle = accent; c.fillText(w.stamp, 6, 6);
    c.fillStyle = '#ffffff'; c.fillText(w.stamp, 0, 0);
    c.restore();
    c.font = '46px ' + DISPLAY; c.fillStyle = '#ffffff';
    c.fillText(w.line, X, 304);

    /* the problem */
    c.font = '700 44px ' + SANS; c.fillStyle = '#f5f3fa';
    wrap(c, d.title || 'LeetCode problem', 700, 2).forEach((l, i) => c.fillText(l, X, 374 + i * 54));

    /* stats */
    let x = X; const y = d.title && wrap(c, d.title, 700, 2).length > 1 ? 446 : 406;
    if (d.difficulty) x = chip(c, x, y, d.difficulty[0].toUpperCase() + d.difficulty.slice(1), '#0b0a10', DIFF_COLOR[d.difficulty]);
    if (d.beats) x = chip(c, x, y, 'Beats ' + d.beats + '%', inkOn(accent), accent);
    if (d.lang) x = chip(c, x, y, d.lang, '#ffffff', 'rgba(255,255,255,.14)');
    if (d.runtime) x = chip(c, x, y, d.runtime, '#ffffff', 'rgba(255,255,255,.14)');
    if (d.streak >= 2) chip(c, X, y + 56, d.streak + '-day streak', inkOn(accent2), accent2);

    /* signature */
    c.textBaseline = 'alphabetic';
    c.font = '600 22px ' + SANS; c.fillStyle = 'rgba(255,255,255,.92)';
    c.fillText('Theme Studio for LeetCode', X, H - 50);
    c.font = '20px ' + SANS; c.fillStyle = 'rgba(255,255,255,.62)';
    c.fillText(SHARE_URL.replace(/^https?:\/\//, ''), X, H - 22);
    c.textAlign = 'right';
    c.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), W - 40, H - 22);
    c.textAlign = 'left';

    return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
  }

  function caption(d) {
    const parts = [];
    parts.push((d.number && themeId() === 'anime' ? 'Episode ' + d.number + ' cleared' : 'Solved') + ' ✅ ' + (d.title || 'a LeetCode problem') +
      (d.difficulty ? ' (' + d.difficulty[0].toUpperCase() + d.difficulty.slice(1) + ')' : '') + ' on LeetCode' +
      (d.beats ? ', beats ' + d.beats + '%' : '') + (d.lang ? ' in ' + d.lang : '') + '.');
    if (d.streak >= 2) parts.push('Day ' + d.streak + ' of my streak.');
    parts.push('\nCoding in style with Theme Studio for LeetCode → ' + SHARE_URL);
    parts.push('\n#LeetCode #100DaysOfCode #DSA');
    return parts.join(' ').replace(/ \n/g, '\n');
  }

  /* ---- UI --------------------------------------------------------------------- */
  const STYLE = `
.lcts-share-toast, .lcts-share-modal { --a: var(--lc-accent, #f98dc1); font-family: ${SANS}; color: #f4f2f8; }
.lcts-share-toast {
  position: fixed; right: 22px; bottom: 22px; z-index: 2147483200; width: 360px;
  display: grid; grid-template-columns: 128px 1fr; gap: 12px; padding: 12px;
  background: rgba(16,13,24,.94); border: 1px solid rgba(255,255,255,.1); border-radius: 14px;
  box-shadow: 0 18px 50px -18px rgba(0,0,0,.8), 0 0 0 1px color-mix(in srgb, var(--a) 30%, transparent);
  transform: translateY(24px); opacity: 0; transition: transform .35s cubic-bezier(.2,.9,.3,1), opacity .25s ease;
}
.lcts-share-toast.is-in { transform: none; opacity: 1; }
.lcts-share-toast img { width: 128px; height: 67px; object-fit: cover; border-radius: 8px; display: block; cursor: pointer; }
.lcts-share-toast b { display: block; font-size: 14px; margin: 1px 0 3px; }
.lcts-share-toast p { margin: 0 0 8px; font-size: 12px; color: rgba(244,242,248,.68); line-height: 1.35; }
.lcts-share-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.lcts-share-btn {
  border: 0; border-radius: 8px; padding: 7px 12px; font: 600 12.5px ${SANS}; cursor: pointer;
  background: rgba(255,255,255,.1); color: #fff;
}
.lcts-share-btn:hover { background: rgba(255,255,255,.18); }
.lcts-share-btn.primary { background: var(--a); color: #0d0a14; }
.lcts-share-btn.primary:hover { filter: brightness(1.08); }
.lcts-share-link { border: 0; background: none; padding: 0; color: rgba(244,242,248,.55); font: 11.5px ${SANS}; cursor: pointer; text-decoration: underline; }
.lcts-share-x { position: absolute; top: 6px; right: 8px; border: 0; background: none; color: rgba(255,255,255,.5); font: 18px/1 ${SANS}; cursor: pointer; }
.lcts-share-modal {
  position: fixed; inset: 0; z-index: 2147483300; display: grid; place-items: center;
  background: rgba(6,5,10,.72);
}
.lcts-share-box {
  position: relative; width: min(760px, calc(100vw - 40px)); max-height: calc(100vh - 40px); overflow: auto;
  background: #120f1b; border: 1px solid rgba(255,255,255,.1); border-radius: 16px; padding: 18px;
  box-shadow: 0 30px 80px -20px rgba(0,0,0,.9);
}
.lcts-share-box img { width: 100%; border-radius: 10px; display: block; }
.lcts-share-box textarea {
  width: 100%; box-sizing: border-box; margin: 12px 0 10px; min-height: 96px; resize: vertical;
  background: rgba(255,255,255,.05); color: #f4f2f8; border: 1px solid rgba(255,255,255,.12); border-radius: 10px;
  padding: 10px 12px; font: 13px/1.45 ${SANS};
}
.lcts-share-box textarea:focus { outline: none; border-color: color-mix(in srgb, var(--a) 60%, transparent); }
.lcts-share-box .lcts-share-row { gap: 8px; }
.lcts-share-box .lcts-share-btn { padding: 9px 14px; font-size: 13px; }
.lcts-share-hint { margin: 10px 0 0; font-size: 12px; color: rgba(244,242,248,.62); min-height: 16px; }
.lcts-share-foot { margin-top: 12px; display: flex; justify-content: space-between; align-items: center; }
.lcts-share-foot label { font-size: 12px; color: rgba(244,242,248,.6); display: flex; gap: 6px; align-items: center; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .lcts-share-toast { transition: none; } }
`;
  function ensureStyle() {
    if (document.getElementById('lcts-share-style')) return;
    const s = document.createElement('style'); s.id = 'lcts-share-style'; s.textContent = STYLE;
    (document.head || root).appendChild(s);
  }
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

  async function copyImage(blob) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch (e) { return false; }
  }
  function download(blob, d) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'leetcode-' + (d.number || 'clear') + '-cleared.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  let toast = null;
  function closeToast() { if (toast) { toast.remove(); toast = null; } }

  function openDialog(blob, url, d) {
    closeToast();
    ensureStyle();
    const modal = el('div', 'lcts-share-modal');
    const box = el('div', 'lcts-share-box');
    const img = el('img'); img.src = url; img.alt = 'Your share card';
    const text = el('textarea'); text.value = caption(d); text.setAttribute('aria-label', 'Post text');
    const hint = el('p', 'lcts-share-hint');
    const row = el('div', 'lcts-share-row');
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey, true);

    /* the image goes to the clipboard first (while this click still counts as
       a user gesture), then the composer opens with the text filled in */
    const post = (label, makeUrl) => {
      const b = el('button', 'lcts-share-btn primary', label); b.type = 'button';
      b.addEventListener('click', async () => {
        const ok = await copyImage(blob);
        if (!ok) download(blob, d);
        window.open(makeUrl(text.value), '_blank', 'noopener');
        hint.textContent = ok ? 'Card copied. In the post, press Ctrl+V (⌘V on Mac) to add it.'
                              : 'Card downloaded. Attach it to your post.';
      });
      return b;
    };
    row.append(
      post('Post on LinkedIn', (t) => 'https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(t)),
      post('Post on X', (t) => 'https://x.com/intent/post?text=' + encodeURIComponent(t))
    );
    const copyBtn = el('button', 'lcts-share-btn', 'Copy image'); copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => { hint.textContent = (await copyImage(blob)) ? 'Card copied.' : 'Copying is blocked here. Use Download instead.'; });
    const dl = el('button', 'lcts-share-btn', 'Download'); dl.type = 'button';
    dl.addEventListener('click', () => { download(blob, d); hint.textContent = 'Saved.'; });
    row.append(copyBtn, dl);

    const foot = el('div', 'lcts-share-foot');
    const lab = el('label'); const cb = el('input'); cb.type = 'checkbox';
    cb.addEventListener('change', () => { if (cb.checked) turnOff(); else { enabled = true; chrome.storage.local.set({ lcShare: { enabled: true } }); } });
    lab.append(cb, document.createTextNode("Don't offer this after Accepted"));
    const done = el('button', 'lcts-share-btn', 'Close'); done.type = 'button'; done.addEventListener('click', close);
    foot.append(lab, done);

    const x = el('button', 'lcts-share-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', close);
    box.append(x, img, text, row, hint, foot);
    modal.append(box);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    document.body.appendChild(modal);
  }

  async function offer(d) {
    const blob = await drawCard(d);
    if (!blob || !enabled || !themeId()) return;
    const url = URL.createObjectURL(blob);
    closeToast();
    ensureStyle();
    toast = el('div', 'lcts-share-toast');
    toast.setAttribute('role', 'dialog'); toast.setAttribute('aria-label', 'Share your clear');
    const img = el('img'); img.src = url; img.alt = '';
    const body = el('div');
    const row = el('div', 'lcts-share-row');
    const share = el('button', 'lcts-share-btn primary', 'Share'); share.type = 'button';
    share.addEventListener('click', () => openDialog(blob, url, d));
    img.addEventListener('click', () => openDialog(blob, url, d));
    const later = el('button', 'lcts-share-btn', 'Not now'); later.type = 'button'; later.addEventListener('click', closeToast);
    row.append(share, later);
    const off = el('button', 'lcts-share-link', "Don't show again"); off.type = 'button';
    off.addEventListener('click', () => { turnOff(); closeToast(); });
    body.append(el('b', null, (d.number ? 'Episode ' + d.number : 'Problem') + ' cleared'),
                el('p', null, 'Your card is ready. Share it in one click.'), row);
    const x = el('button', 'lcts-share-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closeToast);
    body.append(off);
    toast.append(img, body, x);
    document.body.appendChild(toast);
    /* flush the starting style, then slide in; not requestAnimationFrame,
       which never fires while the tab is in the background */
    void toast.offsetWidth;
    toast.classList.add('is-in');
    const mine = toast;
    setTimeout(() => { if (toast === mine && !mine.matches(':hover')) closeToast(); }, 14000);
  }

  /* ---- trigger ------------------------------------------------------------------ */
  /* ms to wait for each theme's Accepted moment; Pixel Art's squad takes longer */
  const MOMENT_THEMES = { anime: 2100, crawler: 2100, game: 2100, pixel: 4300 };
  async function onAccepted(v) {
    if (!themeId()) return;                       // "Off" means off
    const { streak } = await recordClear();
    if (!enabled || root.hasAttribute('data-lc-focus')) return;
    const p = globalThis.LCTSProblem ? globalThis.LCTSProblem.get() : {};
    const d = { number: p.number, title: p.title || document.title.replace(/\s*-\s*LeetCode\s*$/, ''),
                difficulty: p.difficulty, beats: v.beats, lang: v.lang, runtime: v.runtime, streak };
    /* after the Accepted moment has had its stage */
    setTimeout(() => offer(d), MOMENT_THEMES[themeId()] || 700);
  }
  if (globalThis.LCTSVerdict) {
    globalThis.LCTSVerdict.subscribe((v) => { if (v.kind === 'ac' && v.action === 'submit') onAccepted(v); });
  }

  globalThis.LCTSShare = { drawCard, caption, offer };
})();
