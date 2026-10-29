/* LeetThemes — popup gallery. */
(function () {
  'use strict';

  const els = {
    grid: document.getElementById('grid'),
    chips: document.getElementById('chips'),
    search: document.getElementById('search'),
    empty: document.getElementById('empty'),
    emptyStudio: document.getElementById('emptyStudio'),
    master: document.getElementById('masterToggle'),
    banner: document.getElementById('siteBanner'),
    openLeetcode: document.getElementById('openLeetcode'),
    settingsBtn: document.getElementById('settingsBtn'),
    toast: document.getElementById('popToast')
  };

  let themes = [];
  let settings = null;
  let tab = null;
  let filter = localStorage.getItem('lct:popup-filter') || 'All';
  let toastTimer = null;

  const FX_CLASSES = {
    petals: 'fx-petals',
    dust: 'fx-dust',
    rain: 'fx-rain',
    stars: 'fx-stars',
    bubbles: 'fx-bubbles',
    leaves: 'fx-leaves',
    fireflies: 'fx-fireflies',
    snow: 'fx-snow'
  };

  function showToast(message) {
    clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.classList.remove('hidden');
    toastTimer = setTimeout(function () { els.toast.classList.add('hidden'); }, 2600);
  }

  function activeTheme() {
    return themes.find(function (theme) { return theme.id === settings.themeId; }) || themes[0];
  }

  function setAccent(theme) {
    if (!theme || !theme.palette) return;
    document.documentElement.style.setProperty('--active-accent', theme.palette.accent || '#c4a6ff');
  }

  function buildChips() {
    els.chips.innerHTML = '';
    const counts = {};
    themes.forEach(function (theme) {
      counts[theme.category] = (counts[theme.category] || 0) + 1;
    });
    const categories = LCT.CATEGORIES.filter(function (category) {
      return category === 'All' || category === 'Custom' || counts[category];
    });
    categories.forEach(function (category) {
      const button = document.createElement('button');
      button.className = 'chip' + (filter === category ? ' active' : '');
      button.dataset.category = category;
      button.textContent = category;
      const count = category === 'All' ? themes.length : (counts[category] || 0);
      if (count) {
        const badge = document.createElement('span');
        badge.className = 'count';
        badge.textContent = count;
        button.appendChild(badge);
      }
      button.addEventListener('click', function () {
        filter = category;
        localStorage.setItem('lct:popup-filter', filter);
        buildChips();
        renderGrid();
      });
      els.chips.appendChild(button);
    });
  }

  function makePreview(theme) {
    const preview = document.createElement('span');
    const particles = theme.effects && theme.effects.particles;
    preview.className = 'preview ' + (FX_CLASSES[particles] || '');
    const palette = theme.palette || {};
    preview.style.setProperty('--pv-bg', palette.bg || '#0b0b12');
    preview.style.setProperty('--pv-surface', palette.surface || '#16161f');
    preview.style.setProperty('--pv-text', palette.text || '#f4f4fa');
    preview.style.setProperty('--pv-accent', palette.accent || '#c4a6ff');
    preview.style.setProperty('--pv-accent2', palette.accent2 || '#22d3ee');
    preview.style.setProperty('--pv-on-accent', LCT.utils && LCT.utils.readableOn ? LCT.utils.readableOn(palette.accent || '#c4a6ff') : '#0b0b10');
    preview.style.setProperty('--pv-border', palette.border || 'rgba(255,255,255,.12)');

    preview.innerHTML = [
      '<span class="scene"></span>',
      '<span class="veil"></span>',
      '<span class="mini-nav"><span class="logo"></span><span class="bar"></span><span class="bar"></span><span class="avatar"></span></span>',
      '<span class="mini-body">',
      '<span class="mini-title">Two Sum</span>',
      '<span class="mini-tags"><b class="easy">Easy</b><b class="soft">array</b><b class="soft">hash</b></span>',
      '<span class="mini-code"><i></i><i></i><i></i></span>',
      '<span class="mini-run">Run</span>',
      '</span>',
      '<span class="grain"></span>'
    ].join('');

    if (particles && particles !== 'none') {
      for (let i = 0; i < 5; i += 1) {
        const dot = document.createElement('i');
        dot.className = 'p-dot';
        dot.style.setProperty('--x', (8 + Math.random() * 84).toFixed(1) + '%');
        dot.style.setProperty('--y', (12 + Math.random() * 76).toFixed(1) + '%');
        dot.style.setProperty('--s', (2 + Math.random() * 3).toFixed(1) + 'px');
        dot.style.setProperty('--d', (5 + Math.random() * 7).toFixed(1) + 's');
        dot.style.setProperty('--delay', (-Math.random() * 8).toFixed(1) + 's');
        preview.appendChild(dot);
      }
    }
    return preview;
  }

  function makeCard(theme) {
    const button = document.createElement('button');
    button.className = 'theme-card' + (theme.id === settings.themeId ? ' active' : '');
    button.type = 'button';
    button.dataset.id = theme.id;
    button.setAttribute('aria-pressed', theme.id === settings.themeId ? 'true' : 'false');
    button.title = theme.name + ' — ' + (theme.tagline || '');
    const palette = theme.palette || {};
    button.style.setProperty('--pv-accent', palette.accent || '#c4a6ff');
    button.style.setProperty('--pv-accent2', palette.accent2 || '#22d3ee');

    const preview = makePreview(theme);
    if (theme.id === settings.themeId) {
      const check = document.createElement('span');
      check.className = 'active-check';
      check.textContent = '✓';
      preview.appendChild(check);
    }

    const meta = document.createElement('span');
    meta.className = 'theme-meta';
    const name = document.createElement('span');
    name.className = 'theme-name';
    if (theme.custom) {
      const dot = document.createElement('i');
      dot.className = 'custom-dot';
      name.appendChild(dot);
    }
    name.appendChild(document.createTextNode(theme.name));
    const category = document.createElement('span');
    category.className = 'theme-cat';
    category.textContent = theme.category || 'Custom';
    meta.appendChild(name);
    meta.appendChild(category);

    button.appendChild(preview);
    button.appendChild(meta);
    button.addEventListener('click', function () { selectTheme(theme); });
    return button;
  }

  function matches(theme, query) {
    const haystack = [theme.name, theme.category, theme.tagline].join(' ').toLowerCase();
    return haystack.indexOf(query) !== -1;
  }

  function renderGrid() {
    const query = els.search.value.trim().toLowerCase();
    const list = themes.filter(function (theme) {
      if (filter !== 'All' && theme.category !== filter) return false;
      if (!query) return true;
      return matches(theme, query);
    });

    els.grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    list.forEach(function (theme) { fragment.appendChild(makeCard(theme)); });
    els.grid.appendChild(fragment);
    els.grid.classList.toggle('hidden', list.length === 0);
    els.empty.classList.toggle('hidden', list.length !== 0);
    if (filter === 'Custom' && !themes.some(function (theme) { return theme.custom; })) {
      els.empty.querySelector('strong').textContent = 'no custom themes yet';
      els.empty.querySelector('p').textContent = 'Build your own palette, background and effects in the studio.';
    } else {
      els.empty.querySelector('strong').textContent = 'no vibes found';
      els.empty.querySelector('p').textContent = 'Try a different search or make a custom theme.';
    }
  }

  async function selectTheme(theme) {
    const next = await LCT.setSettings({ themeId: theme.id, enabled: true });
    settings = next;
    els.master.checked = true;
    setAccent(theme);
    document.querySelectorAll('.theme-card').forEach(function (card) {
      const isActive = card.dataset.id === theme.id;
      card.classList.toggle('active', isActive);
      card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      const existing = card.querySelector('.active-check');
      const preview = card.querySelector('.preview');
      if (isActive && !existing && preview) {
        const check = document.createElement('span');
        check.className = 'active-check';
        check.textContent = '✓';
        preview.appendChild(check);
      } else if (!isActive && existing) {
        existing.remove();
      }
    });
    pingTab();
    showToast(theme.name + ' applied' + (isLeetCodeTab() ? '' : ' · open LeetCode to see it'));
  }

  function isLeetCodeTab() {
    return Boolean(tab && LCT.utils.isLeetCodeUrl(tab.url));
  }

  function pingTab() {
    if (!tab || !tab.id) return;
    try {
      chrome.tabs.sendMessage(tab.id, { type: 'lct:refresh' }, function () { void chrome.runtime.lastError; });
    } catch (error) { /* tab has no content script */ }
  }

  function syncControls() {
    els.master.checked = settings.enabled;
    setAccent(activeTheme());
    document.querySelectorAll('.quick-btn[data-action]').forEach(function (button) {
      const action = button.dataset.action;
      let active = false;
      if (action === 'focus') active = Boolean(settings.enabled && settings.focus.enabled);
      if (action === 'audio') active = Boolean(settings.enabled && settings.audio.enabled);
      if (action === 'timer') active = Boolean(settings.enabled && settings.pomodoro.enabled);
      button.classList.toggle('active', active);
    });
  }

  async function toggleFeature(action) {
    if (!settings) return;
    let patch = null;
    let message = '';
    if (action === 'focus') {
      patch = { enabled: true, focus: { enabled: !settings.focus.enabled } };
      message = settings.focus.enabled ? 'Focus mode off' : 'Focus mode on';
    }
    if (action === 'audio') {
      const on = !settings.audio.enabled;
      patch = { enabled: true, audio: { enabled: on } };
      message = on ? (isLeetCodeTab() ? 'Lofi queued — press play on the mini-player' : 'Lofi queued for LeetCode') : 'Lofi off';
    }
    if (action === 'timer') {
      const on = !settings.pomodoro.enabled;
      patch = { enabled: true, pomodoro: { enabled: on } };
      message = on ? 'Pomodoro ready on LeetCode' : 'Pomodoro hidden';
    }
    if (!patch) return;
    settings = await LCT.setSettings(patch);
    syncControls();
    pingTab();
    showToast(message);
  }

  function openOptions() {
    try {
      chrome.runtime.openOptionsPage();
    } catch (error) {
      try { chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') }); } catch (error2) { /* ignore */ }
    }
    window.close();
  }

  async function openLeetCode() {
    try {
      const existing = await chrome.tabs.query({ url: ['https://*.leetcode.com/*', 'https://*.leetcode.cn/*'] });
      if (existing && existing.length) {
        await chrome.tabs.update(existing[0].id, { active: true });
        if (existing[0].windowId != null) {
          try { await chrome.windows.update(existing[0].windowId, { focused: true }); } catch (error) { /* ignore */ }
        }
      } else {
        await chrome.tabs.create({ url: 'https://leetcode.com/problemset/' });
      }
      window.close();
    } catch (error) {
      showToast('Could not open LeetCode');
    }
  }

  function bindEvents() {
    els.master.addEventListener('change', async function () {
      settings = await LCT.setSettings({ enabled: els.master.checked });
      syncControls();
      pingTab();
      showToast(settings.enabled ? 'LeetThemes is on' : 'LeetThemes paused');
    });

    let searchTimer = null;
    els.search.addEventListener('input', function () {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(renderGrid, 90);
    });
    els.search.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') renderGrid();
    });

    els.settingsBtn.addEventListener('click', openOptions);
    els.emptyStudio.addEventListener('click', openOptions);
    els.openLeetcode.addEventListener('click', openLeetCode);

    document.querySelectorAll('.quick-btn').forEach(function (button) {
      button.addEventListener('click', function () {
        if (button.dataset.action === 'studio') openOptions();
        else toggleFeature(button.dataset.action);
      });
    });
  }

  function watchChanges() {
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'sync' && changes[LCT.KEYS.settings]) {
          LCT.getSettings().then(function (next) {
            if (!settings) return;
            const previousTheme = settings.themeId;
            settings = next;
            syncControls();
            if (previousTheme !== settings.themeId) {
              setAccent(activeTheme());
              renderGrid();
            }
          });
        }
        if (area === 'local' && changes[LCT.KEYS.customThemes]) {
          LCT.getAllThemes().then(function (list) {
            themes = list;
            buildChips();
            renderGrid();
            syncControls();
          });
        }
      });
    } catch (error) { /* ignore */ }
  }

  async function init() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      tab = tabs && tabs[0];
    } catch (error) {
      tab = null;
    }

    settings = await LCT.getSettings();
    themes = await LCT.getAllThemes();
    if (!themes.some(function (theme) { return theme.id === settings.themeId; })) {
      settings.themeId = themes[0].id;
    }
    if (!isLeetCodeTab()) els.banner.classList.remove('hidden');
    els.master.checked = settings.enabled;
    setAccent(activeTheme());
    buildChips();
    renderGrid();
    syncControls();
    bindEvents();
    watchChanges();
  }

  init().catch(function (error) {
    console.error(error);
    els.grid.innerHTML = '<div style="grid-column:1/-1;padding:24px;color:#9892ae;font-size:12px;">Could not load themes. Reload the extension.</div>';
  });
})();
