/* =============================================================================
   css.js — writes a solved scene as the role block core.css reads.

   Shared by the content script (LeetCode) and the Anime Studio preview, so
   what the preview shows is byte-for-byte what the page gets. Everything is
   scoped to html[data-lc-theme="anime"]: the block is inert under any other
   theme, which is why it can be injected before the choice is even known.
============================================================================= */
(function (root) {
  'use strict';

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${+a.toFixed(3)})`;
  }

  /* the alpha a layer needs over an already-veiled layer to total `total` */
  const over = (total, under) => Math.max(0, 1 - (1 - total) / (1 - under));

  /* theme: what LCTSAnimeSolver.analyze returned; urls: { wall, blur } */
  function build(theme, urls, customAlpha, paletteId) {
    const r = Object.assign({}, theme.roles);
    let scrim = theme.scrim;
    const pal = (paletteId && paletteId !== 'auto' && globalThis.LCTS_PALETTES && globalThis.LCTS_PALETTES[paletteId]) || null;
    if (pal) {
      if (pal.scrim) scrim = pal.scrim;
      if (pal.roles) Object.assign(r, pal.roles);
    }
    const a = Object.assign({}, theme.alpha, customAlpha || {});
    const veil = (x) => `linear-gradient(${rgba(scrim, x)},${rgba(scrim, x)})`;
    const wall = urls && urls.wall ? `url("${urls.wall}")` : 'none';
    const blur = urls && urls.blur ? `url("${urls.blur}")` : 'none';
    const out = Object.keys(r).map((k) => `${k}:${r[k]};`);
    out.push(
      `color-scheme:${theme.mode};`,
      `--lc-anime-scrim:${scrim};`,
      /* the scene: one fixed layer behind the whole app, barely veiled, so it
         shows most in the gutters and under the top bar */
      `--lc-anime-desk:${veil(a.desk)},${wall};`,
      /* panels are the solved scrim as a flat colour over that layer. A colour
         is all a panel repaints when it is resized; the art never repaints.
         The layer is already veiled by a.desk, so the panel adds only what is
         left to reach the opacity the solver chose: 1-(1-panel)/(1-desk). */
      `--lc-anime-glass:${rgba(scrim, over(a.panel, a.desk))};`,
      /* the editor glass: transparent scrim directly over the sharp wallpaper
         so the wallpaper is clearly visible without any shiny or blurry haze */
      `--lc-anime-editor-glass:${rgba(scrim, a.editor)};`,
      `--lc-anime-editor:none;`,
      `--lc-nav-bg:${rgba(scrim, a.nav)};`
    );
    return `html[data-lc-theme="anime"]{${out.join('')}}`;
  }

  root.LCTSAnimeCss = { build, rgba };
})(globalThis);
