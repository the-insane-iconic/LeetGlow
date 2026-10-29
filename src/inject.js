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
    const id = document.documentElement.getAttribute('data-lc-theme');
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
  const siteFont = new WeakMap();
  function applyFont(id) {
    /* Monaco measures glyphs itself, so the face has to go through the API —
       setting it in CSS alone would desync the cursor. */
    const fam = (PALETTES[id] && PALETTES[id].font) || null;
    try {
      const eds = monaco.editor.getEditors ? monaco.editor.getEditors() : [];
      eds.forEach((ed) => {
        try {
          if (!siteFont.has(ed)) siteFont.set(ed, ed.getRawOptions().fontFamily);
          ed.updateOptions(fam ? { fontFamily: fam, fontLigatures: false }
                               : { fontFamily: siteFont.get(ed) || 'monospace' });
          if (ed.remeasureFonts) ed.remeasureFonts();
        } catch (e) {}
      });
      if (monaco.editor.remeasureFonts) monaco.editor.remeasureFonts();
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

  new MutationObserver(() => applyCurrent())
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-lc-theme'] });

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
})();
