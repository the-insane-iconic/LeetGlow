/* =============================================================================
   moments-ui.js — builds the overlays; themes/anime.css choreographs them.

   Shared by the content script and the Anime Studio preview. Each overlay is
   created on its event and removes itself when its own animation ends, so
   between moments there is nothing on the page at all.

   The Japanese lines are the ones a series would use, and every glyph in them
   is in the subset of Dela Gothic One shipped in /fonts -- adding a new line
   means adding its characters to that subset. The subset holds printable
   ASCII plus: 第話日常編修行最終決戦完了！よしまだ…時間切れメモリ不足エラー
   集中モード・「」『』アニメ
============================================================================= */
(function (root) {
  'use strict';

  const VERDICTS = {
    ac:  { jp: '完了！',   en: 'ACCEPTED' },
    run: { jp: 'よし！',   en: 'TESTS PASSED' },
    wa:  { jp: 'まだだ…', en: 'WRONG ANSWER' },
    tle: { jp: '時間切れ', en: 'TIME LIMIT EXCEEDED' },
    mle: { jp: 'メモリ不足', en: 'MEMORY LIMIT EXCEEDED' },
    err: { jp: 'エラー',   en: 'ERROR' }
  };

  const ARCS = {
    easy:   { jp: '日常編',   en: 'SLICE-OF-LIFE ARC' },
    medium: { jp: '修行編',   en: 'TRAINING ARC' },
    hard:   { jp: '最終決戦', en: 'FINAL BATTLE' }
  };

  /* "Japanese text" off (lcAnime.japanese === false, a Studio switch): the big
     stamps and the title card speak English instead, with the same weight.
     The sub line under each stamp stays LeetCode's own verdict. */
  const STAMPS_EN = { ac: 'CLEARED!', run: 'NICE!', wa: 'NOT YET…', tle: 'TIME UP', mle: 'OUT OF MEMORY', err: 'ERROR' };
  let japanese = true;
  function setJapanese(on) { japanese = on !== false; }

  /* Web Crawler: same overlay engine and choreography (themes/crawler.css
     reuses the shared per-kind rules and @keyframes below), a crawler bot's
     own status readout instead of an episode. The `jp` key is reused as "the
     big stamp's primary text" -- it isn't Japanese here, just kept so this
     function doesn't need a second field name. */
  const VERDICTS_CRAWLER = {
    ac:  { jp: 'NODE COMPILED', en: 'ACCEPTED',              code: '200 OK' },
    run: { jp: 'TESTS CLEARED', en: 'PASSED',                code: '200 OK' },
    wa:  { jp: 'MISMATCH',      en: 'WRONG ANSWER',          code: '409 CONFLICT' },
    tle: { jp: 'TIMEOUT',       en: 'TIME LIMIT EXCEEDED',   code: '408 REQUEST TIMEOUT' },
    mle: { jp: 'OVERFLOW',      en: 'MEMORY LIMIT EXCEEDED', code: '507 INSUFFICIENT STORAGE' },
    err: { jp: 'TRACE FAILED',  en: 'ERROR',                 code: '500 INTERNAL ERROR' }
  };
  const ARCS_CRAWLER = {
    easy:   { jp: '>>', en: 'THREAT LEVEL: LOW' },
    medium: { jp: '>>', en: 'THREAT LEVEL: ELEVATED' },
    hard:   { jp: '>>', en: 'THREAT LEVEL: CRITICAL' }
  };

  /* ---- Web Crawler: spiders on silk ------------------------------------------
     Each drop is a silk strand pinned to the top of the screen with a spider at
     its end. themes/crawler.css lowers it, swings it like a pendulum and draws
     it back up before the moment ends, using transforms only. x is a % of the
     width and len a vh drop unless given as a CSS string; s is the spider's
     width in px and d the delay in ms. The lists are hand-placed so a spider
     never hangs across the stamp's own letters. */
  const DROPS_CRAWLER = {
    ac: [
      { x: 6,  len: 27, s: 84, d: 120 },
      { x: 18, len: 13, s: 50, d: 300, sw: 4 },
      { x: 50, len: 24, s: 92, d: 220, sw: 1.6 },
      { x: 82, len: 16, s: 56, d: 260, sw: 4 },
      { x: 94, len: 30, s: 84, d: 80 }
    ],
    run: [
      { x: 'calc(100% - 4vw - 46px)', len: 'calc(91vh - 205px)', s: 64, d: 40, sw: 2 },
      { x: 'calc(100% - 4vw - 150px)', len: '30vh', s: 38, d: 200, sw: 5 }
    ],
    wa: [
      { x: 12, len: 52, s: 74, d: 40,  cls: 'is-hard' },
      { x: 88, len: 44, s: 68, d: 110, cls: 'is-hard' },
      { x: 50, len: 20, d: 160, cls: 'is-snap' }
    ],
    tle: [
      { x: 26, len: 46, s: 78, d: 80, cls: 'is-slow', sw: 1.4, sp: 2400 },
      { x: 74, len: 34, s: 62, d: 200, cls: 'is-slow', sw: 1.4, sp: 2400 }
    ],
    mle: [
      { x: 5,  len: 12, s: 40, d: 40 }, { x: 15, len: 30, s: 52, d: 90 },
      { x: 27, len: 18, s: 44, d: 140 }, { x: 39, len: 40, s: 56, d: 60 },
      { x: 61, len: 36, s: 52, d: 120 }, { x: 73, len: 16, s: 42, d: 180 },
      { x: 85, len: 33, s: 56, d: 100 }, { x: 95, len: 22, s: 46, d: 160 }
    ],
    err: [
      { x: 14, len: 40, s: 68, d: 60,  cls: 'is-glitch' },
      { x: 50, len: 18, s: 52, d: 120, cls: 'is-glitch' },
      { x: 86, len: 32, s: 68, d: 90,  cls: 'is-glitch' }
    ],
    title: [
      { x: 12, len: 16, s: 52, d: 420 },
      { x: 71, len: 20, s: 62, d: 380, sw: 4 },
      { x: 84, len: 35, s: 90, d: 260 },
      { x: 94, len: 14, s: 46, d: 480, sw: 5 }
    ]
  };

  /* a hanging spider seen from the back: abdomen up at the silk, head down.
     The hourglass and the eyes carry the theme's second colour. */
  const SPIDER_SVG =
    '<svg viewBox="-62 -24 124 90" aria-hidden="true">' +
    '<g class="legs" fill="none" stroke-linecap="round">' +
    '<path d="M-8 -2Q-32 -14-52 -8"/><path d="M-8 5Q-38 2-60 12"/><path d="M-7 12Q-36 18-56 32"/><path d="M-5 19Q-30 30-48 48"/>' +
    '<path d="M8 -2Q32 -14 52 -8"/><path d="M8 5Q38 2 60 12"/><path d="M7 12Q36 18 56 32"/><path d="M5 19Q30 30 48 48"/>' +
    '</g><ellipse class="body" cx="0" cy="12" rx="13" ry="17"/><circle class="body" cx="0" cy="-7" r="8"/>' +
    '<path class="mark" d="M-4.5 6.5H4.5L0 13.5L4.5 20.5H-4.5L0 13.5Z"/>' +
    '<circle class="eye" cx="-3.4" cy="-9.5" r="1.7"/><circle class="eye" cx="3.4" cy="-9.5" r="1.7"/></svg>';

  const cssLen = (v, unit) => typeof v === 'number' ? v + unit : v;

  function drop(o) {
    const n = el('div', 'lcts-drop' + (o.cls ? ' ' + o.cls : ''));
    n.style.setProperty('--x', cssLen(o.x, '%'));
    n.style.setProperty('--len', cssLen(o.len, 'vh'));
    n.style.setProperty('--s', (o.s || 40) + 'px');
    n.style.setProperty('--d', (o.d || 0) + 'ms');
    if (o.sw) n.style.setProperty('--sw', o.sw + 'deg');
    if (o.sp) n.style.setProperty('--sp', o.sp + 'ms');
    const swing = el('div', 'lcts-swing');
    swing.append(el('span', 'lcts-silk'));
    if (o.cls !== 'is-snap') {
      const sp = el('span', 'lcts-spider');
      sp.innerHTML = SPIDER_SVG;      // a constant string, no page data
      swing.append(sp);
    }
    n.append(swing);
    return n;
  }
  const drops = (kind) => (DROPS_CRAWLER[kind] || []).map(drop);

  /* an orb web: 12 spokes and 6 sagging rings, every thread its own path so
     the stylesheet can draw them one after another (pathLength 1 makes the
     dash maths independent of the geometry) */
  function web(cls) {
    const N = 12, step = Math.PI * 2 / N, tilt = 0.09;
    const P = (r, a) => (100 + r * Math.cos(a + tilt)).toFixed(1) + ' ' + (100 + r * Math.sin(a + tilt)).toFixed(1);
    let d = [], i = 0;
    const path = (v, kind) => '<path class="' + kind + '" style="--i:' + (i++) + '" pathLength="1" d="' + v + '"/>';
    for (let k = 0; k < N; k++) d.push(path('M100 100L' + P(98, k * step), 'spoke'));
    [16, 32, 48, 64, 80, 96].forEach((r) => {
      let s = 'M' + P(r, 0);
      for (let k = 0; k < N; k++) s += 'Q' + P(r * 0.86, (k + 0.5) * step) + ' ' + P(r, (k + 1) * step);
      d.push(path(s, 'ring'));
    });
    const n = el('div', 'lcts-web ' + cls);
    n.innerHTML = '<svg viewBox="0 0 200 200" aria-hidden="true">' + d.join('') + '</svg>';
    return n;
  }

  /* the title card's boot log: dotted leaders so the values line up */
  function bootLog(info) {
    const n = Number(info.number) || 1;
    const depth = { easy: 1, medium: 2, hard: 3 }[(info.difficulty || '').toLowerCase()] || 1;
    const row = (k, v) => '> ' + k + ' ' + '.'.repeat(Math.max(2, 26 - k.length - String(v).length)) + ' ' + v;
    const log = el('div', 'lcts-log');
    ['resolving node #' + n + '|ok', 'links found|' + (6 + (n * 7) % 23), 'crawl depth|' + depth].forEach((r, i) => {
      const [k, v] = r.split('|');
      const line = el('div', 'lcts-logline', row(k, v));
      line.style.setProperty('--i', i);
      log.append(line);
    });
    return log;
  }

  const isCrawler = () => document.documentElement.getAttribute('data-lc-theme') === 'crawler';

  /* ---- Anime Wrong Answer: dizzy ------------------------------------------------
     The cartoon "seeing stars" beat, timed to audio/anime/wrong_answer.mp3: a
     spiral spins up behind the stamp, the stamp lands and sways like a woozy
     head, and stars circle over it. themes/anime.css choreographs it. */
  const SPIRAL = (() => {
    let d = 'M50 50';
    for (let t = 0.3; t <= Math.PI * 7; t += 0.12) {
      const r = t * 2.05;
      d += 'L' + (50 + r * Math.cos(t)).toFixed(1) + ' ' + (50 + r * Math.sin(t)).toFixed(1);
    }
    return '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="' + d + '"/></svg>';
  })();
  const STAR = '<svg viewBox="-10 -10 20 20" aria-hidden="true"><path d="M0 -9L2.6 -3.2 9 -2.8 4.1 1.4 5.6 7.8 0 4.4-5.6 7.8-4.1 1.4-9 -2.8-2.6 -3.2Z"/></svg>';

  function dizzy(big) {
    const orbit = el('span', 'lcts-orbit');
    const ring = el('span', 'lcts-ring');
    [0, 72, 144, 216, 288].forEach((a, i) => {
      const at = el('span', 'lcts-star-at');
      at.style.setProperty('--a', a + 'deg');
      const up = el('span', 'lcts-star' + (i % 2 ? ' is-alt' : ''));
      up.innerHTML = STAR;            // a constant string, no page data
      at.append(up);
      ring.append(at);
    });
    orbit.append(ring);
    big.append(orbit);
    const swirl = el('div', 'lcts-dz-swirl');
    swirl.innerHTML = SPIRAL;         // a constant string, no page data
    return swirl;
  }

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function mount(node, host) {
    host = host || document.body || document.documentElement;
    host.querySelectorAll(':scope > .lcts-moment, :scope > .lcts-card').forEach((n) => n.remove());
    node.setAttribute('aria-hidden', 'true');
    /* remove on the overlay's OWN animation, not a child's. A deadline backs it
       up: focus mode hides a moment with display:none, which cancels the
       animation, and Chrome then sends neither animationend nor
       animationcancel -- the node would stay in the page forever. Every
       moment is over within 2.3s, so 3s is always late enough. */
    node.addEventListener('animationend', (e) => { if (e.target === node) node.remove(); });
    setTimeout(() => node.remove(), 3000);
    host.appendChild(node);
    return node;
  }

  /* kind: ac | run | wa | tle | mle | err;  info.label overrides the English
     line (e.g. "RUNTIME ERROR"), info.beats adds the percentile to Accepted */
  function result(kind, info, host) {
    const crawler = isCrawler();
    const v = (crawler ? VERDICTS_CRAWLER : VERDICTS)[kind];
    if (!v) return null;
    info = info || {};
    const node = el('div', 'lcts-moment' + (kind === 'ac' || kind === 'run' ? '' : ' is-miss'));
    node.dataset.kind = kind;

    if (kind === 'ac') {
      /* the crawler swaps the radiating speed lines for a web that spins itself,
         drawn over the band */
      node.append(el('div', 'lcts-flash'));
      if (!crawler) node.append(el('div', 'lcts-lines'));
      node.append(el('div', 'lcts-band'));
      if (crawler) node.append(web('center'));
    } else if (kind !== 'run') {
      node.append(el('div', 'lcts-edge'));
    }

    const stack = el('div', 'lcts-stack');
    const stamp = crawler || japanese ? v.jp : STAMPS_EN[kind];
    const big = el('div', 'lcts-big lcts-jp', stamp);
    if (kind === 'err') {
      big.append(el('span', 'lcts-ghost a', stamp), el('span', 'lcts-ghost b', stamp));
    }
    let sub = info.label || v.en;
    if (kind === 'ac') {
      if (info.beats) sub += ' · BEATS ' + info.beats + '%';
      if (info.beats && Number(info.beats) >= 90) node.classList.add('is-legendary');
    }
    if (kind === 'wa' && !crawler && info.action === 'submit') {
      node.classList.add('is-dizzy');
      node.append(dizzy(big));
    }
    stack.append(big, el('div', 'lcts-sub', sub));
    if (crawler) stack.append(el('div', 'lcts-code', v.code));
    if (kind === 'tle') stack.append(el('div', 'lcts-timer'));
    if (kind === 'mle') stack.append(el('div', 'lcts-mle-meter'));
    node.append(stack);
    if (crawler) node.append(...drops(kind));
    return mount(node, host);
  }

  /* action: 'run' | 'submit' — tactical execution cue before final verdict arrives */
  function actionStart(action, host) {
    const crawler = isCrawler();
    const node = el('div', 'lcts-moment is-action');
    node.dataset.action = action;
    node.dataset.kind = action + '-start';

    const stack = el('div', 'lcts-stack');
    if (action === 'run') {
      const stamp = crawler || japanese ? (crawler ? 'SCANNING…' : '修行中…') : 'TESTING…';
      const big = el('div', 'lcts-big lcts-jp', stamp);
      const sub = el('div', 'lcts-sub', crawler ? 'RUNNING TEST SUITE' : 'EXECUTING TESTCASES');
      const pulse = el('div', 'lcts-action-pulse');
      stack.append(big, sub, pulse);
      node.append(el('div', 'lcts-action-slash'), stack);
    } else {
      node.append(el('div', 'lcts-action-aura'));
      if (!crawler) node.append(el('div', 'lcts-action-lines'));
      const stamp = crawler || japanese ? (crawler ? 'DISPATCHING…' : '決戦！') : 'SUBMITTING…';
      const big = el('div', 'lcts-big lcts-jp', stamp);
      const sub = el('div', 'lcts-sub', crawler ? 'EVALUATING ALL NODES' : 'JUDGING ALL TESTCASES');
      const beam = el('div', 'lcts-action-beam');
      stack.append(big, sub, beam);
      node.append(stack);
    }

    /* safety fallback: auto-fade after 7s if network hangs so overlay never lingers */
    setTimeout(() => {
      if (node.isConnected) {
        node.classList.add('is-leaving');
        setTimeout(() => node.remove(), 350);
      }
    }, 7000);

    return mount(node, host);
  }

  /* info: { number, title, difficulty } */
  function titleCard(info, host) {
    const crawler = isCrawler();
    const node = el('div', 'lcts-card');
    node.append(el('div', 'lcts-shade'), el('div', 'lcts-bar top'), el('div', 'lcts-bar bottom'));
    const stage = el('div', 'lcts-stage');
    const english = !crawler && !japanese;
    stage.append(
      crawler ? el('div', 'lcts-ep', 'CRAWLING…') : el('div', 'lcts-ep lcts-jp', english ? 'EP. ' + info.number : '第' + info.number + '話'),
      el('div', 'lcts-kicker', crawler ? 'NODE #' + info.number : english ? 'EPISODE' : 'EPISODE ' + info.number),
      el('div', 'lcts-rule'),
      el('div', 'lcts-title', info.title)
    );
    const arc = (crawler ? ARCS_CRAWLER : ARCS)[(info.difficulty || '').toLowerCase()];
    if (arc) {
      const line = el('div', 'lcts-arc');
      if (!english) line.append(el('span', 'lcts-jp', arc.jp));
      line.append(document.createTextNode(arc.en));
      stage.append(line);
    }
    if (crawler) stage.append(bootLog(info));
    if (crawler) node.append(web('corner'));
    node.append(stage);
    if (crawler) node.append(...drops('title'));
    node.append(el('div', 'lcts-skip', 'CLICK OR PRESS ANY KEY'));

    const leave = () => {
      if (node.classList.contains('is-leaving')) return;
      node.classList.add('is-leaving');
      document.removeEventListener('keydown', leave, true);
      /* a recorded title sound stops with the card it belongs to */
      if (root.LCTSSounds && root.LCTSSounds.stop) root.LCTSSounds.stop();
    };
    node.addEventListener('click', leave);
    /* any key dismisses it, and the key still reaches the editor */
    document.addEventListener('keydown', leave, true);
    node.addEventListener('animationend', (e) => {
      if (e.target === node) document.removeEventListener('keydown', leave, true);
    });
    setTimeout(() => document.removeEventListener('keydown', leave, true), 3000);
    return mount(node, host);
  }

  root.LCTSMoments = { result, actionStart, titleCard, setJapanese, VERDICTS, ARCS };
})(globalThis);
