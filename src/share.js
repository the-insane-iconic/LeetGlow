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
  const SHARE_URL = 'chromewebstore.google.com/detail/ecpfpadofaimilfpjedgoedhoaglpjdb';
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

    /* background: sleek dark gradient with diagonal stripes and radial glow (previous template in Screenshot 1) */
    const g = c.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, desk); g.addColorStop(1, cssVar('--lc-bg2', '#1f1830'));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.globalAlpha = 0.18; c.strokeStyle = accent; c.lineWidth = 2;
    for (let x = -H; x < W; x += 34) { c.beginPath(); c.moveTo(x, H); c.lineTo(x + H, 0); c.stroke(); }
    c.globalAlpha = 1;
    const glow = c.createRadialGradient(W * 0.85, H * 0.2, 10, W * 0.85, H * 0.2, 520);
    glow.addColorStop(0, accent + '66'); glow.addColorStop(1, 'transparent');
    c.fillStyle = glow; c.fillRect(0, 0, W, H);

    /* a readable dark side for the words */
    const veil = c.createLinearGradient(0, 0, W * 0.78, 0);
    veil.addColorStop(0, 'rgba(8,6,14,.92)'); veil.addColorStop(0.62, 'rgba(8,6,14,.62)'); veil.addColorStop(1, 'rgba(8,6,14,0)');
    c.fillStyle = veil; c.fillRect(0, 0, W, H);
    const foot = c.createLinearGradient(0, H - 150, 0, H);
    foot.addColorStop(0, 'rgba(8,6,14,0)'); foot.addColorStop(1, 'rgba(8,6,14,.75)');
    c.fillStyle = foot; c.fillRect(0, H - 150, W, 150);

    const X = 64;
    const n = d.number;
    const w = { kick: n ? 'PROBLEM ' + n : 'LEETCODE', stamp: 'SOLVED', line: 'ACCEPTED' };
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
    c.fillText('LeetGlow – Aesthetic LeetCode Themes, Clean Animations & Focus Tools', X, H - 36);
    c.font = '20px ' + SANS; c.fillStyle = 'rgba(255,255,255,.62)';
    c.textAlign = 'right';
    c.fillText(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), W - 40, H - 36);
    c.textAlign = 'left';

    return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
  }

  function caption(d) {
    const parts = [];
    parts.push('Solved ✅ ' + (d.title || 'a LeetCode problem') +
      (d.difficulty ? ' (' + d.difficulty[0].toUpperCase() + d.difficulty.slice(1) + ')' : '') + ' on LeetCode' +
      (d.beats ? ', beats ' + d.beats + '%' : '') + (d.lang ? ' in ' + d.lang : '') + '.');
    if (d.streak >= 2) parts.push('Day ' + d.streak + ' of my streak.');
    parts.push('\nCoding in style with LeetGlow – Aesthetic LeetCode Themes, Clean Animations & Focus Tools → ' + SHARE_URL);
    parts.push('\n#LeetCode #100DaysOfCode #DSA');
    return parts.join(' ').replace(/ \n/g, '\n');
  }

  /* ---- UI --------------------------------------------------------------------- */
  const STYLE = `
.lcts-share-toast, .lcts-share-modal { --a: var(--lc-accent, #f98dc1); font-family: ${SANS}; }
.lcts-share-toast {
  position: fixed; right: 22px; bottom: 22px; z-index: 2147483200; width: 360px;
  display: grid; grid-template-columns: 128px 1fr; gap: 12px; padding: 12px;
  background: rgba(16,13,24,.94); border: 1px solid rgba(255,255,255,.1); border-radius: 14px;
  box-shadow: 0 18px 50px -18px rgba(0,0,0,.8), 0 0 0 1px color-mix(in srgb, var(--a) 30%, transparent);
  color: #f4f2f8; transform: translateY(24px); opacity: 0; transition: transform .35s cubic-bezier(.2,.9,.3,1), opacity .25s ease;
}
.lcts-share-toast.is-in { transform: none; opacity: 1; }
.lcts-share-toast img { width: 128px; height: 67px; object-fit: cover; border-radius: 8px; display: block; cursor: pointer; }
.lcts-share-toast b { display: block; font-size: 14px; margin: 1px 0 3px; }
.lcts-share-toast p { margin: 0 0 8px; font-size: 12px; color: rgba(244,242,248,.68); line-height: 1.35; }
.lcts-share-toast .lcts-share-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.lcts-share-toast .lcts-share-btn {
  border: 0; border-radius: 8px; padding: 7px 12px; font: 600 12.5px ${SANS}; cursor: pointer;
  background: rgba(255,255,255,.1); color: #fff;
}
.lcts-share-toast .lcts-share-btn:hover { background: rgba(255,255,255,.18); }
.lcts-share-toast .lcts-share-btn.primary { background: var(--a); color: #0d0a14; }
.lcts-share-link { border: 0; background: none; padding: 0; color: rgba(244,242,248,.55); font: 11.5px ${SANS}; cursor: pointer; text-decoration: underline; }
.lcts-share-toast .lcts-share-x { position: absolute; top: 6px; right: 8px; border: 0; background: none; color: rgba(255,255,255,.5); font: 18px/1 ${SANS}; cursor: pointer; }

/* Modal - Clean White Theme */
.lcts-share-modal {
  position: fixed; inset: 0; z-index: 2147483300; display: grid; place-items: center;
  background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(8px);
}
.lcts-share-box {
  position: relative; width: min(780px, calc(100vw - 36px)); max-height: calc(100vh - 40px); overflow-y: auto;
  background: #ffffff; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 20px; padding: 22px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05);
}
.lcts-share-box img {
  width: 100%; border-radius: 12px; display: block;
  box-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.15);
}
html[data-lc-theme] .lcts-share-box textarea,
.lcts-share-box textarea {
  width: 100%; box-sizing: border-box; margin: 14px 0 12px; min-height: 90px; resize: vertical;
  background: #f8fafc !important; color: #0f172a !important; -webkit-text-fill-color: #0f172a !important;
  caret-color: #0f172a !important; border: 1px solid #cbd5e1 !important; border-radius: 12px;
  padding: 12px 14px; font: 500 13px/1.5 ${SANS}; transition: border-color .15s, box-shadow .15s;
}
html[data-lc-theme] .lcts-share-box textarea:focus,
.lcts-share-box textarea:focus {
  outline: none; border-color: #2563eb !important; background: #ffffff !important;
  color: #0f172a !important; -webkit-text-fill-color: #0f172a !important;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}
.lcts-share-box .lcts-share-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.lcts-share-box .lcts-share-btn {
  border: 1px solid #e2e8f0; border-radius: 9px; padding: 8px 15px; font: 600 13px ${SANS}; cursor: pointer;
  background: #f1f5f9; color: #334155; transition: all .15s ease;
}
.lcts-share-box .lcts-share-btn:hover { background: #e2e8f0; color: #0f172a; }
.lcts-share-box .lcts-share-btn.primary {
  background: #0f172a; color: #ffffff; border-color: #0f172a;
}
.lcts-share-box .lcts-share-btn.primary:hover {
  background: #1e293b; border-color: #1e293b;
}
.lcts-share-box .lcts-share-btn.linkedin {
  background: #0a66c2; color: #ffffff; border-color: #0a66c2;
}
.lcts-share-box .lcts-share-btn.linkedin:hover {
  background: #004182; border-color: #004182;
}
.lcts-share-box .lcts-share-x {
  position: absolute; top: 12px; right: 14px; width: 32px; height: 32px;
  display: grid; place-items: center; border-radius: 50%; border: 1px solid #e2e8f0; background: #f8fafc;
  color: #64748b; font: 20px/1 ${SANS}; cursor: pointer; transition: all .15s ease;
}
.lcts-share-box .lcts-share-x:hover { background: #e2e8f0; color: #0f172a; }
.lcts-share-include {
  display: inline-flex; align-items: center; gap: 7px; font-size: 12.5px; font-weight: 500;
  color: #475569; cursor: pointer; user-select: none; margin-left: 6px;
}
.lcts-share-include input[type="checkbox"] {
  accent-color: #0a66c2; cursor: pointer; width: 15px; height: 15px; margin: 0;
}
.lcts-share-foot {
  margin-top: 14px; padding-top: 12px; border-top: 1px solid #e2e8f0;
  display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap;
}
.lcts-share-tip {
  font-size: 12.5px; line-height: 1.45; font-weight: 500;
  background: #f0fdf4; border: 1px solid #bbf7d0; color: #15803d;
  border-radius: 8px; padding: 7px 12px; box-sizing: border-box;
  display: inline-flex; align-items: center; gap: 6px; flex: 1; min-width: 260px;
}
.lcts-share-tip.downloaded { background: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
.lcts-share-tip.error { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
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
    a.download = 'leetcode-' + (d.number || 'problem') + '-solved.png';
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
    const row = el('div', 'lcts-share-row');
    const close = () => { modal.remove(); document.removeEventListener('keydown', onKey, true); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey, true);

    const tip = el('div', 'lcts-share-tip');
    const incLabel = el('label', 'lcts-share-include');
    const incBox = el('input'); incBox.type = 'checkbox'; incBox.checked = true;

    function updateTip() {
      tip.className = 'lcts-share-tip';
      if (incBox.checked) {
        tip.innerHTML = '<span style="color:#16a34a;font-weight:700;">✓</span> <strong>Card copied!</strong> Click in the post and press <strong>⌘V</strong> (Ctrl+V) to paste the image.';
      } else {
        tip.innerHTML = '<span style="color:#64748b;">📝</span> <span>Sharing text and link only.</span>';
      }
    }
    updateTip();

    chrome.storage.local.get('lcShareIncludeImg', (r) => {
      if (r && r.lcShareIncludeImg !== undefined) incBox.checked = !!r.lcShareIncludeImg;
      updateTip();
      if (incBox.checked) copyImage(blob);
    });
    incBox.addEventListener('change', () => {
      chrome.storage.local.set({ lcShareIncludeImg: incBox.checked });
      updateTip();
      if (incBox.checked) copyImage(blob);
    });
    incLabel.append(incBox, el('span', null, 'Include card image in post'));

    /* the image goes to the clipboard immediately and on post click */
    copyImage(blob);

    const post = (label, makeUrl, extraCls) => {
      const b = el('button', 'lcts-share-btn primary ' + (extraCls || ''), label); b.type = 'button';
      b.addEventListener('click', async () => {
        if (incBox.checked) {
          await copyImage(blob);
          tip.className = 'lcts-share-tip';
          tip.innerHTML = '<span style="color:#16a34a;font-weight:700;">✓</span> <strong>Card copied!</strong> Click in the post and press <strong>⌘V</strong> (Ctrl+V) to paste the image.';
        }
        window.open(makeUrl(text.value), '_blank', 'noopener');
      });
      return b;
    };
    row.append(
      post('Post on LinkedIn', (t) => 'https://www.linkedin.com/feed/?shareActive=true&text=' + encodeURIComponent(t), 'linkedin'),
      post('Post on X', (t) => 'https://x.com/intent/post?text=' + encodeURIComponent(t))
    );
    const copyBtn = el('button', 'lcts-share-btn', 'Copy image'); copyBtn.type = 'button';
    copyBtn.addEventListener('click', async () => {
      const ok = await copyImage(blob);
      tip.className = 'lcts-share-tip ' + (ok ? '' : 'error');
      tip.innerHTML = ok
        ? '<span style="color:#16a34a;font-weight:700;">✓</span> <strong>Card copied!</strong> Click in the post and press <strong>⌘V</strong> (Ctrl+V) to paste the image.'
        : '<span style="color:#ef4444;">✕</span> Copying is blocked here. Use Download instead.';
    });
    const dl = el('button', 'lcts-share-btn', 'Download'); dl.type = 'button';
    dl.addEventListener('click', () => {
      download(blob, d);
      tip.className = 'lcts-share-tip downloaded';
      tip.innerHTML = '<span style="color:#2563eb;font-weight:700;">⬇️</span> <strong>Card downloaded!</strong> Attach it to your post.';
    });
    row.append(copyBtn, dl, incLabel);

    const foot = el('div', 'lcts-share-foot');
    const done = el('button', 'lcts-share-btn', 'Close'); done.type = 'button'; done.addEventListener('click', close);
    foot.append(tip, done);

    const x = el('button', 'lcts-share-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', close);
    box.append(x, img, text, row, foot);
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
    body.append(el('b', null, (d.number ? 'Problem ' + d.number : 'Problem') + ' solved'),
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
  const MOMENT_THEMES = { anime: 2100, crawler: 2100, game: 2100, pixel: 4300, grid: 2100 };
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
