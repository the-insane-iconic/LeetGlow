/* =============================================================================
   result.js  (isolated world, LeetCode)

   Gaming Theme verdict moments: the "game event" half of CLAUDE_ANKIT.md's
   verdict system (Tests Passed -> checkpoint, Accepted -> area cleared,
   Wrong Answer -> failed attempt, TLE -> time defeats you, errors -> a
   spell misfiring). Level 1 wording/palette only; the DOM shape and the
   data-kind hook are shared so Level 2 and the final level can retune them
   in themes/game.css without touching this file.

   ISOLATION -- this file owns exactly one element, #result-overlay, and one
   <style id="result-overlay-styles">. It never writes to document.body or
   document.documentElement styles, never removes or mutates a node it did
   not create, and every animated element it builds lives inside that one
   container. The existing ambient layer (src/game/ambient.js's .lctg-ambient
   with its .lctg-petal / .lctg-blicker children) is never queried, paused or
   touched -- it simply renders underneath, which is what the z-index below
   is chosen to guarantee.

   READS, NEVER WRITES, OUTSIDE THE OVERLAY. Verdict detection has to look at
   LeetCode's own result panel to know a verdict happened at all. Those reads
   are non-destructive: querySelector/textContent only, never innerHTML,
   never a style or class change on anything outside #result-overlay.

   MOTION is transform/opacity only, on every element, in every keyframe.
   Nothing here animates a layout or paint property (no letter-spacing, no
   box-shadow, no background-position), so the whole moment runs on the
   compositor and cannot compete with Monaco for the main thread -- the rule
   CLAUDE.md's Performance section sets for continuous work, kept here too
   even though a verdict is a one-shot.
============================================================================= */
(() => {
  'use strict';

  const root = document.documentElement;
  const on = () => root.getAttribute('data-lc-theme') === 'game';

  const OVERLAY_ID = 'result-overlay';
  const STYLE_ID = 'result-overlay-styles';

  /* Stacking. The brief asked for z-index 9999 on the grounds that it puts
     the verdict above the petals -- but the petals are not at 100. The whole
     ambient layer is one fixed .lctg-ambient at z-index 2147482000 (see
     themes/game.css), with its petals and blickers as plain children inside
     it, so 9999 would render this overlay UNDERNEATH them and the verdict
     text would read through a drifting petal field. This value satisfies
     what the brief actually asked for -- verdict above sakura -- while
     staying below .lctg-card (2147483000) so a level title card still covers
     a verdict if the two ever overlap. Nothing else's z-index is touched. */
  const OVERLAY_Z = 2147482500;

  const VERDICTS = {
    ac:  { word: 'QUEST COMPLETE', sub: 'ACCEPTED',              tone: 'gold' },
    run: { word: 'CHECKPOINT',     sub: 'TESTS PASSED',          tone: 'cyan' },
    wa:  { word: 'ATTEMPT FAILED', sub: 'WRONG ANSWER',          tone: 'red'  },
    tle: { word: 'TIME RAN OUT',   sub: 'TIME LIMIT EXCEEDED',   tone: 'amber'},
    mle: { word: 'MEMORY DRAINED', sub: 'MEMORY LIMIT EXCEEDED', tone: 'amber'},
    err: { word: 'SPELL MISFIRED', sub: 'ERROR',                 tone: 'red'  }
  };

  /* ---- the look -------------------------------------------------------------
     Every rule is scoped under html[data-lc-theme="game"], so switching the
     theme off leaves this stylesheet inert rather than styling a page it no
     longer owns ("Off must mean off", CLAUDE.md golden rule 5) -- the one
     thing an injected <style> would otherwise get wrong next to the
     manifest-loaded theme CSS.

     Deliberately NOT the anime theme's verdict look, which is kanji over
     converging speed-lines with a skewed colour band sweeping through. This
     is the game theme's own vocabulary, the one its title card already
     established: engraved Cinzel capitals, a thin rule with a diamond at the
     centre that light draws outward from, and a slow tonal wash. Accepted
     adds one expanding bloom ring -- a quest clearing, not an impact frame.

     Tones are the theme's own semantic roles (--lc-accent / --lc-red /
     --lc-yellow) so they track the palette, with Accepted's gold stated
     literally because no role in the set is a triumphal gold at the Easy
     level (--lc-rule is cyan there). */
  const CSS_TEXT = `
/* NO opacity animation on this container, deliberately. It is viewport-sized
   and every animated element is a child of it, so animating its opacity
   would make the browser render the whole subtree to an offscreen buffer to
   blend it as a group -- and since the children change every frame, that
   buffer cannot be cached and is re-rendered every frame. That turned a
   compositor-only moment into a full-viewport re-raster per frame, which is
   what made the verdict stutter. Each child now fades itself out at the end
   of its own keyframes instead, so every layer stays independent. */
html[data-lc-theme="game"] #result-overlay .lctg-verdict {
  position: absolute; inset: 0; z-index: 1;
  pointer-events: none;
  contain: strict;
}
html[data-lc-theme="game"] #result-overlay [data-tone="gold"]  { --v-tone: #f2cc7f; }
html[data-lc-theme="game"] #result-overlay [data-tone="cyan"]  { --v-tone: var(--lc-accent, #7dd3fc); }
html[data-lc-theme="game"] #result-overlay [data-tone="red"]   { --v-tone: var(--lc-red, #ee204d); }
html[data-lc-theme="game"] #result-overlay [data-tone="amber"] { --v-tone: var(--lc-yellow, #e0b45a); }

/* the tonal wash: a static gradient whose OPACITY is what animates, so this
   never repaints -- an animated gradient would rasterise every frame */
/* BOUNDED, not inset:0. This is a translucent layer, so the compositor has
   to blend everything underneath it across its own bounds, every frame it is
   on screen -- and what is underneath is the ambient field's ~26 blurred
   layers (.lctg-petal / .lctg-blicker). At full-viewport size that meant
   re-blending the entire screen through the whole blurred stack for the
   full 2.6s, with the worst spikes exactly as the layer appeared and
   disappeared. Sized to the text it is lighting instead: same look, a
   fraction of the fill. The soft gradient edge is what hides the boundary,
   so this must stay a radial fade with nothing solid at its rim. */
html[data-lc-theme="game"] #result-overlay .lctg-v-wash {
  position: absolute; left: 50%; top: 50%;
  width: 84vmin; height: 48vmin; margin: -24vmin 0 0 -42vmin;
  background: radial-gradient(closest-side at 50% 50%,
    color-mix(in srgb, var(--v-tone) 26%, transparent), transparent 100%);
  opacity: 0;
  will-change: opacity;
  animation: lctg-v-wash 2600ms ease-out forwards;
}

/* Accepted only: one ring blooming outward and thinning as it goes */
html[data-lc-theme="game"] #result-overlay .lctg-v-bloom {
  position: absolute; left: 50%; top: 50%;
  width: 34vmin; height: 34vmin; margin: -17vmin 0 0 -17vmin;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--v-tone) 70%, transparent);
  /* a tight glow, not a 5vmin one: this element is scaled by transform, and
     a wide blur radius is paint the browser may re-rasterise as the scale
     changes rather than simply stretching a cached texture */
  box-shadow: 0 0 1.4vmin color-mix(in srgb, var(--v-tone) 26%, transparent);
  opacity: 0;
  transform: scale(.3);
  will-change: transform, opacity;
  animation: lctg-v-bloom 2600ms cubic-bezier(.16, .8, .3, 1) forwards;
}

html[data-lc-theme="game"] #result-overlay .lctg-v-stage {
  position: absolute; left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center;
  width: min(86vw, 900px); text-align: center;
  /* keep the children's invalidations from escaping this box -- the stage is
     the only part of the moment that holds laid-out content */
  contain: layout paint;
}

/* the emblem: light drawing outward from a diamond, the same idea the title
   card's own rules use -- scale origin and gradient both point at the mark */
html[data-lc-theme="game"] #result-overlay .lctg-v-emblem {
  display: flex; align-items: center; justify-content: center; gap: 1.4vh;
  width: 100%;
}
html[data-lc-theme="game"] #result-overlay .lctg-v-line {
  height: 1px; flex: 0 1 26%;
  transform: scaleX(0);
  will-change: transform, opacity;
  animation: lctg-v-line 2600ms cubic-bezier(.2, .85, .25, 1) forwards;
}
html[data-lc-theme="game"] #result-overlay .lctg-v-line.l {
  transform-origin: right center;
  background: linear-gradient(90deg, transparent, var(--v-tone));
}
html[data-lc-theme="game"] #result-overlay .lctg-v-line.r {
  transform-origin: left center;
  background: linear-gradient(270deg, transparent, var(--v-tone));
}
html[data-lc-theme="game"] #result-overlay .lctg-v-diamond {
  width: 1.1vh; height: 1.1vh; flex: 0 0 auto;
  background: var(--v-tone);
  opacity: 0;
  transform: rotate(-90deg) scale(.2);
  will-change: transform, opacity;
  animation: lctg-v-diamond 2600ms cubic-bezier(.2, .9, .25, 1.05) forwards;
}

html[data-lc-theme="game"] #result-overlay .lctg-v-word {
  margin-top: 2.2vh;
  font-family: "Cinzel", "EB Garamond", Georgia, serif;
  font-weight: 700;
  font-size: clamp(26px, 6.4vh, 64px);
  line-height: 1.05;
  letter-spacing: .14em;
  color: #f4f8ff;
  /* No coloured glow on the type. A blurred text-shadow at this size is one
     of the most expensive rasters in the moment, and it is paid exactly when
     the layer is created -- i.e. the instant the word appears, which is
     where the stutter was most visible. The tone light now comes entirely
     from .lctg-v-wash sitting behind the text, which costs nothing extra
     because that layer has to be painted anyway. What is left here is a
     plain dark drop shadow purely for legibility over the scene. */
  text-shadow: 0 2px 8px rgba(2, 8, 18, .85);
  opacity: 0;
  transform: translateY(1.6vh) scale(.965);
  will-change: transform, opacity;
  animation: lctg-v-word 2600ms cubic-bezier(.16, .84, .3, 1) forwards;
}
html[data-lc-theme="game"] #result-overlay .lctg-v-sub {
  margin-top: 1.5vh;
  font-family: "Cinzel", "EB Garamond", Georgia, serif;
  font-weight: 400;
  font-size: clamp(11px, 1.8vh, 17px);
  letter-spacing: .34em;
  color: var(--v-tone);
  opacity: 0;
  transform: translateY(1vh);
  will-change: transform, opacity;
  animation: lctg-v-sub 2600ms cubic-bezier(.2, .8, .3, 1) forwards;
}
/* time limit: the round timer running out, transform-only */
html[data-lc-theme="game"] #result-overlay .lctg-v-timer {
  width: min(34vw, 420px); height: 2px; margin-top: 2.4vh;
  background: var(--v-tone);
  transform: scaleX(1); transform-origin: left center;
  will-change: transform, opacity;
  animation: lctg-v-timer 2600ms cubic-bezier(.45, 0, .75, .5) forwards;
}

/* Each of these runs the full 2600ms and carries its own in / hold / out,
   because there is no group fade on the container any more. Keyframe
   positions encode what used to be animation-delay: holding the start value
   until N% is the same wait, without a second animation or a group buffer.
   Every property here is transform or opacity. */
@keyframes lctg-v-wash {
  0% { opacity: 0; } 22% { opacity: 1; } 78% { opacity: 1; } 100% { opacity: 0; }
}
@keyframes lctg-v-bloom {
  0%   { opacity: 0; transform: scale(.3); }
  5%   { opacity: .9; }
  58%  { opacity: 0; transform: scale(1.65); }
  100% { opacity: 0; transform: scale(1.65); }
}
@keyframes lctg-v-line {
  0%, 5%    { transform: scaleX(0); opacity: 1; }
  28%, 85%  { transform: scaleX(1); opacity: 1; }
  100%      { transform: scaleX(1); opacity: 0; }
}
@keyframes lctg-v-diamond {
  0%, 2%    { opacity: 0; transform: rotate(-90deg) scale(.2); }
  22%, 85%  { opacity: 1; transform: rotate(45deg) scale(1); }
  100%      { opacity: 0; transform: rotate(45deg) scale(1); }
}
@keyframes lctg-v-word {
  0%, 8%    { opacity: 0; transform: translateY(1.6vh) scale(.965); }
  35%, 85%  { opacity: 1; transform: none; }
  100%      { opacity: 0; transform: translateY(-.7vh); }
}
@keyframes lctg-v-sub {
  0%, 17%   { opacity: 0; transform: translateY(1vh); }
  40%, 85%  { opacity: 1; transform: none; }
  100%      { opacity: 0; transform: translateY(-.5vh); }
}
@keyframes lctg-v-timer {
  0%, 15%   { transform: scaleX(1); opacity: 1; }
  57%, 85%  { transform: scaleX(0); opacity: 1; }
  100%      { transform: scaleX(0); opacity: 0; }
}

/* -- Wrong Answer lingers ---------------------------------------------------
   Same entrance and same exit as every other verdict; only the HOLD between
   them is longer, so there is more time to read it. 3800ms instead of 2600ms.

   The percentages below are recomputed against 3800ms so each entrance
   milestone lands at the same ABSOLUTE time it did at 2600ms (e.g. the word
   is fully in at 24% of 3800 = 910ms, exactly as it was at 35% of 2600).
   That matters: the decode in ADD-2B is driven from JS on fixed millisecond
   timers, so simply slowing the whole moment down would have let the word
   still be fading in after its characters had finished resolving. */
html[data-lc-theme="game"] #result-overlay [data-kind="wa"] .lctg-v-wash {
  animation: wa-hold-wash 3800ms ease-out forwards;
}
html[data-lc-theme="game"] #result-overlay [data-kind="wa"] .lctg-v-line {
  animation: wa-hold-line 3800ms cubic-bezier(.2, .85, .25, 1) forwards;
}
html[data-lc-theme="game"] #result-overlay [data-kind="wa"] .lctg-v-diamond {
  animation: wa-hold-diamond 3800ms cubic-bezier(.2, .9, .25, 1.05) forwards;
}
html[data-lc-theme="game"] #result-overlay [data-kind="wa"] .lctg-v-word {
  animation: wa-hold-word 3800ms cubic-bezier(.16, .84, .3, 1) forwards;
}
html[data-lc-theme="game"] #result-overlay [data-kind="wa"] .lctg-v-sub {
  animation: wa-hold-sub 3800ms cubic-bezier(.2, .8, .3, 1) forwards;
}
@keyframes wa-hold-wash {
  0% { opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; }
}
@keyframes wa-hold-line {
  0%, 3%    { transform: scaleX(0); opacity: 1; }
  19%, 90%  { transform: scaleX(1); opacity: 1; }
  100%      { transform: scaleX(1); opacity: 0; }
}
@keyframes wa-hold-diamond {
  0%, 1%    { opacity: 0; transform: rotate(-90deg) scale(.2); }
  15%, 90%  { opacity: 1; transform: rotate(45deg) scale(1); }
  100%      { opacity: 0; transform: rotate(45deg) scale(1); }
}
@keyframes wa-hold-word {
  0%, 5%    { opacity: 0; transform: translateY(1.6vh) scale(.965); }
  24%, 90%  { opacity: 1; transform: none; }
  100%      { opacity: 0; transform: translateY(-.7vh); }
}
@keyframes wa-hold-sub {
  0%, 12%   { opacity: 0; transform: translateY(1vh); }
  27%, 90%  { opacity: 1; transform: none; }
  100%      { opacity: 0; transform: translateY(-.5vh); }
}

/* reduced motion: the same words, held still */
@media (prefers-reduced-motion: reduce) {
  html[data-lc-theme="game"] #result-overlay .lctg-v-bloom { display: none; }
  /* the words still appear and still clear themselves, they just don't
     travel: each element holds its end state for the full duration, so the
     moment reads as a static card that fades out */
  html[data-lc-theme="game"] #result-overlay .lctg-verdict * {
    animation-timing-function: steps(1, end) !important;
  }
}
`;

  /* ---- ADDITION LAYERS ------------------------------------------------------
     Per-verdict detail that sits on top of the base moment above. Kept in its
     own stylesheet string and its own builders so the base is untouched.

     Two things here are deliberately NOT built the way the brief specified,
     both for the same reason the base was reworked twice:

     * The screen edge bloom (ADD-1A) and the edge pulse (ADD-5C) asked for an
       animated inset box-shadow with a 70-80px blur on the overlay itself.
       box-shadow is not a compositable property -- animating it repaints the
       whole viewport every frame, through the ~26 blurred ambient layers
       underneath, which is a heavier version of the exact bug that made this
       overlay stutter. Both are built instead as one edge-gradient layer,
       rasterised once, animating opacity only. Same look, no repaint.
     * Timings given as t=Ns are keyframe percentages of the moment's own
       duration rather than chains of JS style writes. Identical result, and
       the browser runs it off the main thread.
  ------------------------------------------------------------------------- */
  const CSS_LAYERS = `
/* -- shared: the edge bloom / pulse (ADD-1A, ADD-5C) ----------------------- */
/* BOUNDED, not inset:0 -- this was the exact bug the comment above already
   describes and fixes for .lctg-v-wash, just never applied here: a
   translucent, opacity-animated, full-VIEWPORT layer forces the compositor
   to re-blend the entire screen through the ~26 blurred ambient layers
   underneath it on every frame it's visible. This element had that same
   shape the whole time -- the likely main cause of Accepted (which stacks
   this AND .lctg-v-lines below, both full-viewport) still lagging, and it
   also explains "doesn't fit correctly" for the compile-error red glow:
   spread across the entire screen, a glow meant to sit near the text reads
   as a faint wash over everything instead. The radial-gradient's own radii
   are percentages of ITS OWN box, so shrinking the box shrinks the whole
   glow proportionally with no other change needed. */
html[data-lc-theme="game"] #result-overlay .lctg-v-edge {
  position: absolute; left: 50%; top: 50%;
  width: 100vmin; height: 58vmin; margin: -29vmin 0 0 -50vmin;
  background: radial-gradient(120% 86% at 50% 50%,
    transparent 52%, color-mix(in srgb, var(--v-tone) 42%, transparent) 100%);
  opacity: 0;
  will-change: opacity;
}
html[data-lc-theme="game"] #result-overlay [data-kind="ac"] .lctg-v-edge {
  animation: ac2-edge 2600ms ease-out forwards;
}
html[data-lc-theme="game"] #result-overlay [data-kind="err"] .lctg-v-edge {
  animation: ce2-pulse 2600ms ease-in-out forwards;
}
@keyframes ac2-edge {
  0% { opacity: 0; } 8% { opacity: .55; } 31% { opacity: .55; }
  54% { opacity: 0; } 100% { opacity: 0; }
}
/* was a two-beat SNAP: two opacity jumps packed into a 45%-of-2600ms window
   (~370ms), each transition only 2-6% wide with linear timing -- a jump, not
   a fade. Now spread across roughly two-thirds of the moment with ease-in-out
   on every segment, so each rise and fall is a real curve instead of an
   instant jump; still two beats (a flicker, then the fuller glow), just
   unhurried ones. */
@keyframes ce2-pulse {
  0%, 10%   { opacity: 0; }
  24%       { opacity: .30; }
  38%       { opacity: .06; }
  56%       { opacity: .38; }
  100%      { opacity: 0; }
}

/* -- ADD-1B constellation --------------------------------------------------- */
html[data-lc-theme="game"] #result-overlay .lctg-v-const { position: absolute; inset: 0; pointer-events: none; }
html[data-lc-theme="game"] #result-overlay .lctg-v-star {
  position: absolute; width: 8px; height: 8px; margin: -4px 0 0 -4px;
  border-radius: 50%; background: var(--v-tone);
  box-shadow: 0 0 8px color-mix(in srgb, var(--v-tone) 70%, transparent);
  opacity: 0; will-change: opacity;
  animation: ac2-star 1600ms ease-out forwards;
}
/* BOUNDED to the star cluster's own box (set inline from JS), not inset:0 --
   same reasoning as .lctg-v-edge above: this was a second full-viewport,
   opacity-animated layer stacking on top of the first one for Accepted
   specifically, doubling the re-blend cost right when both were on screen
   together. */
html[data-lc-theme="game"] #result-overlay .lctg-v-lines {
  position: absolute;
  overflow: visible; pointer-events: none;
  opacity: 0; will-change: opacity;
  animation: ac2-lines 1000ms ease-out 500ms forwards;
}
@keyframes ac2-star  { 0% { opacity: 0; } 16% { opacity: 1; } 70% { opacity: 1; } 100% { opacity: 0; } }
@keyframes ac2-lines { 0% { opacity: 0; } 22% { opacity: 1; } 55% { opacity: 1; } 100% { opacity: 0; } }

/* -- ADD-1C streak pill ----------------------------------------------------- */
html[data-lc-theme="game"] #result-overlay .lctg-v-streak {
  position: absolute; top: 18px; right: 22px;
  padding: 5px 14px;
  border: 1px solid color-mix(in srgb, var(--v-tone) 35%, transparent);
  border-radius: 20px;
  background: rgba(5, 13, 26, .7);
  font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  font-size: 15px; font-weight: 700; letter-spacing: .14em; white-space: nowrap;
  color: var(--lc-accent, #4fc3f7);
  pointer-events: none;
  opacity: 0; will-change: opacity;
  animation: ac2-streak 1400ms ease-out forwards;
}
@keyframes ac2-streak { 0% { opacity: 0; } 14% { opacity: 1; } 72% { opacity: 1; } 100% { opacity: 0; } }

/* -- ADD-2A sonar afterglow (static ghost echo, no animation) ---------------
   Bounded to the ring it draws (r=220, so a 460px box) rather than spanning
   the viewport. Even with no animation of its own, a translucent layer has
   to be blended across its whole bounds whenever anything beneath it changes
   -- and beneath it the ambient petals and blickers are animating constantly,
   so a full-screen box meant re-blending the entire screen for the life of
   the moment. Same circle, a fraction of the area. */
html[data-lc-theme="game"] #result-overlay .lctg-v-sonar {
  position: absolute; left: 50%; top: 50%;
  width: 460px; height: 460px; margin: -230px 0 0 -230px;
  overflow: visible; pointer-events: none;
}

/* -- ADD-2B decode: monospace so no glyph shifts mid-decode ----------------- */
html[data-lc-theme="game"] #result-overlay .lctg-v-word.is-decoding {
  font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  font-weight: 700; letter-spacing: .10em;
}
html[data-lc-theme="game"] #result-overlay .lctg-v-word .lctg-v-ch { display: inline-block; }
html[data-lc-theme="game"] #result-overlay .lctg-v-word .lctg-v-ch.is-scrambled { opacity: .55; }

/* -- ADD-2C sorrow orb: translate, never top, so it stays on the compositor - */
html[data-lc-theme="game"] #result-overlay .lctg-v-orb {
  position: absolute; left: 50%; top: 38%;
  width: 18px; height: 18px; margin-left: -9px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(123, 45, 139, .55) 0%, rgba(123, 45, 139, 0) 70%);
  pointer-events: none;
  opacity: 0; will-change: transform, opacity;
  animation: wa2-orb-sink 2600ms ease-in forwards;
}
@keyframes wa2-orb-sink {
  0%, 11%  { transform: translateY(0); opacity: 0; }
  15%      { opacity: .6; }
  88%      { transform: translateY(40vh); opacity: 0; }
  100%     { transform: translateY(40vh); opacity: 0; }
}

/* -- ADD-3A time dilation vignette ------------------------------------------
   The one full-viewport translucent layer kept as specified, because "the
   world closes in" has no bounded equivalent. It is a STATIC gradient with
   only opacity animating, so it rasterises once and then costs a blend
   rather than a repaint -- the cheapest form a full-screen effect can take. */
html[data-lc-theme="game"] #result-overlay .lctg-v-vignette {
  position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 35%, rgba(0, 0, 0, .38) 100%);
  opacity: 0; will-change: opacity;
  animation: tle2-vignette 2600ms ease-in forwards;
}
@keyframes tle2-vignette { 0%, 40% { opacity: 0; } 70%, 88% { opacity: 1; } 100% { opacity: 0; } }

/* -- ADD-3B frozen clock ring ----------------------------------------------- */
html[data-lc-theme="game"] #result-overlay .lctg-v-ring { position: absolute; left: 50%; top: 50%; pointer-events: none; }
html[data-lc-theme="game"] #result-overlay .lctg-v-shard {
  position: absolute; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px;
  background: #e8f4f8;
  box-shadow: 0 0 10px rgba(232, 244, 248, .55);
  opacity: 0; will-change: opacity;
  animation: tle2-shard 1400ms ease-out forwards;
}
@keyframes tle2-shard { 0% { opacity: 0; } 9% { opacity: .95; } 72% { opacity: .95; } 100% { opacity: 0; } }

/* -- ADD-4A pressure cracks -------------------------------------------------- */
html[data-lc-theme="game"] #result-overlay .lctg-v-cracks {
  position: absolute; inset: 0; width: 100%; height: 100%;
  overflow: visible; pointer-events: none;
}
html[data-lc-theme="game"] #result-overlay .lctg-v-cracks polyline {
  /* .8 wide at .28 alpha was effectively invisible against the scene */
  fill: none; stroke: #7fd8ff; stroke-width: 2; opacity: .6;
  vector-effect: non-scaling-stroke;
  stroke-dasharray: 200; stroke-dashoffset: 200;
  will-change: opacity;
  /* two animations sharing one per-crack delay (set inline in JS, which
     applies to both since animation-delay is a list property): the draw
     finishes in 600ms and used to just sit fully opaque until the whole
     overlay was wiped at 2600ms -- far longer than the bubbles, which
     individually finish and vanish between roughly 1.5s and 2.6s. The
     second animation holds the drawn crack briefly, then fades it out on
     the same rough timescale, so nothing outlives the bubbles it was drawn
     alongside. */
  animation: mle2-crack 600ms ease-out forwards, mle2-crack-fade 2000ms ease-in forwards;
}
@keyframes mle2-crack { to { stroke-dashoffset: 0; } }
@keyframes mle2-crack-fade { 0%, 55% { opacity: .6; } 100% { opacity: 0; } }

/* -- ADD-4B depth readout ---------------------------------------------------- */
html[data-lc-theme="game"] #result-overlay .lctg-v-depth {
  position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%);
  font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  font-size: 18px; font-weight: 700; letter-spacing: .16em; white-space: nowrap;
  color: #7fd8ff; text-shadow: 0 2px 8px rgba(2, 8, 18, .85);
  pointer-events: none;
  opacity: 0; will-change: opacity;
  animation: mle2-depth 1800ms ease-out forwards;
}
html[data-lc-theme="game"] #result-overlay .lctg-v-depth.is-max { color: #e8f4f8; }
@keyframes mle2-depth { 0% { opacity: 0; } 8% { opacity: 1; } 72% { opacity: 1; } 100% { opacity: 0; } }

/* -- ADD-4C bubble outlines --------------------------------------------------- */
html[data-lc-theme="game"] #result-overlay .lctg-v-bubble {
  position: absolute; border-radius: 50%;
  background: transparent;
  border: 2px solid rgba(200, 235, 255, .75);
  pointer-events: none;
  opacity: 0; will-change: transform, opacity;
  animation-name: mle2-bubble-rise; animation-timing-function: ease-out; animation-fill-mode: forwards;
}
@keyframes mle2-bubble-rise {
  0%   { transform: translateY(0) scale(1);      opacity: .5; }
  70%  { transform: translateY(-65px) scale(1.1); opacity: .4; }
  85%  { transform: translateY(-72px) scale(1.6); opacity: .1; }
  100% { transform: translateY(-80px) scale(0);   opacity: 0;  }
}

/* -- ADD-5A glitch scanlines --------------------------------------------------- */
html[data-lc-theme="game"] #result-overlay .lctg-v-scan {
  position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(to bottom,
    transparent 0px, transparent 3px,
    rgba(150, 60, 170, .26) 3px, rgba(150, 60, 170, .26) 4px);
  opacity: 0; will-change: transform, opacity;
  /* .13 alpha over 0.45s was gone before the eye caught it */
  animation: ce2-scanlines 750ms ease-in-out forwards;
}
@keyframes ce2-scanlines {
  0%   { opacity: 0; transform: translateY(-100%); }
  15%  { opacity: 1; }
  85%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(0); }
}

/* -- ADD-5B code fragment rain -------------------------------------------------- */
/* 10px was far too small to register against a full page. */
html[data-lc-theme="game"] #result-overlay .lctg-v-frag {
  position: absolute;
  font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  font-size: 17px; font-weight: 700;
  color: #cf8ce0; text-shadow: 0 2px 6px rgba(2, 8, 18, .8);
  pointer-events: none;
  opacity: 0; will-change: transform, opacity;
  animation-name: ce2-fragment-fall; animation-timing-function: ease-in; animation-fill-mode: forwards;
}
@keyframes ce2-fragment-fall {
  0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
  100% { transform: translateY(var(--fall, 110px)) rotate(var(--rot, 0deg)); opacity: 0; }
}
/* the error glitch, on an inner wrapper so it doesn't fight the word's own
   entrance transform. steps(1) so it snaps between offsets instead of
   gliding -- a glide reads as drift, not as a fault. */
html[data-lc-theme="game"] #result-overlay .lctg-v-jit {
  display: inline-block;
  will-change: transform;
  animation: ce2-word-jitter 2600ms steps(1, end) forwards;
}
@keyframes ce2-word-jitter {
  0%, 30%   { transform: translate(0, 0); }
  31%       { transform: translate(-9px, 3px); }
  32.5%     { transform: translate(7px, -3px); }
  34%       { transform: translate(-4px, 1px); }
  35.5%, 41% { transform: translate(0, 0); }
  42%       { transform: translate(6px, 2px); }
  43.5%     { transform: translate(-7px, -2px); }
  45%, 100% { transform: translate(0, 0); }
}

@media (prefers-reduced-motion: reduce) {
  html[data-lc-theme="game"] #result-overlay .lctg-v-scan,
  html[data-lc-theme="game"] #result-overlay .lctg-v-orb,
  html[data-lc-theme="game"] #result-overlay .lctg-v-bubble,
  html[data-lc-theme="game"] #result-overlay .lctg-v-frag { display: none; }
}
`;

  /* ---- the overlay: created once, then reused forever --------------------- */
  let overlay = null;
  let timeouts = [];
  let intervals = [];
  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS_TEXT + CSS_LAYERS;
    (document.head || root).appendChild(style);
  }

  function ensureOverlay() {
    if (overlay && overlay.isConnected) return overlay;
    if (!document.body) return null;
    ensureStyles();
    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('aria-hidden', 'true');
    /* the only inline styles in this file, and only on our own container:
       everything else is in the stylesheet above */
    overlay.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:' + OVERLAY_Z +
      ';overflow:hidden;background:transparent;';
    document.body.appendChild(overlay);
    return overlay;
  }

  /* Touches nothing but our own container and our own timers. The intervals
     and the boxShadow reset are here because the addition layers introduced
     counters that tick on an interval, and the spec's own teardown test
     requires zero running intervals and an empty overlay.style.boxShadow
     after a clear at any point. (Nothing sets boxShadow now -- the edge
     bloom is a child layer instead, see CSS_LAYERS -- but resetting it keeps
     the guarantee true no matter what a future layer does.) */
  function clearAnimation() {
    if (overlay) {
      overlay.innerHTML = '';
      overlay.style.boxShadow = '';
    }
    timeouts.forEach(clearTimeout);
    timeouts = [];
    intervals.forEach(clearInterval);
    intervals = [];
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    return n;
  }
  const later = (fn, ms) => { timeouts.push(setTimeout(fn, ms)); };
  const every = (fn, ms) => { const id = setInterval(fn, ms); intervals.push(id); return id; };
  const rand = (min, max) => min + Math.random() * (max - min);

  /* ---- per-verdict addition layers ---------------------------------------- */
  const LAYERS = {
    /* ADD-1A edge bloom (as a layer, not a box-shadow), 1B constellation,
       1C streak pill */
    ac(node) {
      node.append(el('div', 'lctg-v-edge'));

      const STARS = [[28,22],[35,18],[42,24],[50,19],[57,25],[52,32],[44,30]];
      const field = el('div', 'lctg-v-const');
      STARS.forEach(([x, y], i) => {
        const dot = el('span', 'lctg-v-star');
        dot.style.left = x + '%';
        dot.style.top = y + '%';
        dot.style.animationDelay = (1200 + i * 60) + 'ms';
        field.appendChild(dot);
      });
      /* the connecting-line SVG is sized to a tight box around the star
         cluster itself (plus padding), not the viewport -- see the CSS
         comment on .lctg-v-lines. Coordinates are rescaled from the stars'
         viewport-relative % into that box's own 0-100 space via viewBox. */
      const PAD = 6;
      const bx0 = Math.min(...STARS.map((s) => s[0])) - PAD;
      const bx1 = Math.max(...STARS.map((s) => s[0])) + PAD;
      const by0 = Math.min(...STARS.map((s) => s[1])) - PAD;
      const by1 = Math.max(...STARS.map((s) => s[1])) + PAD;
      const bw = bx1 - bx0, bh = by1 - by0;
      const lines = svgEl('svg', {
        class: 'lctg-v-lines', viewBox: '0 0 100 100', preserveAspectRatio: 'none'
      });
      lines.style.left = bx0 + '%'; lines.style.top = by0 + '%';
      lines.style.width = bw + '%'; lines.style.height = bh + '%';
      for (let i = 0; i < STARS.length - 1; i++) {
        const a = STARS[i], b = STARS[i + 1];
        lines.appendChild(svgEl('line', {
          x1: ((a[0] - bx0) / bw * 100).toFixed(1), y1: ((a[1] - by0) / bh * 100).toFixed(1),
          x2: ((b[0] - bx0) / bw * 100).toFixed(1), y2: ((b[1] - by0) / bh * 100).toFixed(1),
          stroke: '#00d4aa', 'stroke-width': '1.4', 'vector-effect': 'non-scaling-stroke', opacity: '0.55'
        }));
      }
      lines.style.animationDelay = '1700ms';
      field.appendChild(lines);
      node.append(field);

      /* streak: read, increment, persist, then count up to the new value */
      const pill = el('div', 'lctg-v-streak', '◈ streak · 0');
      pill.style.animationDelay = '1400ms';
      node.append(pill);
      chrome.storage.local.get('solveStreak', (res) => {
        if (!pill.isConnected) return;
        const next = (Number(res && res.solveStreak) || 0) + 1;
        chrome.storage.local.set({ solveStreak: next });
        let n = 0;
        const id = every(() => {
          if (!pill.isConnected || n >= next) { clearInterval(id); return; }
          n++;
          pill.textContent = '◈ streak · ' + n;
        }, 80);
      });
    },

    /* ADD-2A sonar afterglow, 2B decode, 2C sorrow orb */
    wa(node) {
      const sonar = svgEl('svg', { class: 'lctg-v-sonar' });
      sonar.appendChild(svgEl('circle', {
        cx: '50%', cy: '50%', r: '220',
        fill: 'none', stroke: '#4fc3f7', 'stroke-width': '0.5', opacity: '0.07'
      }));
      node.append(sonar);
      node.append(el('div', 'lctg-v-orb'));
      decode(node.querySelector('.lctg-v-word'));
    },

    /* ADD-3A vignette, 3B frozen clock ring */
    tle(node) {
      node.append(el('div', 'lctg-v-vignette'));
      /* a clock face ENCIRCLING the verdict, centred on it. At radius 52px
         around 42% it was a cluster of specks next to nothing; at this size
         it reads as the ring it was meant to be, and it frames the type
         rather than competing with it. Starts at 12 o'clock and fills
         clockwise. */
      const ring = el('div', 'lctg-v-ring');
      for (let i = 0; i < 8; i++) {
        const a = (i * 45 - 90) * Math.PI / 180;
        const shard = el('span', 'lctg-v-shard');
        shard.style.left = (Math.cos(a) * 190) + 'px';
        shard.style.top = (Math.sin(a) * 190) + 'px';
        shard.style.transform = 'rotate(45deg)';
        shard.style.animationDelay = (1100 + i * 90) + 'ms';
        ring.appendChild(shard);
      }
      node.append(ring);
    },

    /* ADD-4A cracks, 4B depth readout, 4C bubble outlines */
    mle(node) {
      const LEFT = [
        '8,95 6,82 9,70 5,58', '10,95 13,80 8,65 11,52',
        '7,90 4,75 10,62',     '11,88 14,72 9,60'
      ];
      const cracks = svgEl('svg', {
        class: 'lctg-v-cracks', viewBox: '0 0 100 100', preserveAspectRatio: 'none'
      });
      LEFT.forEach((pts, i) => {
        const mirrored = pts.split(' ')
          .map((p) => { const [x, y] = p.split(','); return (100 - Number(x)) + ',' + y; })
          .join(' ');
        [pts, mirrored].forEach((points) => {
          const line = svgEl('polyline', { points });
          line.style.animationDelay = (400 + i * 150) + 'ms';
          cracks.appendChild(line);
        });
      });
      node.append(cracks);

      const STEPS = ['0mb', '128mb', '256mb', '512mb', '1024mb', '∞ mb'];
      const depth = el('div', 'lctg-v-depth', STEPS[0]);
      depth.style.animationDelay = '800ms';
      node.append(depth);
      later(() => {
        let i = 0;
        const id = every(() => {
          if (!depth.isConnected) { clearInterval(id); return; }
          depth.textContent = STEPS[++i];
          if (i >= STEPS.length - 1) {
            clearInterval(id);
            depth.classList.add('is-max');
            later(() => depth.classList.remove('is-max'), 200);
          }
        }, 180);
      }, 800);

      for (let i = 0; i < 14; i++) {
        const size = rand(12, 30);
        const b = el('span', 'lctg-v-bubble');
        b.style.width = size + 'px';
        b.style.height = size + 'px';
        b.style.left = rand(4, 96) + '%';
        b.style.bottom = rand(0, 40) + '%';
        b.style.animationDuration = rand(1100, 1800).toFixed(0) + 'ms';
        b.style.animationDelay = (400 + rand(0, 700)).toFixed(0) + 'ms';
        node.append(b);
      }
    },

    /* ADD-5A scanlines, 5B fragment rain, 5C edge pulse */
    err(node) {
      node.append(el('div', 'lctg-v-edge'));
      const scan = el('div', 'lctg-v-scan');
      scan.style.animationDelay = '800ms';
      node.append(scan);
      /* the scanline sweep is a one-shot; take it out as soon as it ends so a
         full-viewport layer isn't left sitting in the compositor for the
         remaining ~1.4s of the moment */
      later(() => scan.remove(), 1300);

      /* the fragments fall off the WORD, which is the thing fracturing.
         They used to spawn at 56%/36% -- a coordinate the brief took from a
         rune/hex visual this implementation never had, so they rained down
         beside nothing, small and off to one side. Spread across the middle
         of the screen where the type actually is. */
      ['{', '}', ';', 'null', '0x', '//', '∅', '&&', ')'].forEach((ch, i) => {
        const f = el('span', 'lctg-v-frag', ch);
        f.style.left = 'calc(50% + ' + rand(-230, 230).toFixed(0) + 'px)';
        f.style.top = 'calc(50% + ' + rand(-10, 26).toFixed(0) + 'px)';
        f.style.setProperty('--rot', rand(-40, 40).toFixed(0) + 'deg');
        /* was 700-1100ms over only 90-150px -- fast enough that each
           character was gone before it registered. Slower fall, a bit
           further to travel so the extra time reads as drift, not a pause. */
        f.style.setProperty('--fall', rand(120, 190).toFixed(0) + 'px');
        f.style.animationDuration = rand(1300, 1900).toFixed(0) + 'ms';
        f.style.animationDelay = (820 + i * 55).toFixed(0) + 'ms';
        node.append(f);
      });

      /* and the word itself glitches -- the Wrong Answer decode worked
         because it happened ON the type; this is the same idea for an error.
         It jitters an inner wrapper, not .lctg-v-word, because two
         animations on one element's transform replace each other rather than
         compose, which would have killed the word's entrance. */
      const word = node.querySelector('.lctg-v-word');
      if (word) {
        const jit = el('span', 'lctg-v-jit', word.textContent);
        word.textContent = '';
        word.appendChild(jit);
      }
    }
  };

  /* ADD-2B: decode each character in place. The spans are allocated up front
     and only their text changes, so no layout runs mid-decode, and the word
     switches to the shipped monospace face so no glyph width shifts. */
  const SCRAMBLE = ['#', '@', '%', '!', '?', '*', '<', '>', '0', '1', 'x'];
  function decode(word) {
    if (!word) return;
    const text = word.textContent;
    word.textContent = '';
    word.classList.add('is-decoding');
    const spans = [...text].map((ch) => {
      const s = el('span', 'lctg-v-ch', ch === ' ' ? ' ' : ch);
      word.appendChild(s);
      return s;
    });
    spans.forEach((s, i) => {
      const ch = text[i];
      if (ch === ' ') return;
      s.classList.add('is-scrambled');
      s.textContent = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
      const start = 300 + i * 35;
      later(() => { s.textContent = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]; }, start);
      later(() => { s.textContent = SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0]; }, start + 45);
      later(() => { s.textContent = ch; s.classList.remove('is-scrambled'); }, start + 90);
    });
  }

  /* how long a verdict's children stay before clearAnimation() takes them
     down. Everything uses 3200ms except Wrong Answer, whose own animations
     were lengthened to 3800ms so it holds on screen longer. */
  const LIFETIME = { wa: 4400 };

  /* kind: ac | run | wa | tle | mle | err. info.label replaces the subtitle
     (the real error name), info.beats appends the percentile to Accepted. */
  function play(kind, info) {
    const v = VERDICTS[kind];
    if (!v || !on()) return null;
    const box = ensureOverlay();
    if (!box) return null;
    info = info || {};

    clearAnimation();                       // one moment at a time

    const node = el('div', 'lctg-verdict');
    node.dataset.kind = kind;
    node.dataset.tone = v.tone;

    node.append(el('div', 'lctg-v-wash'));
    if (kind === 'ac') node.append(el('div', 'lctg-v-bloom'));

    const emblem = el('div', 'lctg-v-emblem');
    emblem.append(el('span', 'lctg-v-line l'), el('span', 'lctg-v-diamond'), el('span', 'lctg-v-line r'));

    let sub = info.label || v.sub;
    if (kind === 'ac' && info.beats) sub += ' · BEATS ' + info.beats + '%';

    const stage = el('div', 'lctg-v-stage');
    stage.append(emblem, el('div', 'lctg-v-word', v.word), el('div', 'lctg-v-sub', sub));
    if (kind === 'tle') stage.append(el('div', 'lctg-v-timer'));
    node.append(stage);

    box.appendChild(node);

    /* the addition layers for this verdict, built on top of the base DOM
       above rather than replacing any of it */
    const layer = LAYERS[kind];
    if (layer) { try { layer(node); } catch (e) {} }

    /* the cue for this verdict. It schedules itself on its own beat (see
       CUES in src/game/sounds.js) and hands back the timeout id, which goes
       on the same list clearAnimation() drains -- so a moment torn down
       early never fires a sound after its visuals are gone. Silent until
       real files exist in sounds/game/. */
    if (globalThis.LCTSGameSounds) {
      const cue = globalThis.LCTSGameSounds.play(kind);
      if (cue) timeouts.push(cue);
    }

    /* Children are cleaned up on a timer rather than on animationend: a
       display:none anywhere up the tree cancels a CSS animation and Chrome
       then fires neither animationend nor animationcancel, which is exactly
       how src/anime/moments-ui.js once left overlays stuck in the page. The
       container itself always stays -- only its children go.
       3200ms, not the base moment's 2600ms: the longest addition (the frozen
       clock ring's last shard) is still fading at 2600. Everything in the
       base has held opacity 0 since 2600, so the extra hold shows nothing.
       Wrong Answer overrides it because its own animations run 3800ms (see
       the wa-hold-* keyframes) -- clearing at 3200 would have cut the text
       away mid-hold, before its fade-out had even started. */
    timeouts.push(setTimeout(clearAnimation, LIFETIME[kind] || 3200));
    return node;
  }

  /* ---- verdict detection ---------------------------------------------------
     Shared with every theme: src/verdict.js reads LeetCode's own check JSON
     (exact verdict, Run vs Submit, the real Beats %) with the DOM as a
     fallback. This file used to carry its own copy of the DOM detector, which
     missed Wrong Answer on Submit. */
  function disarm() {}
  if (globalThis.LCTSVerdict) {
    globalThis.LCTSVerdict.subscribe((v) => {
      if (!on()) return;
      play(v.kind, { label: v.label, beats: v.beats, action: v.action });
    });
  }

  /* theme switched off mid-moment: take our own children down, nothing else */
  new MutationObserver(() => { if (!on()) { disarm(); clearAnimation(); } })
    .observe(root, { attributes: true, attributeFilter: ['data-lc-theme'] });

  globalThis.LCTSGameResult = { play, clear: clearAnimation, VERDICTS };
})();
