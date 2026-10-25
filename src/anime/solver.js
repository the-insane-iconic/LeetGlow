/* =============================================================================
   solver.js — turns a wallpaper into a theme that stays readable.

   Pure: no DOM, no canvas. It takes RGBA samples of the picture and returns
   every role core.css reads, plus the syntax inks, plus the contrast it
   achieved. The Anime Studio page, the preset build and the tests all run this
   same code, so a preset and an uploaded picture are solved identically.

   THE IDEA
   Panels are "glass": the picture itself, fixed to the viewport, under a scrim
   of one colour. Text readability depends only on how opaque that scrim is and
   on the worst pixels beneath it, so instead of picking an opacity by eye we
   SOLVE for the least opaque scrim at which the text still clears its target
   against the picture's extreme pixels. The user's "scene visibility" slider
   then moves between that floor and fully opaque, which means no setting can
   make the code unreadable.

   Browsers composite in gamma-encoded sRGB, so scrim-over-pixel is a plain
   per-channel mix of 8-bit values; luminance is taken from the result.

   Colours for text (accent, status, syntax inks) follow the rule that made
   Vintage Paper work: on a light glass, the LIGHTEST value at each hue that still
   clears its target, on a dark glass the DARKEST, because unspent contrast is
   colour thrown away. Syntax hues are spread around the wheel from the
   picture's own accents, so the code looks like it belongs to the art while
   every role stays a visibly different colour.
============================================================================= */
(function (root) {
  'use strict';

  /* ---- colour math ------------------------------------------------------- */
  const LIN = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const round = (v) => clamp(Math.round(v), 0, 255);
  /* composited channels are fractional; the table is indexed by 8-bit value */
  const lum = (r, g, b) => 0.2126 * LIN[round(r)] + 0.7152 * LIN[round(g)] + 0.0722 * LIN[round(b)];
  const lumOf = (c) => lum(c[0], c[1], c[2]);
  const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

  function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (!s) { const v = round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [round(f(h + 1 / 3) * 255), round(f(h) * 255), round(f(h - 1 / 3) * 255)];
  }
  function rgbToHsl(c) {
    const r = c[0] / 255, g = c[1] / 255, b = c[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const l = (mx + mn) / 2;
    return [h, d ? d / (1 - Math.abs(2 * l - 1)) : 0, l];
  }
  const hex = (c) => '#' + c.map((v) => round(v).toString(16).padStart(2, '0')).join('');
  const rgba = (c, a) => `rgba(${round(c[0])},${round(c[1])},${round(c[2])},${+a.toFixed(3)})`;
  const hueDist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
  /* core.css reads the --sd-* tokens as hsl(var(--x)) */
  function hslStr(c, alpha) {
    const t = rgbToHsl(c);
    const h = Math.round(t[0]), s = Math.round(t[1] * 100), l = Math.round(t[2] * 100);
    return alpha === undefined ? `${h} ${s}% ${l}%` : `${h},${s}%,${l}%,${alpha}`;
  }
  /* scrim over pixel, as the browser composites it */
  const over = (scrim, a, p) => [scrim[0] * a + p[0] * (1 - a), scrim[1] * a + p[1] * (1 - a), scrim[2] * a + p[2] * (1 - a)];

  /* ---- sampling ---------------------------------------------------------- */
  function pixels(data) {
    const out = [];
    for (let i = 0; i < data.length; i += 4) out.push([data[i], data[i + 1], data[i + 2]]);
    return out;
  }

  /* The pixels that decide readability are the extremes: the brightest ones
     under a dark scrim, the darkest under a light one. Keep the worst few
     percent; checking every pixel would be slower and no more correct. */
  function extremes(px, dark, share) {
    const sorted = px.slice().sort((a, b) => lumOf(a) - lumOf(b));
    const n = Math.max(8, Math.round(sorted.length * share));
    return dark ? sorted.slice(sorted.length - n) : sorted.slice(0, n);
  }

  /* the contrast of `fgL` over the scrim at `a`, at a percentile of the worst
     pixels -- a lone star under one glyph should not darken the whole panel */
  function worstRatio(fgL, scrim, a, cands, pct) {
    const rs = cands.map((p) => ratio(fgL, lumOf(over(scrim, a, p)))).sort((x, y) => x - y);
    return rs[Math.min(rs.length - 1, Math.floor(rs.length * (1 - pct)))];
  }

  function solveAlpha(fgL, scrim, cands, target, pct, lo, hi) {
    if (worstRatio(fgL, scrim, lo, cands, pct) >= target) return lo;
    if (worstRatio(fgL, scrim, hi, cands, pct) < target) return hi;
    let a = lo, b = hi;
    for (let i = 0; i < 18; i++) {
      const m = (a + b) / 2;
      if (worstRatio(fgL, scrim, m, cands, pct) >= target) b = m; else a = m;
    }
    return b;
  }

  /* one representative surface: the average pixel under the scrim */
  function meanOver(scrim, a, px) {
    let r = 0, g = 0, b = 0;
    px.forEach((p) => { r += p[0]; g += p[1]; b += p[2]; });
    const n = px.length || 1;
    return over(scrim, a, [r / n, g / n, b / n]);
  }

  /* ---- palette: k-means on the picture ------------------------------------ */
  function kmeans(px, k, seed) {
    let s = seed || 7;
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const step = Math.max(1, Math.floor(px.length / 2400));
    const pts = []; for (let i = 0; i < px.length; i += step) pts.push(px[i]);
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
    /* k-means++ seeding, deterministic */
    const cents = [pts[Math.floor(rnd() * pts.length)].slice()];
    while (cents.length < k) {
      const ds = pts.map((p) => Math.min(...cents.map((c) => d2(p, c))));
      let t = rnd() * ds.reduce((x, y) => x + y, 0), i = 0;
      while (i < ds.length - 1 && (t -= ds[i]) > 0) i++;
      cents.push(pts[i].slice());
    }
    let assign = new Array(pts.length).fill(0);
    for (let it = 0; it < 12; it++) {
      assign = pts.map((p) => { let bi = 0, bd = Infinity; cents.forEach((c, j) => { const d = d2(p, c); if (d < bd) { bd = d; bi = j; } }); return bi; });
      const sum = cents.map(() => [0, 0, 0, 0]);
      pts.forEach((p, i) => { const t = sum[assign[i]]; t[0] += p[0]; t[1] += p[1]; t[2] += p[2]; t[3]++; });
      sum.forEach((t, j) => { if (t[3]) cents[j] = [t[0] / t[3], t[1] / t[3], t[2] / t[3]]; });
    }
    const counts = cents.map(() => 0); assign.forEach((j) => counts[j]++);
    return cents.map((c, j) => ({ rgb: c, weight: counts[j] / pts.length, hsl: rgbToHsl(c) }))
      .sort((a, b) => b.weight - a.weight);
  }

  const chroma = (hsl) => hsl[1] * (1 - Math.abs(2 * hsl[2] - 1));

  function accents(clusters) {
    const colourful = clusters.filter((c) => chroma(c.hsl) > 0.12)
      .map((c) => ({ c, score: Math.sqrt(c.weight) * chroma(c.hsl) }))
      .sort((a, b) => b.score - a.score);
    /* a greyscale picture still gets a voice: sakura pink and sky cyan */
    if (!colourful.length) return { a: 330, b: 190, dominant: clusters[0].hsl[0], dominantSat: 0 };
    const a = colourful[0].c.hsl[0];
    const second = colourful.find((x) => hueDist(x.c.hsl[0], a) >= 45);
    const b = second ? second.c.hsl[0] : (a + 150) % 360;
    return { a, b, dominant: clusters[0].hsl[0], dominantSat: clusters[0].hsl[1] };
  }

  /* ---- ink solving ---------------------------------------------------------
     Walk lightness at a fixed hue and saturation. On dark glass, return the
     darkest value that clears the target (the most saturated one); on light
     glass, the lightest. Returns the colour and the ratio it achieved. */
  function inkAt(h, s, dark, bgL, target, lMin, lMax) {
    lMin = lMin === undefined ? 0.02 : lMin;
    lMax = lMax === undefined ? 0.98 : lMax;
    let best = null;
    if (dark) {
      for (let l = lMin; l <= lMax + 1e-9; l += 0.005) {
        const c = hslToRgb(h, s, l);
        if (ratio(lumOf(c), bgL) >= target) { best = c; break; }
      }
      if (!best) best = hslToRgb(h, s * 0.4, 0.97);
    } else {
      for (let l = lMax; l >= lMin - 1e-9; l -= 0.005) {
        const c = hslToRgb(h, s, l);
        if (ratio(lumOf(c), bgL) >= target) { best = c; break; }
      }
      if (!best) best = hslToRgb(h, s * 0.4, 0.04);
    }
    return { c: best, r: ratio(lumOf(best), bgL) };
  }

  /* place each syntax role on the wheel: keyword and function take the
     picture's two accents, the rest go where they are farthest from what is
     already placed, nudged toward the hue a coder expects for that role */
  /* orange and yellow cannot be dark enough to read on light glass and still
     look like themselves -- they go brown and olive -- so light glass skips
     that band when it places syntax roles */
  const muddyOnLight = (h) => h >= 22 && h <= 85;

  function syntaxHues(a, b, dark) {
    if (!dark && muddyOnLight(a)) a = (a + 180) % 360;
    if (hueDist(a, b) < 50) b = (a + 180) % 360;
    if (!dark && muddyOnLight(b)) b = (b + 150) % 360;
    const placed = { keyword: a, func: b };
    const want = [['string', 110], ['type', 190], ['number', 30], ['control', 290]];
    want.forEach(([role, canon]) => {
      let best = 0, bestScore = -Infinity;
      for (let h = 0; h < 360; h += 5) {
        if (!dark && muddyOnLight(h)) continue;
        const minD = Math.min(...Object.values(placed).map((p) => hueDist(h, p)));
        const score = Math.min(minD, 60) - 0.35 * hueDist(h, canon);
        if (score > bestScore) { bestScore = score; best = h; }
      }
      placed[role] = best;
    });
    return placed;
  }

  /* ---- the solve ----------------------------------------------------------
     sharp, blur: RGBA arrays of the picture and its blurred copy, both sampled
     at the same small size with the viewport's aspect.
     opts.glass: 'auto' | 'dark' | 'light'
     opts.visibility: 0..1, how much of the art shows through (1 = the floor) */
  function analyze(sharpData, blurData, opts) {
    opts = opts || {};
    const visibility = clamp(opts.visibility === undefined ? 0.85 : opts.visibility, 0, 1);
    const sharp = pixels(sharpData), blur = pixels(blurData);

    const meanL = sharp.reduce((t, p) => t + lumOf(p), 0) / sharp.length;
    const dark = opts.glass === 'dark' ? true : opts.glass === 'light' ? false : meanL < 0.42;

    const clusters = kmeans(sharp, 6, 11);
    const acc = accents(clusters);
    const tintSat = clamp(acc.dominantSat, 0, 0.55);

    const scrim = dark ? hslToRgb(acc.dominant, clamp(tintSat * 1.1, 0.25, 0.6), 0.085)
                       : hslToRgb(acc.dominant, tintSat * 0.55, 0.955);
    const text = dark ? hslToRgb(acc.dominant, 0.3, 0.955) : hslToRgb(acc.dominant, 0.35, 0.1);
    const textL = lumOf(text);

    const sharpX = extremes(sharp, dark, 0.04);
    const blurX = extremes(blur, dark, 0.04);
    /* the top bar sits over the top strip of the picture */
    const cols = opts.cols || 160;
    const topRows = Math.max(2, Math.round((sharp.length / cols) * 0.1));
    const topStrip = extremes(sharp.slice(0, cols * topRows), dark, 0.1);

    const lift = (floor, ceiling) => floor + (ceiling - floor) * (1 - visibility);

    /* floors: body text 7:1 on the panels, 9.5:1 on the editor so the inks
       have room to be colourful, 5.5:1 on the top bar */
    const panelFloor = solveAlpha(textL, scrim, sharpX, 7, 0.98, 0.3, 0.97);
    /* On light glass, contrast alone is not enough: an editor surface that
       merely clears 9.5:1 for near-black text forces every syntax ink toward
       black too. Light code themes read as colourful because their surface is
       near white, which lets inks sit around luminance 0.13 (a real red, blue
       or violet) and still clear 4.8:1. So the light editor also has to be
       bright enough for an ink that light. Dark glass has the headroom already. */
    const INK_REF_L = 0.13;
    const editorFloor = Math.max(
      solveAlpha(textL, scrim, blurX, 9.5, 0.995, 0.3, 0.98),
      dark ? 0 : solveAlpha(INK_REF_L, scrim, blurX, 4.8, 0.995, 0.3, 0.98)
    );
    const navFloor = solveAlpha(textL, scrim, topStrip, 5.5, 0.98, 0.2, 0.95);

    const aPanel = lift(panelFloor, 0.97);
    const aEditor = Math.max(lift(editorFloor, 0.98), aPanel);
    const aNavTotal = lift(navFloor, 0.95);
    /* the gutters show the art most; the bar adds its own layer over them */
    const aDesk = dark ? 0.18 : 0.12;
    const aNav = clamp(1 - (1 - aNavTotal) / (1 - aDesk), 0, 1);

    /* the worst surfaces, used to solve every coloured ink */
    const worstL = (cands, a) => {
      let w = null;
      cands.forEach((p) => { const l = lumOf(over(scrim, a, p)); if (w === null || (dark ? l > w : l < w)) w = l; });
      return w;
    };
    const panelBgL = worstL(sharpX, aPanel);
    const editorBgL = worstL(blurX, aEditor);

    const surface = meanOver(scrim, aPanel, sharp);
    const shade = (c, dl) => { const t = rgbToHsl(c); return hslToRgb(t[0], t[1], clamp(t[2] + dl, 0, 1)); };
    const raised = shade(surface, dark ? 0.06 : -0.03);

    /* text tiers, solved on the panel's worst pixels */
    const text2 = inkAt(acc.dominant, 0.22, dark, panelBgL, 5.6, dark ? 0.35 : 0.05, dark ? 0.97 : 0.7).c;
    const text3 = inkAt(acc.dominant, 0.18, dark, panelBgL, 4.6, dark ? 0.3 : 0.05, dark ? 0.97 : 0.75).c;

    const inkS = dark ? 0.9 : 0.95;
    const accent = inkAt(acc.a, inkS, dark, panelBgL, 4.8, dark ? 0.55 : 0.08, dark ? 0.95 : 0.6).c;
    const accent2 = inkAt(acc.b, inkS, dark, panelBgL, 4.8, dark ? 0.55 : 0.08, dark ? 0.95 : 0.6).c;
    const green = inkAt(148, 0.7, dark, panelBgL, 4.8, dark ? 0.5 : 0.05, dark ? 0.95 : 0.6).c;
    const yellow = inkAt(42, 0.9, dark, panelBgL, 4.8, dark ? 0.5 : 0.05, dark ? 0.95 : 0.6).c;
    const red = inkAt(352, 0.85, dark, panelBgL, 4.8, dark ? 0.5 : 0.05, dark ? 0.95 : 0.6).c;

    /* Submit is the accent as a filled button; its label takes whichever of
       the scrim or the text colour reads better on it */
    const accentL = lumOf(accent);
    const submitText = ratio(lumOf(scrim), accentL) >= ratio(textL, accentL) ? scrim : text;
    const submitHover = shade(accent, dark ? 0.06 : -0.06);

    /* syntax inks, solved on the editor's worst pixels */
    const hues = syntaxHues(acc.a, acc.b, dark);
    const T = dark ? 6.5 : 4.8;
    const lo = dark ? 0.45 : 0.04, hi = dark ? 0.95 : 0.62;
    const inkRole = (h, s, t) => inkAt(h, s, dark, editorBgL, t, lo, hi);
    const ink = {
      keyword: inkRole(hues.keyword, inkS, T),
      control: inkRole(hues.control, inkS, T),
      func: inkRole(hues.func, inkS, T),
      type: inkRole(hues.type, inkS, T),
      string: inkRole(hues.string, inkS * 0.62, T),
      number: inkRole(hues.number, inkS, T),
      param: inkRole(acc.b, 0.45, dark ? 9 : 7),
      operator: inkRole(acc.a, 0.3, dark ? 8 : 6.5),
      comment: inkAt(acc.dominant, 0.16, dark, editorBgL, 4.6, dark ? 0.3 : 0.05, dark ? 0.97 : 0.8),
      variable: { c: text, r: ratio(textL, editorBgL) },
      invalid: inkRole(352, 0.85, T)
    };
    ink.regexp = ink.string;

    const inkOut = { a: 1 };
    const inkReport = {};
    Object.keys(ink).forEach((k) => { inkOut[k] = hex(ink[k].c); inkReport[k] = +ink[k].r.toFixed(2); });

    const roles = {
      '--lc-desk': hex(scrim),
      '--lc-bg0': hex(scrim),
      '--lc-bg1': rgba(scrim, dark ? 0.32 : 0.36),
      '--lc-bg2': hex(surface),
      '--lc-bg3': hex(raised),
      '--lc-inset': rgba(scrim, dark ? 0.36 : 0.5),
      '--lc-raised': hex(raised),
      '--lc-editor-bg': 'transparent',
      '--lc-border': rgba(text, 0.16),
      '--lc-border-strong': rgba(text, 0.3),
      '--lc-hairline': rgba(text, 0.11),
      '--lc-groove': rgba(scrim, 0.55),
      '--lc-rule': hex(accent),
      '--lc-fill-1': rgba(text, 0.16),
      '--lc-fill-2': rgba(text, 0.11),
      '--lc-fill-3': rgba(text, 0.075),
      '--lc-fill-4': rgba(text, 0.045),
      '--lc-text': hex(text),
      '--lc-text2': hex(text2),
      '--lc-text3': hex(text3),
      '--lc-accent': hex(accent),
      '--lc-accent-2': hex(accent2),
      '--lc-accent-contrast': hex(submitText),
      '--lc-green': hex(green),
      '--lc-yellow': hex(yellow),
      '--lc-red': hex(red),
      '--lc-selection': rgba(accent, dark ? 0.3 : 0.24),
      '--lc-scroll': rgba(text, 0.22),
      '--lc-hsl-bg': hslStr(surface),
      '--lc-hsl-desk': hslStr(scrim),
      '--lc-hsl-raised': hslStr(raised),
      '--lc-hsl-text': hslStr(text),
      '--lc-hsl-text3': hslStr(text3),
      '--lc-hsl-accent': hslStr(accent),
      '--lc-hsl-accent2': hslStr(accent2),
      '--lc-hsla-hairline': hslStr(text, 0.12),
      '--lc-nav-rule': rgba(text, 0.1),
      '--lc-submit-bg': hex(accent),
      '--lc-submit-bg-hover': hex(submitHover),
      '--lc-submit-text': hex(submitText),
      '--lc-glow': rgba(accent, 0.5)
    };

    return {
      v: 1,
      mode: dark ? 'dark' : 'light',
      scrim: hex(scrim),
      alpha: { panel: +aPanel.toFixed(3), editor: +aEditor.toFixed(3), desk: aDesk, nav: +aNav.toFixed(3) },
      roles,
      ink: inkOut,
      report: {
        text: +worstRatio(textL, scrim, aPanel, sharpX, 0.98).toFixed(2),
        text3: +ratio(lumOf(text3), panelBgL).toFixed(2),
        accent: +ratio(accentL, panelBgL).toFixed(2),
        editorText: +ratio(textL, editorBgL).toFixed(2),
        submit: +ratio(lumOf(submitText), accentL).toFixed(2),
        ink: inkReport,
        floors: { panel: +panelFloor.toFixed(3), editor: +editorFloor.toFixed(3), nav: +navFloor.toFixed(3) }
      }
    };
  }

  root.LCTSAnimeSolver = { analyze, ratio, lumOf, hex };
})(typeof globalThis !== 'undefined' ? globalThis : this);
