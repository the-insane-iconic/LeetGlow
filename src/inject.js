/* =============================================================================
   inject.js  — runs in the PAGE (MAIN) world via manifest content_scripts,
   so it can reach window.monaco and is NOT subject to page CSP.
   Recolors the Monaco code editor to match the active theme and keeps it applied
   across editor re-creation and LeetCode's own setTheme() calls.
============================================================================= */
(() => {
  if (window.__lcThemeStudioInjected) return;
  window.__lcThemeStudioInjected = true;

  const NAME = (id) => 'lcts-' + id;

  /* palette = { base, fg, syn{}, colors{} }  (syntax value ending in 'i' = italic) */
  const PALETTES = {
    /* Grid — drafting table. Mint and signal blue on blue-black. */
    grid: {
      base: 'vs-dark', fg: 'd7e0ec',
      syn: { comment:'56687fi', keyword:'58a6ff', control:'58a6ff', string:'a5d6ff',
             number:'ffa657', func:'35e0a1', type:'d2a8ff', variable:'d7e0ec',
             param:'9db0c6', constant:'ffa657', operator:'79c0ff', regexp:'a5d6ff',
             tag:'35e0a1', attr:'d2a8ff', escape:'ffa657' },
      colors: {
        'editor.background':'#141c28','editor.foreground':'#d7e0ec',
        'editorLineNumber.foreground':'#3a4a5f','editorLineNumber.activeForeground':'#35e0a1',
        'editor.lineHighlightBackground':'#1e293755','editorCursor.foreground':'#35e0a1',
        'editor.selectionBackground':'#2c3a4c','editor.selectionHighlightBackground':'#2c3a4c66',
        'editor.inactiveSelectionBackground':'#2c3a4c44','editorWhitespace.foreground':'#25303f',
        'editorIndentGuide.background':'#25303f','editorIndentGuide.activeBackground':'#3a4a5f',
        'editorBracketMatch.background':'#2c3a4c88','editorBracketMatch.border':'#35e0a1',
        'editorGutter.background':'#141c28','editorError.foreground':'#ff7b72',
        'editorWarning.foreground':'#e3b341','scrollbarSlider.background':'#2c3a4c99',
        'scrollbarSlider.hoverBackground':'#3a4a5fcc','editorWidget.background':'#111823',
        'editorSuggestWidget.background':'#111823','editorHoverWidget.background':'#111823',
        'input.background':'#080c12','editor.findMatchBackground':'#35e0a155',
        'editor.findMatchHighlightBackground':'#35e0a12e'
      }
    },
    /* Pixel Art — kept in sync with INK.pixel in monaco-ink.js. */
    pixel: {
      base: 'vs-dark', fg: 'f4f4f4',
      syn: { comment:'8b9bb4i', keyword:'ffcd75', control:'ff8fa3', string:'a7f070',
             number:'c9a0ff', func:'73eff7', type:'6cb6ff', variable:'f4f4f4',
             param:'c5d3e0', constant:'c9a0ff', operator:'ffa36b', regexp:'a7f070',
             tag:'73eff7', attr:'6cb6ff', escape:'c9a0ff' },
      colors: {
        'editor.background':'#00000000','editor.foreground':'#f4f4f4',
        'editorGutter.background':'#00000000',
        'editorLineNumber.foreground':'#566c86','editorLineNumber.activeForeground':'#ffcd75',
        'editor.lineHighlightBackground':'#f4f4f40a','editor.lineHighlightBorder':'#00000000',
        'editorCursor.foreground':'#ffcd75',
        'editor.selectionBackground':'#ffcd7547','editor.selectionHighlightBackground':'#ffcd7522',
        'editor.inactiveSelectionBackground':'#ffcd751a','editorWhitespace.foreground':'#333c57',
        'editorIndentGuide.background':'#333c57','editorIndentGuide.activeBackground':'#566c86',
        'editorBracketMatch.background':'#73eff722','editorBracketMatch.border':'#73eff7',
        'editorError.foreground':'#ff6f86','editorWarning.foreground':'#ffcd75',
        'scrollbarSlider.background':'#566c8699','scrollbarSlider.hoverBackground':'#566c86cc',
        'editorWidget.background':'#1f2338','editorWidget.border':'#566c86',
        'editorSuggestWidget.background':'#1f2338','editorSuggestWidget.border':'#566c86',
        'editorSuggestWidget.selectedBackground':'#333c57',
        'editorHoverWidget.background':'#1f2338','editorHoverWidget.border':'#566c86',
        'input.background':'#171a2b','input.border':'#566c86',
        'editor.findMatchBackground':'#ffcd7560','editor.findMatchHighlightBackground':'#ffcd752e'
      }
    },
    /* Web Crawler — kept in sync with INK.crawler in monaco-ink.js. */
    crawler: {
      base: 'vs-dark', fg: 'eceaf2',
      syn: { comment:'6e6e7ai', keyword:'4db2ff', control:'ff4568', string:'ffcf6b',
             number:'c792ea', func:'4ce0b3', type:'b39dff', variable:'eceaf2',
             param:'b7b7c4', constant:'c792ea', operator:'ff8aa8', regexp:'ffcf6b',
             tag:'4ce0b3', attr:'b39dff', escape:'c792ea' },
      colors: {
        'editor.background':'#17171c','editor.foreground':'#eceaf2',
        'editorLineNumber.foreground':'#38384a','editorLineNumber.activeForeground':'#e0223f',
        'editor.lineHighlightBackground':'#20202755','editorCursor.foreground':'#e0223f',
        'editor.selectionBackground':'#2e2e38','editor.selectionHighlightBackground':'#2e2e3866',
        'editor.inactiveSelectionBackground':'#2e2e3844','editorWhitespace.foreground':'#26262e',
        'editorIndentGuide.background':'#26262e','editorIndentGuide.activeBackground':'#38384a',
        'editorBracketMatch.background':'#2e2e3888','editorBracketMatch.border':'#e0223f',
        'editorGutter.background':'#17171c','editorError.foreground':'#ff4d6a',
        'editorWarning.foreground':'#ffcc4d','scrollbarSlider.background':'#2e2e3899',
        'scrollbarSlider.hoverBackground':'#38384acc','editorWidget.background':'#101013',
        'editorSuggestWidget.background':'#101013','editorHoverWidget.background':'#101013',
        'input.background':'#07070a','editor.findMatchBackground':'#e0223f55',
        'editor.findMatchHighlightBackground':'#e0223f2e'
      }
    },
    'sakura-dream': {
      base: 'vs', fg: '2d1527',
      syn: { comment:'7f6174i', keyword:'c026d3b', control:'9333eab', string:'b91c1c',
             number:'d97706', func:'0284c7b', type:'7c3aed', variable:'2d1527',
             param:'4a1d48', constant:'d97706', operator:'db2777', regexp:'c026d3',
             tag:'0284c7', attr:'7c3aed', escape:'d97706' },
      colors: {
        'editor.background':'#fff7fa','editor.foreground':'#2d1527',
        'editorLineNumber.foreground':'#b088a2','editorLineNumber.activeForeground':'#c026d3',
        'editor.lineHighlightBackground':'#fbe4ee44','editorCursor.foreground':'#c026d3',
        'editor.selectionBackground':'#f472b638','editor.selectionHighlightBackground':'#f472b622',
        'editorBracketMatch.background':'#f472b622','editorBracketMatch.border':'#c026d3'
      }
    },
    'forest-mist': {
      base: 'vs-dark', fg: 'e8f3e6',
      syn: { comment:'96ab9ci', keyword:'7fd18bb', control:'d8c27ab', string:'a7f3d0',
             number:'fde047', func:'86efacb', type:'6ee7b7', variable:'e8f3e6',
             param:'c2dfcb', constant:'fde047', operator:'7fd18b', regexp:'a7f3d0',
             tag:'86efac', attr:'6ee7b7', escape:'fde047' },
      colors: {
        'editor.background':'#11201a','editor.foreground':'#e8f3e6',
        'editorLineNumber.foreground':'#405c4f','editorLineNumber.activeForeground':'#7fd18b',
        'editor.lineHighlightBackground':'#172a2255','editorCursor.foreground':'#7fd18b',
        'editor.selectionBackground':'#7fd18b33','editor.selectionHighlightBackground':'#7fd18b1f',
        'editorBracketMatch.background':'#7fd18b26','editorBracketMatch.border':'#7fd18b'
      }
    },
    'midnight-ink': {
      base: 'vs-dark', fg: 'e9edf2',
      syn: { comment:'8f98a5i', keyword:'7aa2ffb', control:'a78bfab', string:'86efac',
             number:'fdba74', func:'93c5fdb', type:'c084fc', variable:'e9edf2',
             param:'cbd5e1', constant:'fdba74', operator:'7aa2ff', regexp:'86efac',
             tag:'93c5fd', attr:'c084fc', escape:'fdba74' },
      colors: {
        'editor.background':'#12151a','editor.foreground':'#e9edf2',
        'editorLineNumber.foreground':'#475569','editorLineNumber.activeForeground':'#7aa2ff',
        'editor.lineHighlightBackground':'#181c2355','editorCursor.foreground':'#7aa2ff',
        'editor.selectionBackground':'#7aa2ff33','editor.selectionHighlightBackground':'#7aa2ff1f',
        'editorBracketMatch.background':'#7aa2ff26','editorBracketMatch.border':'#7aa2ff'
      }
    },
    'lofi-cafe': {
      base: 'vs-dark', fg: 'f4e7d3',
      syn: { comment:'b9a48ci', keyword:'e0a86ab', control:'d97706b', string:'9cbfa3',
             number:'f59e0b', func:'fcd34db', type:'e8b4b8', variable:'f4e7d3',
             param:'d5c4b1', constant:'f59e0b', operator:'e0a86a', regexp:'9cbfa3',
             tag:'fcd34d', attr:'e8b4b8', escape:'f59e0b' },
      colors: {
        'editor.background':'#241c16','editor.foreground':'#f4e7d3',
        'editorLineNumber.foreground':'#7c6a59','editorLineNumber.activeForeground':'#e0a86a',
        'editor.lineHighlightBackground':'#2d231b55','editorCursor.foreground':'#e0a86a',
        'editor.selectionBackground':'#e0a86a33','editor.selectionHighlightBackground':'#e0a86a1f',
        'editorBracketMatch.background':'#e0a86a26','editorBracketMatch.border':'#e0a86a'
      }
    },
    'rainy-window': {
      base: 'vs-dark', fg: 'e6eef7',
      syn: { comment:'93a7bdi', keyword:'7fb7d8b', control:'c7a6e0b', string:'86efac',
             number:'fde047', func:'93c5fdb', type:'d8b4fe', variable:'e6eef7',
             param:'bfdbfe', constant:'fde047', operator:'7fb7d8', regexp:'86efac',
             tag:'93c5fd', attr:'d8b4fe', escape:'fde047' },
      colors: {
        'editor.background':'#162130','editor.foreground':'#e6eef7',
        'editorLineNumber.foreground':'#536b85','editorLineNumber.activeForeground':'#7fb7d8',
        'editor.lineHighlightBackground':'#1c2a3c55','editorCursor.foreground':'#7fb7d8',
        'editor.selectionBackground':'#7fb7d833','editor.selectionHighlightBackground':'#7fb7d81f',
        'editorBracketMatch.background':'#7fb7d826','editorBracketMatch.border':'#7fb7d8'
      }
    },
    'meadow-breeze': {
      base: 'vs', fg: '14291f',
      syn: { comment:'587162i', keyword:'047857b', control:'0284c7b', string:'c2410c',
             number:'d97706', func:'2563ebb', type:'0d9488', variable:'14291f',
             param:'234233', constant:'d97706', operator:'059669', regexp:'ea580c',
             tag:'2563eb', attr:'0d9488', escape:'d97706' },
      colors: {
        'editor.background':'#f7fcf4','editor.foreground':'#14291f',
        'editorLineNumber.foreground':'#789e87','editorLineNumber.activeForeground':'#047857',
        'editor.lineHighlightBackground':'#e1f0dc44','editorCursor.foreground':'#047857',
        'editor.selectionBackground':'#34d39938','editor.selectionHighlightBackground':'#34d39922',
        'editorBracketMatch.background':'#34d39922','editorBracketMatch.border':'#047857'
      }
    },
    'ocean-deep': {
      base: 'vs-dark', fg: 'e3f5fb',
      syn: { comment:'8fb1c2i', keyword:'46c8d8b', control:'8a9dffb', string:'6ee7b7',
             number:'fcd34d', func:'38bdf8b', type:'a78bfa', variable:'e3f5fb',
             param:'93c5fd', constant:'fcd34d', operator:'67e8f9', regexp:'6ee7b7',
             tag:'38bdf8', attr:'a78bfa', escape:'fcd34d' },
      colors: {
        'editor.background':'#0c2230','editor.foreground':'#e3f5fb',
        'editorLineNumber.foreground':'#486577','editorLineNumber.activeForeground':'#46c8d8',
        'editor.lineHighlightBackground':'#102c3e55','editorCursor.foreground':'#46c8d8',
        'editor.selectionBackground':'#46c8d833','editor.selectionHighlightBackground':'#46c8d81f',
        'editorBracketMatch.background':'#46c8d826','editorBracketMatch.border':'#46c8d8'
      }
    },
    'paper': {
      base: 'vs', fg: '1c1917',
      syn: { comment:'6d685di', keyword:'c2410cb', control:'b91c1cb', string:'15803d',
             number:'d97706', func:'0369a1b', type:'7c3aed', variable:'1c1917',
             param:'38302b', constant:'d97706', operator:'ea580c', regexp:'b91c1c',
             tag:'0369a1', attr:'7c3aed', escape:'d97706' },
      colors: {
        'editor.background':'#fbf8f1','editor.foreground':'#1c1917',
        'editorLineNumber.foreground':'#968a7c','editorLineNumber.activeForeground':'#c2410c',
        'editor.lineHighlightBackground':'#eee4d044','editorCursor.foreground':'#c2410c',
        'editor.selectionBackground':'#fb923c38','editor.selectionHighlightBackground':'#fb923c22',
        'editorBracketMatch.background':'#fb923c22','editorBracketMatch.border':'#c2410c'
      }
    },
    'nord': {
      base: 'vs-dark', fg: 'eceff4',
      syn: { comment:'7b88a1i', keyword:'81a1c1b', control:'88c0d0b', string:'a3be8c',
             number:'b48ead', func:'8fbcbbb', type:'88c0d0', variable:'eceff4',
             param:'d8dee9', constant:'b48ead', operator:'81a1c1', regexp:'ebcb8b',
             tag:'8fbcbb', attr:'88c0d0', escape:'ebcb8b' },
      colors: {
        'editor.background':'#2e3440','editor.foreground':'#eceff4',
        'editorLineNumber.foreground':'#4c566a','editorLineNumber.activeForeground':'#88c0d0',
        'editor.lineHighlightBackground':'#3b425255','editorCursor.foreground':'#88c0d0',
        'editor.selectionBackground':'#88c0d033','editor.selectionHighlightBackground':'#88c0d01f',
        'editorBracketMatch.background':'#88c0d026','editorBracketMatch.border':'#88c0d0'
      }
    }
  };

  function ruleset(p) {
    const s = p.syn;
    /* a palette value is 6 hex digits plus optional style flags:
       'i' = italic, 'b' = bold. e.g. '9c2f1eb' = oxblood, bold. */
    const R = (tokens, val) => {
      const m = /^([0-9a-fA-F]{6})([ib]*)$/.exec(val) || [null, val, ''];
      const fg = m[1], flags = m[2] || '';
      const style = [flags.indexOf('i') > -1 ? 'italic' : '',
                     flags.indexOf('b') > -1 ? 'bold' : ''].filter(Boolean).join(' ');
      return tokens.map((t) => {
        const r = { token: t, foreground: fg };
        if (style) r.fontStyle = style;
        return r;
      });
    };
    return [
      { token: '', foreground: p.fg },
      ...R(['comment','comment.line','comment.block'], s.comment),
      ...R(['keyword','keyword.json','keyword.flow','storage','storage.type','modifier'], s.keyword),
      ...R(['keyword.control','control'], s.control),
      ...R(['string','string.value','string.key.json','string.quote','string.sql'], s.string),
      ...R(['string.escape','constant.character.escape'], s.escape),
      ...R(['number','number.hex','number.float','constant.numeric'], s.number),
      ...R(['regexp','string.regexp'], s.regexp),
      ...R(['type','type.identifier','struct','class','interface','enum','namespace','entity.name.type'], s.type),
      ...R(['function','entity.name.function','support.function','meta.function-call','function.call'], s.func),
      ...R(['variable','identifier','variable.other'], s.variable),
      ...R(['variable.parameter','parameter','variable.language'], s.param),
      ...R(['constant','constant.language','constant.other','boolean'], s.constant),
      ...R(['operator','keyword.operator','delimiter','delimiter.bracket','delimiter.parenthesis'], s.operator),
      ...R(['tag','metatag','entity.name.tag'], s.tag),
      ...R(['attribute.name','entity.other.attribute-name'], s.attr),
      ...R(['attribute.value'], s.string),
      ...R(['annotation','meta.annotation','decorator'], s.func)
    ];
  }

  let monaco = null;
  const definedFor = new Set();
  /* null when the theme is off: content.js removes the attribute */
  const currentId = () => {
    const id = document.documentElement.getAttribute('data-lct-theme')
      || document.documentElement.getAttribute('data-lc-theme');
    return PALETTES[id] ? id : null;
  };

  function defineAll() {
    if (!monaco || !monaco.editor) return;
    Object.keys(PALETTES).forEach((id) => {
      if (definedFor.has(id)) return;
      try {
        monaco.editor.defineTheme(NAME(id), {
          base: PALETTES[id].base, inherit: true,
          rules: ruleset(PALETTES[id]), colors: PALETTES[id].colors
        });
        definedFor.add(id);
      } catch (e) {}
    });
  }

  /* siteTheme: the last theme LeetCode itself asked for, so 'off' can hand the
     editor back. siteFont: each editor's own face, recorded before we change it. */
  let applying = false, realSetTheme = null, siteTheme = null, oursApplied = false;
  let lastAppliedFont = undefined;
  const siteFont = new WeakMap();
  let remeasureTimer = null;
  function applyFont(id) {
    const fam = (PALETTES[id] && PALETTES[id].font) || null;
    if (lastAppliedFont === fam) return;
    lastAppliedFont = fam;
    /* Monaco measures glyphs itself, so the face has to go through the API —
       setting it in CSS alone would desync the cursor. */
    try {
      const eds = monaco.editor.getEditors ? monaco.editor.getEditors() : [];
      eds.forEach((ed) => {
        try {
          if (!siteFont.has(ed)) siteFont.set(ed, ed.getRawOptions().fontFamily);
          ed.updateOptions(fam ? { fontFamily: fam, fontLigatures: false }
                               : { fontFamily: siteFont.get(ed) || 'monospace' });
        } catch (e) {}
      });
      clearTimeout(remeasureTimer);
      remeasureTimer = setTimeout(() => {
        try {
          eds.forEach((ed) => { if (ed.remeasureFonts) ed.remeasureFonts(); });
          if (monaco.editor.remeasureFonts) monaco.editor.remeasureFonts();
        } catch (e) {}
      }, 60);
    } catch (e) {}
  }
  function applyCurrent() {
    if (!monaco || !monaco.editor) return;
    defineAll();
    const id = currentId();
    if (!id) {
      if (!oursApplied) return;
      oursApplied = false;
      try { applying = true; if (siteTheme) realSetTheme(siteTheme); } catch (e) {} finally { applying = false; }
      applyFont(null);
      return;
    }
    try { applying = true; realSetTheme(NAME(id)); } catch (e) {} finally { applying = false; }
    oursApplied = true;
    applyFont(id);
  }
  function hookSetTheme() {
    if (!monaco || !monaco.editor || realSetTheme) return;
    realSetTheme = monaco.editor.setTheme.bind(monaco.editor);
    monaco.editor.setTheme = function (name) {
      if (applying) return realSetTheme(name);
      siteTheme = name;                                   // remember what LeetCode wanted
      const id = currentId();
      return realSetTheme(id ? NAME(id) : name);          // redirect only while a theme is on
    };
  }

  let tries = 0;
  const waiter = setInterval(() => {
    if (window.monaco && window.monaco.editor) {
      monaco = window.monaco; clearInterval(waiter); hookSetTheme(); applyCurrent();
    } else if (++tries > 600) { clearInterval(waiter); }   // ~90s ceiling
  }, 150);

  let applyScheduled = false;
  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    queueMicrotask(() => {
      applyScheduled = false;
      applyCurrent();
    });
  }

  new MutationObserver(() => scheduleApply())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme', 'data-lct-theme'] });

  /* This used to be a MutationObserver on document.body with subtree:true that
     ran n.querySelector('.monaco-editor') for EVERY added node. Monaco
     virtualises its lines, so scrolling the editor recycles rows continuously —
     that was a subtree query per recycled row, on the main thread, mid-scroll.
     applyCurrent() is idempotent and cheap, so a decaying schedule catches the
     editor mounting just as well and costs nine calls instead of thousands. */
  let reapply = 400;
  (function catchUp() {
    applyCurrent();
    if (reapply > 60000) return;
    setTimeout(catchUp, reapply);
    reapply *= 2;
  })();

  /* ===========================================================================
     Room Invite via Link Detection (?glowroom=GLOW-XXXX)
     Dispatches invite event & message to content script to auto-open side panel
  =========================================================================== */
  try {
    const search = window.location.search;
    if (search && search.includes('glowroom')) {
      const params = new URLSearchParams(search);
      const roomParam = params.get('glowroom');
      if (roomParam) {
        const cleanCode = roomParam.trim().toUpperCase();
        const fullCode = cleanCode.startsWith('GLOW-') ? cleanCode : ('GLOW-' + cleanCode);
        window.postMessage({
          source: 'leetglow-inject',
          type: 'LEETGLOW_INVITE_DETECTED',
          roomCode: fullCode
        }, '*');
        window.dispatchEvent(new CustomEvent('leetglow:invite-detected', {
          detail: { roomCode: fullCode }
        }));
      }
    }
  } catch (e) {}
})();
