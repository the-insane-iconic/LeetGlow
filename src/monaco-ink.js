/* =============================================================================
   monaco-ink.js  (isolated world)

   WHAT THIS DOES
   LeetCode bundles Monaco through webpack and does not reliably expose
   window.monaco, so monaco.editor.defineTheme often never runs and the editor
   keeps its stock dark-theme syntax colours. Monaco always emits its palette as
   a plain stylesheet (`.mtk1 { color: #d4d4d4 }`) which the isolated world can
   read, so we read the colours it chose, work out what role each plays, and
   publish an override sheet. The mapping is bijective on the source colours, so
   two tokens Monaco drew differently stay different.

   WHY THIS LOOKS DIFFERENT FROM THE FIRST VERSION
   The first version observed documentElement with { subtree, characterData }
   and re-scanned every <style> with a regex on each animation frame. Monaco
   virtualises its lines, so scrolling the editor is a continuous stream of
   characterData mutations -- that scan was running dozens of times a second,
   over the whole stylesheet, on the main thread. It was a large part of the lag.

   The replacement never observes the document:
     - a decaying schedule catches the editor whenever it mounts
       (0.3s, 0.6s, 1.2s ... 40s, then stop) -- eight scans in total
     - after that, a 2s heartbeat compares ONE cached number: the length of
       Monaco's own colour stylesheet. A property read, no parsing. The
       expensive scan reruns only when that number moves, i.e. on a language or
       theme switch
     - our own theme switches arrive via a single attributeFilter observer on
       <html>, which fires only when we change it ourselves
============================================================================= */
(() => {
  const STYLE_ID = 'lcts-monaco-ink';

  /* Paper inks are solved against the editor's own stock, which sits one shade
     deeper than the other panels (--lc-editor-bg in themes/paper.css). Each one
     is the LIGHTEST colour at its hue that still clears 4.5:1 on that sheet as
     it actually renders (sampled from a screenshot, not from the flat swatch),
     which is what makes them read as separate inks rather than as one brown:
     on a mid-tone kraft, contrast is the whole chroma budget, so leaving any of
     it unspent costs visible colour. Ten roles, eight distinguishable hues.
     They are drawn at full opacity because alpha would spend that margin too.
     Keep in sync with PALETTES.paper in inject.js and the card in popup.js. */
  const INK = {
    paper: {
      a: 1,
      variable:'#241d14', comment:'#332e25', keyword:'#650500', control:'#5f0043',
      string:'#003804',   number:'#00343f',  func:'#00208a',    type:'#4a007b',
      param:'#1a2d5a',    operator:'#3a2d1d', regexp:'#003804', invalid:'#650500'
    },
    sakura: {
      a: 1,
      variable:'#ece9ff', comment:'#6b6395', keyword:'#ff7eb6', control:'#ff7eb6',
      string:'#ffd479',   number:'#b98cff',  func:'#6ee7f0',    type:'#7ee8a5',
      param:'#c9a6ff',    operator:'#ff9ec8', regexp:'#ffd479', invalid:'#ff6b8b'
    },
    grid: {
      a: 1,
      variable:'#d7e0ec', comment:'#56687f', keyword:'#58a6ff', control:'#58a6ff',
      string:'#a5d6ff',   number:'#ffa657',  func:'#35e0a1',    type:'#d2a8ff',
      param:'#9db0c6',    operator:'#79c0ff', regexp:'#a5d6ff', invalid:'#ff7b72'
    },
    /* Risograph: fluorescent pink is 2.4:1 on this stock, so type never uses
       it -- the printable pink carries the hue instead, exactly as a real riso
       does. Every value clears 4.5:1 on the brightest 10% of the baked stock. */
    bloom: {
      a: 1,
      variable:'#f4ecf7', comment:'#9b86a9', keyword:'#ff9ec9', control:'#ff9ec9',
      string:'#f0c27b',   number:'#d89bff',  func:'#7fe3c0',    type:'#a8b8ff',
      param:'#d2c2db',    operator:'#e3a88f', regexp:'#f0c27b', invalid:'#ff9ab0'
    },
    /* Web Crawler — crimson and electric blue split the two control-flow
       roles (keyword vs control) so the theme's own duality reads inside the
       code, not just around it. Every value clears 4.5:1 on --lc-bg2 (#17171c),
       comfortably, since the surface is near-black. */
    crawler: {
      a: 1,
      variable:'#eceaf2', comment:'#6e6e7a', keyword:'#4db2ff', control:'#ff4568',
      string:'#ffcf6b',   number:'#c792ea',  func:'#4ce0b3',    type:'#b39dff',
      param:'#b7b7c4',    operator:'#ff8aa8', regexp:'#ffcf6b', invalid:'#ff2d4d'
    },
    /* Gaming Theme dark fallback (Medium/Hard, and Easy before its difficulty
       is known) -- solved against --lc-bg2 #182a1e. The Easy tier's own
       light ink lives in src/game/game.js as __lctsGameInk, the same
       mechanism anime.js uses for its solved scenes; see the apply()
       fallback below and CLAUDE_ANKIT.md. */
    /* Pixel Art — Sweetie-16 hues, one per role, each clearing 4.5:1 on
       --lc-bg2 (#262b44) as it renders under the 2x2 dither. */
    pixel: {
      a: 1,
      variable:'#f4f4f4', comment:'#8b9bb4', keyword:'#ffcd75', control:'#ff8fa3',
      string:'#a7f070',   number:'#c9a0ff',  func:'#73eff7',    type:'#6cb6ff',
      param:'#c5d3e0',    operator:'#ffa36b', regexp:'#a7f070', invalid:'#ff6f86'
    },
    game: {
      a: 1,
      variable:'#eef2ea', comment:'#748a76', keyword:'#d4af6a', control:'#d4af6a',
      string:'#9fd88f',   number:'#7fc9c0',  func:'#8fb8e0',    type:'#c9a6ff',
      param:'#cbb08a',    operator:'#d7c9a0', regexp:'#9fd88f', invalid:'#e0715a'
    }
  };

  /* The palette LeetCode ships is the VS Code Dark+ family. Naming it gets the
     roles semantically right; anything else falls through to the hue
     classifier, which still keeps distinct colours distinct. */
  const KNOWN = {
    '569cd6':'keyword',  'c586c0':'control',  '4ec9b0':'type',     'dcdcaa':'func',
    '9cdcfe':'param',    'ce9178':'string',   'b5cea8':'number',   '6a9955':'comment',
    'd4d4d4':'variable', 'd16969':'regexp',   '4fc1ff':'param',    'c8c8c8':'variable',
    '808080':'comment',  'd7ba7d':'number',   'f44747':'invalid',  'b267e6':'type',
    '000080':'operator', '646695':'operator', 'ffd700':'operator', 'da70d6':'operator',
    '179fff':'func',     '3794ff':'func',     'cccccc':'variable', 'e6e6e6':'variable'
  };

  function hsl(hex) {
    const r = parseInt(hex.slice(0,2),16)/255,
          g = parseInt(hex.slice(2,4),16)/255,
          b = parseInt(hex.slice(4,6),16)/255;
    const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx===r) h = ((g-b)/d) % 6; else if (mx===g) h = (b-r)/d + 2; else h = (r-g)/d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const l = (mx+mn)/2;
    return [h, d ? d/(1-Math.abs(2*l-1)) : 0, l];
  }

  /* If inject.js managed to define a real Monaco theme, Monaco writes OUR
     colours into its stylesheet and we would read them back on the next scan.
     Mapping each ink to the role it came from makes that round trip a no-op. */
  const OURS = {};
  Object.keys(INK).forEach((t) => {
    Object.keys(INK[t]).forEach((role) => {
      const v = INK[t][role];
      if (typeof v === 'string' && v.charAt(0) === '#') {
        const h = v.slice(1).toLowerCase();
        if (!(h in OURS)) OURS[h] = role;
      }
    });
  });

  function classify(hex) {
    const k = KNOWN[hex] || OURS[hex];
    if (k) return k;
    const t = hsl(hex), h = t[0], s = t[1], l = t[2];
    if (s < 0.18) return l > 0.45 ? 'variable' : 'comment';
    if (h < 20 || h >= 345) return 'keyword';
    if (h < 45)  return 'string';
    if (h < 70)  return 'func';
    if (h < 160) return 'number';
    if (h < 200) return 'type';
    if (h < 255) return 'param';
    if (h < 290) return 'func';
    return 'control';
  }

  function rgba(hex, a) {
    if (a >= 1) return hex;
    const h = hex.slice(1);
    return 'rgba(' + parseInt(h.slice(0,2),16) + ',' + parseInt(h.slice(2,4),16)
         + ',' + parseInt(h.slice(4,6),16) + ',' + a + ')';
  }

  let sheets = [], sig = -1, lastTheme = '', styleCount = -1;
  const COLOR_RULE = /\.mtk\d+\s*\{\s*color\s*:\s*#[0-9a-fA-F]{6}/;

  /* WHY THIS MERGES RATHER THAN PICKS ONE SHEET
     Two stylesheets on the page both define .mtk colours and they disagree.
     Monaco registers its own default palette in style.monaco-colors (32
     colours) and LeetCode overwrites a subset from #__monaco_theme_color__ (19)
     later in the head, so the SAME .mtk class means different things in the
     two: .mtk4 is #569cd6 (a keyword) in LeetCode's sheet and something else
     entirely in Monaco's. Reading either one alone therefore hands most tokens
     the wrong ink -- keywords came out as parameters, types as strings -- which
     looked like "the colours are all the same" because the roles that carry the
     strong hues landed on tokens that barely appear.
     So we read every colour-bearing sheet in document order and let later ones
     win, which is exactly what the cascade does for the page itself. */
  /* A page carries dozens of <style> elements and one of them is 137 KB, so a
     rediscovery that regex-tested all of them would be the kind of work the
     rewrite removed. An element that was non-empty and had no colour rule can
     never become a palette, so remembering it makes every later pass test only
     the elements that are new. */
  const notPalette = new WeakSet();
  function findSheets() {
    const found = [];
    const all = document.querySelectorAll('style');
    for (let i = 0; i < all.length; i++) {
      const st = all[i];
      if (st.id === STYLE_ID || notPalette.has(st)) continue;   // never read ourselves back
      const text = st.textContent;
      if (COLOR_RULE.test(text)) found.push(st);
      else if (text.length) notPalette.add(st);
    }
    return found;
  }

  /* the heartbeat's whole cost: one length read per sheet, no parsing */
  function signature() {
    let n = 0;
    for (let i = 0; i < sheets.length; i++) {
      if (!sheets[i].isConnected) return -1;
      n += sheets[i].textContent.length * (i + 1);
    }
    return n;
  }

  function palette() {
    const map = {};
    const re = /\.mtk(\d+)\s*\{\s*color\s*:\s*#([0-9a-fA-F]{6})/g;
    for (let i = 0; i < sheets.length; i++) {
      let m; re.lastIndex = 0;
      while ((m = re.exec(sheets[i].textContent))) map[m[1]] = m[2].toLowerCase();
    }
    return map;
  }

  function apply(force) {
    const theme = document.documentElement.getAttribute('data-lc-theme') || '';
    /* the anime theme's inks are solved from its scene and published by
       src/anime/anime.js into this shared isolated world. The game theme's
       Easy tier overrides the static dark-fallback ink above the same way,
       via src/game/game.js's __lctsGameInk. */
    const ink = (theme === 'game' && globalThis.__lctsGameInk) || INK[theme]
      || (theme === 'anime' ? globalThis.__lctsAnimeInk : null);
    if (!ink) {
      /* theme off: take the override away so LeetCode's own colours return */
      const old = document.getElementById(STYLE_ID);
      if (old) old.remove();
      sig = -1; lastTheme = '';
      return false;
    }

    /* counting <style> elements is a cheap way to notice a sheet appearing
       after the first scan -- LeetCode inserts its palette some time after
       Monaco has already registered its own. */
    const n = document.querySelectorAll('style').length;
    if (!sheets.length || n !== styleCount || signature() === -1) {
      styleCount = n; sheets = findSheets();
    }
    if (!sheets.length) return false;

    /* the entire heartbeat is this comparison -- no parsing unless it moved */
    const now = signature();
    if (!force && now === sig && theme === lastTheme) return true;
    /* a sheet was replaced rather than edited: rediscover before parsing */
    if (now === -1) { sheets = findSheets(); if (!sheets.length) return false; }
    sig = signature(); lastTheme = theme;

    const map = palette();
    const rules = [];
    for (const cls in map) {
      const role = classify(map[cls]);
      /* unprefixed: LeetCode colourises testcase text with the same classes
         outside the editor, and those spans need the same inks */
      rules.push('.mtk' + cls + '{color:' + rgba(ink[role] || ink.variable, ink.a) + '!important}');
    }
    if (!rules.length) return false;
    if (theme === 'paper') rules.push('.monaco-editor .mtkb{font-weight:700!important}');

    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement('style');
      el.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(el);
    }
    el.textContent = rules.join('\n');
    return true;
  }

  function safe(force) { try { return apply(force); } catch (e) { return false; } }

  /* decaying catch-up: eight scans spread over 40s, then done */
  let delay = 300;
  (function tick() {
    safe(false);
    if (delay > 40000) return;
    setTimeout(tick, delay);
    delay *= 2;
  })();

  /* heartbeat: one string-length read every 2s, forever, costs nothing */
  setInterval(function () { safe(false); }, 2000);

  /* a new anime scene changes the inks without changing the theme id */
  globalThis.__lctsInkRefresh = function () { safe(true); };

  /* our own theme switches, and only ours */
  new MutationObserver(function () { safe(true); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme'] });
})();
