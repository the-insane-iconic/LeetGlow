/* The Anime Studio preview frame. Studio calls LCTSPreview.apply() with a
   solved scene; the role block is the same css.js output the content script
   injects on LeetCode, and the code sample is coloured with the solved inks. */
(function () {
  'use strict';

  /* a small Python solution, tokenised by hand into the solver's roles */
  const CODE = [
    [['keyword', 'class'], ' ', ['type', 'Solution'], ['operator', ':']],
    ['    ', ['keyword', 'def'], ' ', ['func', 'twoSum'], ['operator', '('], ['param', 'self'], ['operator', ', '], ['param', 'nums'], ['operator', ': '], ['type', 'List'], ['operator', '['], ['type', 'int'], ['operator', ']):']],
    ['        ', ['variable', 'seen'], ['operator', ' = {}'], '  ', ['comment', '# value -> index']],
    ['        ', ['control', 'for'], ' ', ['variable', 'i'], ', ', ['variable', 'x'], ' ', ['control', 'in'], ' ', ['func', 'enumerate'], ['operator', '('], ['param', 'nums'], ['operator', '):']],
    ['            ', ['control', 'if'], ' ', ['param', 'target'], ['operator', ' - '], ['variable', 'x'], ' ', ['control', 'in'], ' ', ['variable', 'seen'], ['operator', ':']],
    ['                ', ['control', 'return'], ' [', ['variable', 'seen'], '[', ['param', 'target'], ['operator', ' - '], ['variable', 'x'], '], ', ['variable', 'i'], ']'],
    ['            ', ['variable', 'seen'], '[', ['variable', 'x'], ['operator', '] = '], ['variable', 'i']],
    ['        ', ['control', 'return'], ' [', ['number', '-1'], ', ', ['number', '-1'], ']'],
    [],
    [['comment', '# print("done", 0x2A)']],
    [['func', 'print'], ['operator', '('], ['string', '"ready"'], ', ', ['number', '42'], ['operator', ')']],
  ];

  function render() {
    const code = document.getElementById('code'), lines = document.getElementById('lines');
    CODE.forEach((parts, i) => {
      const n = document.createElement('div');
      n.className = 'line-numbers' + (i === 3 ? ' active-line-number' : '');
      n.textContent = String(i + 1);
      lines.appendChild(n);
      const row = document.createElement('div');
      row.className = 'view-line';
      parts.forEach((p) => {
        const s = document.createElement('span');
        if (typeof p === 'string') { s.textContent = p; s.className = 'tok-variable'; }
        else { s.textContent = p[1]; s.className = 'tok-' + p[0]; }
        row.appendChild(s);
      });
      if (!parts.length) row.textContent = ' ';
      code.appendChild(row);
    });
  }

  let inkStyle = null, roleStyle = null;
  function apply(theme, urls) {
    if (!roleStyle) { roleStyle = document.createElement('style'); document.head.appendChild(roleStyle); }
    if (!inkStyle) { inkStyle = document.createElement('style'); document.head.appendChild(inkStyle); }
    roleStyle.textContent = globalThis.LCTSAnimeCss.build(theme, urls);
    inkStyle.textContent = Object.keys(theme.ink).filter((k) => k !== 'a')
      .map((k) => `.monaco-editor .tok-${k}{color:${theme.ink[k]}}`).join('\n')
      + '\n.monaco-editor .tok-comment{font-style:italic}';
    const dark = theme.mode === 'dark';
    document.documentElement.classList.toggle('dark', dark);
    document.body.classList.toggle('dark', dark);
    document.documentElement.setAttribute('data-theme', theme.mode);
  }

  function focus(on) { document.documentElement.toggleAttribute('data-lc-focus', !!on); }

  render();
  window.LCTSPreview = { apply, focus };
})();
