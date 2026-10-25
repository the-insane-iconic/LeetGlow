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
  function build(theme, urls) {
    const r = theme.roles, a = theme.alpha, scrim = theme.scrim;
    const veil = (x) => `linear-gradient(${rgba(scrim, x)},${rgba(scrim, x)})`;
    const wall = `url("${urls.wall}")`, blur = `url("${urls.blur}")`;
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
      /* the editor: the pre-blurred copy under a deeper scrim -- frosted glass */
      `--lc-anime-editor:${veil(a.editor)},${blur};`,
      `--lc-nav-bg:${rgba(scrim, a.nav)};`
    );
    return `html[data-lc-theme="anime"]{${out.join('')}}`;
  }

  root.LCTSAnimeCss = { build, rgba };
})(globalThis);
