/* =============================================================================
   title-card.js — Gaming Theme: the cinematic "LEVEL N" title card.

   Phase 1 scope (see CLAUDE_ANKIT.md): Level 1 / "MYSTICAL NIGHT", no
   sound, no verdicts. The real LeetCode page stays visible behind a
   translucent dark overlay -- this never paints its own background image,
   it only darkens what's already there. A subtle sakura petal field (see
   src/game/petals.js) drifts across the card while it's up -- a small,
   single-direction breeze, not a shower.

   Structure/lifecycle mirrors src/anime/moments-ui.js's titleCard()
   (mount, click/keydown dismiss, animationend + timeout cleanup), but the
   visual layer is entirely its own (lctg-* classnames), and every level's
   text/colour/intensity is driven by `info` + a `data-lctg-level` attribute
   so Level 2 (Medium) and the final level (Hard) can reuse this same
   function and DOM shape with their own CSS, rather than a new module each.
============================================================================= */
(function (root) {
  'use strict';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function svg(inner) {
    var wrap = document.createElement('div');
    wrap.innerHTML = inner;
    return wrap.firstChild;
  }

  /* a small original four-point compass star -- two overlapping diamonds,
     not any recognisable game/franchise mark */
  var EMBLEM_SVG =
    '<svg class="lctg-star" viewBox="0 0 40 40" aria-hidden="true">' +
      '<path class="lctg-star-v" d="M20 1 L24 20 L20 39 L16 20 Z"/>' +
      '<path class="lctg-star-h" d="M1 20 L20 16 L39 20 L20 24 Z"/>' +
    '</svg>';

  /* info: { level, levelLabel, tagline, title } */
  function titleCard(info, host) {
    info = info || {};
    host = host || document.body || document.documentElement;
    host.querySelectorAll(':scope > .lctg-card').forEach(function (n) {
      if (n._lctgPetals) n._lctgPetals.destroy();   // stop its rAF loop, not just detach the node
      n.remove();
    });

    var level = info.level || 1;
    var levelLabel = info.levelLabel || ('LEVEL ' + level);
    var tagline = info.tagline || 'MYSTICAL NIGHT';
    var taglineWords = tagline.split(' ');
    var mid = Math.ceil(taglineWords.length / 2);
    var left = taglineWords.slice(0, mid).join(' ');
    var right = taglineWords.slice(mid).join(' ');

    var node = el('div', 'lctg-card');
    node.setAttribute('aria-hidden', 'true');
    node.setAttribute('data-lctg-level', String(level));
    node.append(el('div', 'lctg-dim'), el('div', 'lctg-bar top'), el('div', 'lctg-bar bottom'));

    var emblem = el('div', 'lctg-emblem');
    emblem.append(el('span', 'lctg-emblem-line l'), svg(EMBLEM_SVG), el('span', 'lctg-emblem-line r'));

    var main = el('div', 'lctg-main');
    main.append(
      el('span', 'lctg-half l', left), el('span', 'lctg-half r', right),
      el('div', 'lctg-glint a'), el('div', 'lctg-glint b')
    );

    var lower = el('div', 'lctg-lower');
    lower.append(el('span', 'lctg-emblem-line l'), el('span', 'lctg-diamond'), el('span', 'lctg-emblem-line r'));

    var stage = el('div', 'lctg-stage');
    stage.append(
      emblem,
      el('div', 'lctg-level', levelLabel),
      main,
      lower,
      el('div', 'lctg-problem', info.title || '')
    );
    node.append(stage);

    host.appendChild(node);
    var petals = root.LCTSGamePetals ? root.LCTSGamePetals.mount(node, { imageUrl: info.petalImageUrl }) : null;
    node._lctgPetals = petals;

    var removed = false, leaving = false;
    function cleanup() {
      if (removed) return;
      removed = true;
      if (petals) petals.destroy();
      node.remove();
      document.removeEventListener('keydown', leave, true);
    }
    function leave() {
      if (leaving) return;
      leaving = true;
      clearTimeout(holdTimer);
      node.classList.add('is-leaving');
    }
    node.addEventListener('click', leave);
    /* any key dismisses it, and the key still reaches the editor */
    document.addEventListener('keydown', leave, true);
    /* the shell's own exit animation is the last thing to finish */
    node.addEventListener('animationend', function (e) { if (e.target === node && leaving) cleanup(); });
    var holdTimer = setTimeout(leave, 3300);
    setTimeout(cleanup, 4500);           // backstop: see moments-ui.js's note on display:none cancelling animations

    return node;
  }

  root.LCTSGame = { titleCard: titleCard };
})(globalThis);
