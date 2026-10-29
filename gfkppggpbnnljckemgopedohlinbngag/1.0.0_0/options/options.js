/* LeetThemes — options + theme studio. */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };
  const FONT_OPTIONS = ['Inter', 'Space Grotesk', 'Cinzel', 'Caveat', 'Orbitron', 'JetBrains Mono'];

  const PANEL_META = {
    appearance: { eyebrow: 'make it yours', title: 'Appearance', sub: 'Pick a scene. Change the whole mood of your grind.' },
    focus: { eyebrow: 'less noise', title: 'Focus mode', sub: 'A cleaner problem page, on your terms.' },
    sound: { eyebrow: 'press play', title: 'Lofi sound', sub: 'Original, generative ambience that runs offline.' },
    timer: { eyebrow: 'deep work', title: 'Pomodoro', sub: 'A timer that respects the flow.' },
    studio: { eyebrow: 'one of one', title: 'Theme Studio', sub: 'Colors, fonts, particles and backgrounds — remix everything.' },
    about: { eyebrow: 'the small print', title: 'About', sub: 'How LeetThemes works, and what it never does.' }
  };

  const COLOR_KEYS = ['bg', 'surface', 'surface2', 'elevated', 'text', 'muted', 'accent', 'accent2', 'code'];

  let settings = null;
  let allThemes = [];
  let customThemes = [];
  let draft = null;
  let draftSaved = false;
  let draftDirty = false;
  let previewReady = false;
  let toastTimer = null;
  let saveDepth = 0;

  function toast(message) {
    clearTimeout(toastTimer);
    $('toast').textContent = message;
    $('toast').classList.remove('hidden');
    toastTimer = setTimeout(function () { $('toast').classList.add('hidden'); }, 2800);
  }

  function isHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
  }

  function normalizeHex(value) {
    let hex = String(value || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(hex)) {
      hex = '#' + hex.slice(1).split('').map(function (c) { return c + c; }).join('');
    }
    return isHexColor(hex) ? hex.toLowerCase() : '#000000';
  }

  async function patchSettings(patch) {
    saveDepth += 1;
    settings = await LCT.setSettings(patch);
    saveDepth -= 1;
    return settings;
  }

  function activeTheme() {
    return allThemes.find(function (theme) { return theme.id === settings.themeId; }) || allThemes[0];
  }

  function setAccent(theme) {
    if (!theme) return;
    const accent = theme.palette.accent || '#c4a6ff';
    const accent2 = theme.palette.accent2 || '#6ee7f9';
    document.documentElement.style.setProperty('--accent', accent);
    document.documentElement.style.setProperty('--accent-2', accent2);
    document.documentElement.style.setProperty('--on-accent', LCT.utils && LCT.utils.readableOn ? LCT.utils.readableOn(accent) : '#0b0b10');
  }

  function renderSidebar() {
    const theme = activeTheme();
    if (!theme) return;
    const preview = $('sideThemePreview');
    preview.style.setProperty('--sp-bg', theme.palette.bg);
    preview.style.setProperty('--sp-surface', theme.palette.surface2 || theme.palette.surface);
    preview.style.setProperty('--sp-text', theme.palette.text);
    preview.style.setProperty('--sp-accent', theme.palette.accent);
    preview.style.setProperty('--sp-accent2', theme.palette.accent2);
    $('sideThemeName').textContent = theme.name;
    $('sideThemeCat').textContent = (theme.category || 'Custom') + ' · ' + theme.mode;
    const dots = $('paletteDots');
    dots.innerHTML = '';
    [theme.palette.bg, theme.palette.surface, theme.palette.text, theme.palette.accent, theme.palette.accent2, theme.palette.code].forEach(function (color) {
      if (!color) return;
      const dot = document.createElement('i');
      dot.style.background = color;
      dots.appendChild(dot);
    });
    setAccent(theme);
  }

  /* ---------- Navigation ---------- */
  function showPanel(name, updateHash) {
    if (!PANEL_META[name]) name = 'appearance';
    document.querySelectorAll('.nav-item').forEach(function (button) {
      button.classList.toggle('active', button.dataset.panel === name);
    });
    document.querySelectorAll('.panel').forEach(function (panel) {
      panel.classList.toggle('active', panel.dataset.panelView === name);
    });
    const meta = PANEL_META[name];
    $('pageEyebrow').textContent = meta.eyebrow;
    $('pageTitle').textContent = meta.title;
    $('pageSub').textContent = meta.sub;
    if (updateHash) {
      try { history.replaceState(null, '', '#' + name); } catch (error) { /* ignore */ }
    }
    if (name === 'studio') schedulePreview();
  }

  function initNav() {
    document.querySelectorAll('.nav-item').forEach(function (button) {
      button.addEventListener('click', function () { showPanel(button.dataset.panel, true); });
    });
    const initial = location.hash ? location.hash.slice(1) : 'appearance';
    const welcome = new URLSearchParams(location.search).get('welcome') === '1';
    if (welcome) {
      $('welcomeBanner').classList.remove('hidden');
      showPanel('appearance', false);
    } else {
      showPanel(PANEL_META[initial] ? initial : 'appearance', false);
    }
    $('welcomeClose').addEventListener('click', function () {
      $('welcomeBanner').classList.add('hidden');
    });
    // Links like options.html#studio should switch panels on an already-open page too.
    window.addEventListener('hashchange', function () {
      showPanel(location.hash.slice(1), false);
    });
  }

  /* ---------- Gallery ---------- */
  function createGalleryCard(theme) {
    const active = theme.id === settings.themeId;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'gallery-card' + (active ? ' active' : '');
    card.dataset.id = theme.id;
    card.title = theme.name + ' — ' + (theme.tagline || '');
    card.style.setProperty('--gc-bg', theme.palette.bg);
    card.style.setProperty('--gc-surface', theme.palette.surface);
    card.style.setProperty('--gc-text', theme.palette.text);
    card.style.setProperty('--gc-accent', theme.palette.accent);
    card.style.setProperty('--gc-accent2', theme.palette.accent2);
    card.style.setProperty('--gc-on-accent', LCT.utils && LCT.utils.readableOn ? LCT.utils.readableOn(theme.palette.accent) : '#0b0b10');
    card.style.setProperty('--gc-border', theme.palette.border || 'rgba(255,255,255,.1)');

    const preview = document.createElement('span');
    preview.className = 'gallery-preview';
    preview.innerHTML = [
      '<span class="bar"><i></i><i></i><i></i></span>',
      '<span class="t">Two Sum</span>',
      '<span class="tag">Easy</span>',
      '<span class="lines"><i></i><i></i><i></i></span>'
    ].join('');
    if (active) {
      const check = document.createElement('span');
      check.className = 'gallery-check';
      check.textContent = '✓';
      preview.appendChild(check);
    }

    const meta = document.createElement('span');
    meta.className = 'gallery-meta';
    const name = document.createElement('span');
    name.className = 'gallery-name';
    name.textContent = theme.name;
    const category = document.createElement('span');
    category.className = 'gallery-cat';
    category.textContent = theme.category || 'Custom';
    meta.appendChild(name);
    meta.appendChild(category);

    card.appendChild(preview);
    card.appendChild(meta);
    card.addEventListener('click', function () { applyTheme(theme.id); });
    return card;
  }

  function renderGallery() {
    const query = $('gallerySearch').value.trim().toLowerCase();
    const list = allThemes.filter(function (theme) {
      if (!query) return true;
      return [theme.name, theme.category, theme.tagline].join(' ').toLowerCase().indexOf(query) !== -1;
    });
    const grid = $('galleryGrid');
    grid.innerHTML = '';
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'gallery-empty';
      empty.textContent = 'No themes match that search. Try “anime”, “lofi” or “minimal”.';
      grid.appendChild(empty);
      return;
    }
    list.forEach(function (theme) { grid.appendChild(createGalleryCard(theme)); });
  }

  async function applyTheme(id) {
    settings = await LCT.setSettings({ themeId: id, enabled: true });
    renderSidebar();
    renderGallery();
    const theme = allThemes.find(function (item) { return item.id === id; });
    toast(theme ? theme.name + ' applied to LeetCode' : 'Theme applied');
    if (id === draft.id) {
      draftSaved = true;
      updateDraftStatus();
    }
  }

  /* ---------- Settings controls ---------- */
  function setToggle(id, value) {
    const input = $(id);
    if (input) input.checked = Boolean(value);
  }

  function syncSettingsUI() {
    const focus = settings.focus;
    setToggle('enabledToggle', settings.enabled);
    $('intensity').value = settings.intensity;
    $('intensityValue').textContent = settings.intensity + '%';
    setToggle('fontsToggle', settings.fonts);
    setToggle('motionToggle', settings.reducedMotion);
    setToggle('focusEnabled', focus.enabled);
    setToggle('focusHeader', focus.hideHeader);
    setToggle('focusPromos', focus.hidePromos);
    setToggle('focusSidebar', focus.hideSidebar);
    setToggle('focusDiscussion', focus.hideDiscussion);
    setToggle('focusFooter', focus.hideFooter);

    $('soundVolume').value = Math.round(settings.audio.volume * 100);
    $('soundVolumeValue').textContent = Math.round(settings.audio.volume * 100) + '%';
    setToggle('pauseOnHide', settings.audio.pauseOnHide);
    document.querySelectorAll('.sound-card').forEach(function (card) {
      card.classList.toggle('active', card.dataset.preset === settings.audio.preset);
    });

    setToggle('pomodoroEnabled', settings.pomodoro.enabled);
    $('workMin').value = settings.pomodoro.work;
    $('breakMin').value = settings.pomodoro.break;
    $('longBreakMin').value = settings.pomodoro.longBreak;
    $('longEvery').value = settings.pomodoro.longEvery;
    setToggle('autoStart', settings.pomodoro.autoStart);
    setToggle('timerSound', settings.pomodoro.sound);

    LCT.audio.setVolume(settings.audio.volume);
    LCT.audio.setPauseOnHide(settings.audio.pauseOnHide !== false);
  }

  function bindSettings() {
    let intensityTimer = null;
    $('intensity').addEventListener('input', function () {
      const value = Number(this.value);
      $('intensityValue').textContent = value + '%';
      clearTimeout(intensityTimer);
      intensityTimer = setTimeout(function () { patchSettings({ intensity: value }); }, 180);
    });
    $('enabledToggle').addEventListener('change', function () {
      patchSettings({ enabled: this.checked });
      toast(this.checked ? 'LeetThemes enabled' : 'LeetThemes paused');
    });
    $('fontsToggle').addEventListener('change', function () { patchSettings({ fonts: this.checked }); });
    $('motionToggle').addEventListener('change', function () { patchSettings({ reducedMotion: this.checked }); });

    const focusMap = {
      focusEnabled: 'enabled',
      focusHeader: 'hideHeader',
      focusPromos: 'hidePromos',
      focusSidebar: 'hideSidebar',
      focusDiscussion: 'hideDiscussion',
      focusFooter: 'hideFooter'
    };
    Object.keys(focusMap).forEach(function (id) {
      $(id).addEventListener('change', function () {
        const patch = { focus: {} };
        patch.focus[focusMap[id]] = this.checked;
        patchSettings(patch);
      });
    });

    document.querySelectorAll('.sound-card').forEach(function (card) {
      card.addEventListener('click', function () {
        const preset = card.dataset.preset;
        patchSettings({ audio: { preset: preset, enabled: true } });
        document.querySelectorAll('.sound-card').forEach(function (other) {
          other.classList.toggle('active', other === card);
        });
        LCT.audio.setPreset(preset);
        toast('Soundscape: ' + card.querySelector('strong').textContent);
      });
    });

    let volumeTimer = null;
    $('soundVolume').addEventListener('input', function () {
      const volume = Number(this.value) / 100;
      $('soundVolumeValue').textContent = Math.round(volume * 100) + '%';
      LCT.audio.setVolume(volume);
      clearTimeout(volumeTimer);
      volumeTimer = setTimeout(function () { patchSettings({ audio: { volume: volume } }); }, 180);
    });
    $('pauseOnHide').addEventListener('change', function () {
      LCT.audio.setPauseOnHide(this.checked);
      patchSettings({ audio: { pauseOnHide: this.checked } });
    });
    $('testSound').addEventListener('click', async function () {
      if (LCT.audio.playing) {
        LCT.audio.stop();
      } else {
        const ok = await LCT.audio.start(settings.audio.preset);
        if (!ok) toast('Click again to allow audio');
      }
      updateSoundButton();
    });
    LCT.audio.onChange(updateSoundButton);

    $('pomodoroEnabled').addEventListener('change', function () {
      patchSettings({ pomodoro: { enabled: this.checked } });
    });
    const timerMap = { workMin: 'work', breakMin: 'break', longBreakMin: 'longBreak', longEvery: 'longEvery' };
    Object.keys(timerMap).forEach(function (id) {
      $(id).addEventListener('change', function () {
        const limits = { work: [1, 180], break: [1, 60], longBreak: [1, 120], longEvery: [2, 12] };
        const key = timerMap[id];
        const value = Math.max(limits[key][0], Math.min(limits[key][1], Math.round(Number(this.value) || limits[key][0])));
        this.value = value;
        const patch = { pomodoro: {} };
        patch.pomodoro[key] = value;
        patchSettings(patch);
      });
    });
    $('autoStart').addEventListener('change', function () {
      patchSettings({ pomodoro: { autoStart: this.checked } });
    });
    $('timerSound').addEventListener('change', function () {
      patchSettings({ pomodoro: { sound: this.checked } });
    });

    $('gallerySearch').addEventListener('input', renderGallery);

    document.querySelectorAll('[data-panel="sound"]').forEach(function () {
      // no-op marker; audio tab state sync happens globally
    });

    $('resetAll').addEventListener('click', async function () {
      if (!confirm('Reset all settings to defaults? Your custom themes stay saved.')) return;
      LCT.audio.stop();
      settings = await LCT.replaceSettings(LCT.DEFAULTS);
      await LCT.setPomodoroRuntime(null);
      syncSettingsUI();
      renderSidebar();
      renderGallery();
      toast('Settings reset');
    });

    $('openLeetcodeBtn').addEventListener('click', openLeetCode);
    $('aboutLeetcode').addEventListener('click', openLeetCode);
    $('welcomeLeetcode').addEventListener('click', openLeetCode);
  }

  function updateSoundButton() {
    const button = $('testSound');
    if (!button) return;
    button.textContent = LCT.audio.playing ? '■ Stop' : '▶ Preview';
    document.querySelectorAll('.sound-card').forEach(function (card) {
      card.classList.toggle('active', card.dataset.preset === (settings ? settings.audio.preset : 'cafe'));
    });
  }

  async function openLeetCode() {
    try {
      const existing = await chrome.tabs.query({ url: ['https://*.leetcode.com/*', 'https://*.leetcode.cn/*'] });
      if (existing && existing.length) {
        chrome.tabs.update(existing[0].id, { active: true });
        if (existing[0].windowId != null) {
          try { chrome.windows.update(existing[0].windowId, { focused: true }); } catch (error) { /* ignore */ }
        }
      } else {
        chrome.tabs.create({ url: 'https://leetcode.com/problemset/' });
      }
    } catch (error) {
      toast('Could not open LeetCode');
    }
  }

  /* ---------- Studio ---------- */
  function populateFonts() {
    ['fontUI', 'fontDisplay', 'fontMono'].forEach(function (id) {
      const select = $(id);
      select.innerHTML = '';
      FONT_OPTIONS.forEach(function (font) {
        const option = document.createElement('option');
        option.value = font;
        option.textContent = font;
        select.appendChild(option);
      });
    });
  }

  function buildGradient(palette) {
    return 'linear-gradient(140deg, ' + palette.bg + ' 0%, ' + palette.surface2 + ' 55%, ' + palette.accent + ' 160%)';
  }

  function fillDraft(theme, saved) {
    draft = LCT.clone(theme);
    draftSaved = Boolean(saved);
    draftDirty = false;
    $('editorTitle').textContent = saved ? draft.name : 'New theme';
    $('themeName').value = draft.name || '';
    $('themeTagline').value = draft.tagline || '';
    $('themeMode').value = draft.mode || 'dark';
    $('borderColor').value = draft.palette.border || 'rgba(255,255,255,.12)';
    COLOR_KEYS.forEach(function (key) {
      const input = document.querySelector('[data-color="' + key + '"]');
      const code = document.querySelector('[data-hex="' + key + '"]');
      const value = normalizeHex(draft.palette[key]);
      if (input) input.value = value;
      if (code) code.textContent = value;
    });
    $('fontUI').value = draft.fonts.ui || 'Inter';
    $('fontDisplay').value = draft.fonts.display || 'Space Grotesk';
    $('fontMono').value = draft.fonts.mono || 'JetBrains Mono';
    $('bgType').value = (draft.background && draft.background.type) || 'gradient';
    $('bgGradient').value = (draft.background && draft.background.gradient) || buildGradient(draft.palette);
    $('bgUrl').value = (draft.background && draft.background.url) || '';
    $('bgFit').value = (draft.background && draft.background.fit) || 'cover';
    $('bgBlur').value = (draft.background && draft.background.blur) || 0;
    $('bgDim').value = Math.round(((draft.background && draft.background.dim) || 0.35) * 100);
    updateBgRangeLabels();
    $('particles').value = (draft.effects && draft.effects.particles) || 'none';
    $('particleCount').value = (draft.effects && draft.effects.count) || 0;
    $('grain').value = Math.round(((draft.effects && draft.effects.grain) || 0) * 100);
    $('vignette').value = Math.round(((draft.effects && draft.effects.vignette) || 0) * 100);
    $('vignetteValue').textContent = $('vignette').value + '%';
    setToggle('fxAurora', draft.effects && draft.effects.aurora);
    setToggle('fxGrid', draft.effects && draft.effects.grid);
    setToggle('fxScanlines', draft.effects && draft.effects.scanlines);
    syncBackgroundUI();
    updateMediaStatus();
    updateDraftStatus();
    schedulePreview();
  }

  function updateDraftStatus() {
    const pill = $('draftPill');
    pill.classList.toggle('saved', draftSaved && !draftDirty);
    pill.textContent = draftSaved ? (draftDirty ? 'unsaved' : 'saved') : 'draft';
    $('deleteThemeBtn').classList.toggle('hidden', !draftSaved);
    $('editorTitle').textContent = draftSaved ? (draft.name || 'Untitled') : 'New theme';
  }

  function collectDraft() {
    const palette = {};
    COLOR_KEYS.forEach(function (key) {
      const input = document.querySelector('[data-color="' + key + '"]');
      palette[key] = input ? input.value : '#000000';
    });
    palette.border = $('borderColor').value.trim() || 'rgba(255,255,255,.12)';
    palette.glow = hexToRgba(palette.accent, 0.3);

    const background = {
      type: $('bgType').value,
      gradient: $('bgGradient').value.trim() || buildGradient(palette),
      mediaId: draft.background ? draft.background.mediaId || null : null,
      mediaName: draft.background ? draft.background.mediaName || '' : '',
      mediaSize: draft.background ? draft.background.mediaSize || 0 : 0,
      url: $('bgUrl').value.trim(),
      fit: $('bgFit').value,
      blur: Number($('bgBlur').value) || 0,
      dim: (Number($('bgDim').value) || 0) / 100,
      position: 'center'
    };

    const effects = {
      particles: $('particles').value,
      count: Math.max(0, Math.min(80, Math.round(Number($('particleCount').value) || 0))),
      grain: Math.max(0, Math.min(0.3, (Number($('grain').value) || 0) / 100)),
      vignette: Math.max(0, Math.min(1, (Number($('vignette').value) || 0) / 100)),
      aurora: $('fxAurora').checked,
      grid: $('fxGrid').checked,
      scanlines: $('fxScanlines').checked
    };

    return {
      id: draft.id,
      custom: true,
      name: ($('themeName').value || 'Untitled Vibe').trim().slice(0, 32),
      category: 'Custom',
      tagline: ($('themeTagline').value || 'one of one').trim().slice(0, 48),
      mode: $('themeMode').value,
      palette: palette,
      fonts: {
        ui: $('fontUI').value,
        display: $('fontDisplay').value,
        mono: $('fontMono').value,
        accent: draft.fonts.accent || 'Caveat'
      },
      effects: effects,
      background: background,
      createdAt: draft.createdAt || Date.now(),
      updatedAt: Date.now()
    };
  }

  function hexToRgba(hex, alpha) {
    const value = normalizeHex(hex).slice(1);
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function syncBackgroundUI() {
    const type = $('bgType').value;
    $('bgGradientWrap').classList.toggle('hidden', type !== 'gradient');
    $('bgUrlWrap').classList.toggle('hidden', type !== 'url');
    $('bgUploadWrap').classList.toggle('hidden', type !== 'media');
  }

  function updateBgRangeLabels() {
    $('bgBlurValue').textContent = $('bgBlur').value + 'px';
    $('bgDimValue').textContent = $('bgDim').value + '%';
  }

  async function updateMediaStatus() {
    const background = draft.background || {};
    const hasMedia = background.type === 'media' && background.mediaId;
    $('bgMediaStatus').classList.toggle('hidden', !hasMedia);
    if (hasMedia) {
      let name = background.mediaName;
      if (!name) {
        try {
          const record = await LCT.media.get(background.mediaId);
          if (record) name = record.name;
        } catch (error) { /* ignore */ }
      }
      $('bgMediaName').textContent = name || 'Uploaded media';
    }
  }

  function markDirty() {
    draftDirty = true;
    if (draftSaved) {
      $('draftPill').classList.remove('saved');
      $('draftPill').textContent = 'unsaved';
    }
    schedulePreview();
  }

  const schedulePreview = LCT.utils.debounce(sendPreview, 120);

  function sendPreview() {
    if (!previewReady || !draft) return;
    const frame = $('previewFrame');
    if (!frame.contentWindow) return;
    const theme = collectDraft();
    frame.contentWindow.postMessage({
      type: 'lct-preview',
      theme: theme,
      settings: {
        enabled: true,
        intensity: Number($('intensity').value) || 75,
        fonts: $('fontsToggle').checked,
        reducedMotion: $('motionToggle').checked
      }
    }, '*');
  }

  function bindStudio() {
    const onFormChange = function () { markDirty(); };
    ['themeName', 'themeTagline', 'themeMode', 'borderColor', 'fontUI', 'fontDisplay', 'fontMono', 'bgGradient', 'bgUrl', 'bgFit', 'bgBlur', 'bgDim', 'bgType', 'particles', 'particleCount', 'grain', 'vignette', 'fxAurora', 'fxGrid', 'fxScanlines'].forEach(function (id) {
      const element = $(id);
      if (!element) return;
      element.addEventListener('input', onFormChange);
      element.addEventListener('change', onFormChange);
    });

    COLOR_KEYS.forEach(function (key) {
      const input = document.querySelector('[data-color="' + key + '"]');
      if (!input) return;
      input.addEventListener('input', function () {
        const code = document.querySelector('[data-hex="' + key + '"]');
        if (code) code.textContent = input.value;
        markDirty();
      });
    });

    $('bgBlur').addEventListener('input', updateBgRangeLabels);
    $('bgDim').addEventListener('input', updateBgRangeLabels);
    $('vignette').addEventListener('input', function () {
      $('vignetteValue').textContent = this.value + '%';
    });
    $('bgType').addEventListener('change', syncBackgroundUI);

    $('regenGradient').addEventListener('click', function () {
      const palette = {};
      COLOR_KEYS.forEach(function (key) {
        const input = document.querySelector('[data-color="' + key + '"]');
        palette[key] = input.value;
      });
      $('bgGradient').value = buildGradient(palette);
      markDirty();
    });

    $('bgFile').addEventListener('change', async function () {
      const file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      // Images are downscaled on save; videos can't be, and every LeetCode tab loads them.
      const isVideo = /^video\//.test(file.type || '');
      const limitMB = isVideo ? 15 : 25;
      if (file.size > limitMB * 1024 * 1024) {
        toast('That file is too big — keep ' + (isVideo ? 'videos' : 'images') + ' under ' + limitMB + ' MB');
        return;
      }
      try {
        const record = await LCT.media.save(file);
        draft.background = draft.background || {};
        draft.background.type = 'media';
        draft.background.mediaId = record.id;
        draft.background.mediaName = record.name;
        draft.background.mediaSize = record.size;
        $('bgType').value = 'media';
        syncBackgroundUI();
        await updateMediaStatus();
        markDirty();
        toast(record.size < file.size ? 'Image optimized to ' + Math.max(1, Math.round(record.size / 1024)) + ' KB and stored locally' : 'Media stored locally');
      } catch (error) {
        toast('Could not save that file');
      }
    });

    $('bgRemove').addEventListener('click', function () {
      draft.background = draft.background || {};
      draft.background.mediaId = null;
      draft.background.mediaName = '';
      draft.background.mediaSize = 0;
      if ($('bgType').value === 'media') $('bgType').value = 'gradient';
      syncBackgroundUI();
      updateMediaStatus();
      markDirty();
    });

    $('newThemeBtn').addEventListener('click', function () {
      const base = activeTheme();
      fillDraft(LCT.newCustomTheme(base), false);
      toast('New draft — make it yours');
    });

    $('duplicateBtn').addEventListener('click', function () {
      const base = allThemes.find(function (theme) { return theme.id === $('duplicateSelect').value; });
      if (!base) return;
      const copy = LCT.newCustomTheme(base);
      fillDraft(copy, false);
      toast('Duplicated ' + base.name + ' as a draft');
    });

    $('importInput').addEventListener('change', async function () {
      const file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const incoming = Array.isArray(parsed) ? parsed : parsed.themes ? parsed.themes : parsed.theme ? [parsed.theme] : [parsed];
        let imported = null;
        for (const item of incoming) {
          if (!item || !item.palette) continue;
          const theme = sanitizeImported(item, LCT.newCustomTheme(LCT.themeById(settings.themeId) || LCT.THEMES[0]));
          await LCT.saveCustomTheme(theme);
          imported = imported || theme;
        }
        if (!imported) {
          toast('No valid theme found in that file');
          return;
        }
        await reloadThemes();
        fillDraft(imported, true);
        renderCustomList();
        toast('Theme pack imported');
      } catch (error) {
        toast('Could not import that theme pack');
      }
    });

    $('exportAllBtn').addEventListener('click', function () {
      if (!customThemes.length) {
        toast('No custom themes to export yet');
        return;
      }
      LCT.utils.downloadJSON('leetthemes-custom-pack.json', {
        format: 'leetthemes-pack',
        version: 1,
        exportedAt: new Date().toISOString(),
        themes: customThemes.map(stripMedia)
      });
      toast('Theme pack exported');
    });

    $('exportThemeBtn').addEventListener('click', function () {
      const theme = collectDraft();
      LCT.utils.downloadJSON((theme.name || 'theme').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json', {
        format: 'leetthemes-theme',
        version: 1,
        theme: stripMedia(theme)
      });
      toast(draft.background && draft.background.type === 'media' ? 'Exported without local media' : 'Theme exported');
    });

    $('saveThemeBtn').addEventListener('click', function () { saveDraft(false); });
    $('applyThemeBtn').addEventListener('click', function () { saveDraft(true); });
    $('deleteThemeBtn').addEventListener('click', deleteDraft);

    $('previewFrame').addEventListener('load', function () {
      previewReady = true;
      setTimeout(sendPreview, 80);
      setTimeout(sendPreview, 700);
    });
    setTimeout(function () {
      previewReady = true;
      sendPreview();
    }, 350);
    window.addEventListener('message', function (event) {
      if (event.data && event.data.type === 'lct-preview-ready') {
        previewReady = true;
        sendPreview();
      }
      if (event.data && event.data.type === 'lct-preview-error') {
        toast('Preview could not load that media');
      }
    });
  }

  const PARTICLE_TYPES = ['none', 'dust', 'petals', 'rain', 'stars', 'bubbles', 'leaves', 'fireflies', 'snow'];
  const CSS_COLOR = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\(\s*[\d.\s,%]+\))$/i;
  // Gradients may only use characters that cannot form url()/image() references to remote hosts.
  const CSS_GRADIENT = /^(repeating-)?(linear|radial|conic)-gradient\([#\w\s.,%()-]+\)$/i;

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
  }

  // Theme packs come from other people: copy only values we can validate onto a fresh base theme.
  function sanitizeImported(item, theme) {
    theme.id = LCT.makeCustomThemeId();
    theme.name = String(item.name || 'Imported Theme').slice(0, 32);
    theme.tagline = String(item.tagline || 'imported vibe').slice(0, 48);
    theme.mode = item.mode === 'light' ? 'light' : 'dark';

    const palette = item.palette || {};
    COLOR_KEYS.forEach(function (key) {
      const value = String(palette[key] || '').trim();
      if (/^#[0-9a-f]{3}$|^#[0-9a-f]{6}$/i.test(value)) theme.palette[key] = normalizeHex(value);
    });
    ['border', 'glow'].forEach(function (key) {
      const value = String(palette[key] || '').trim();
      if (CSS_COLOR.test(value)) theme.palette[key] = value;
    });

    const fonts = item.fonts || {};
    ['ui', 'display', 'mono'].forEach(function (key) {
      if (FONT_OPTIONS.indexOf(fonts[key]) !== -1) theme.fonts[key] = fonts[key];
    });

    const effects = item.effects || {};
    if (PARTICLE_TYPES.indexOf(effects.particles) !== -1) theme.effects.particles = effects.particles;
    theme.effects.count = Math.round(clampNumber(effects.count, 0, 80, theme.effects.count));
    theme.effects.grain = clampNumber(effects.grain, 0, 0.3, theme.effects.grain);
    theme.effects.vignette = clampNumber(effects.vignette, 0, 1, theme.effects.vignette);
    ['aurora', 'grid', 'scanlines'].forEach(function (key) {
      if (typeof effects[key] === 'boolean') theme.effects[key] = effects[key];
    });

    const background = item.background || {};
    const gradient = String(background.gradient || '').trim();
    if (CSS_GRADIENT.test(gradient)) theme.background.gradient = gradient;
    // Theme packs are untrusted input. Remote background URLs are a deliberate one-at-a-time
    // choice in the editor, not something an imported pack may trigger silently.
    theme.background.type = 'gradient';
    theme.background.url = '';
    if (['cover', 'contain', 'fill'].indexOf(background.fit) !== -1) theme.background.fit = background.fit;
    theme.background.blur = clampNumber(background.blur, 0, 40, theme.background.blur);
    theme.background.dim = clampNumber(background.dim, 0, 1, theme.background.dim);
    return theme;
  }

  function stripMedia(theme) {
    const copy = LCT.clone(theme);
    if (copy.background) {
      if (copy.background.type === 'media') {
        copy.background.type = 'gradient';
        copy.background.mediaId = null;
        copy.background.mediaName = '';
        copy.background.mediaSize = 0;
      }
    }
    delete copy.custom;
    return copy;
  }

  async function reloadThemes() {
    allThemes = await LCT.getAllThemes();
    customThemes = allThemes.filter(function (theme) { return theme.custom; });
  }

  async function saveDraft(apply) {
    const theme = collectDraft();
    if (!theme.name) {
      toast('Give your theme a name first');
      return;
    }
    await LCT.saveCustomTheme(theme);
    await reloadThemes();
    const savedTheme = allThemes.find(function (item) { return item.id === theme.id; }) || theme;
    draftSaved = true;
    draftDirty = false;
    fillDraft(savedTheme, true);
    renderCustomList();
    renderGallery();
    populateDuplicateSelect();
    if (apply) {
      await applyTheme(savedTheme.id);
      toast(savedTheme.name + ' saved & applied');
    } else {
      toast('Theme saved');
    }
    cleanupMedia();
  }

  async function deleteDraft() {
    if (!draftSaved) return;
    if (!confirm('Delete “' + (draft.name || 'this theme') + '”? This cannot be undone.')) return;
    const id = draft.id;
    await LCT.removeCustomTheme(id);
    if (settings.themeId === id) {
      const fallback = LCT.THEMES[0];
      settings = await LCT.setSettings({ themeId: fallback.id });
    }
    await reloadThemes();
    const nextSaved = customThemes[0];
    fillDraft(nextSaved || LCT.newCustomTheme(activeTheme()), Boolean(nextSaved));
    renderCustomList();
    renderGallery();
    populateDuplicateSelect();
    renderSidebar();
    cleanupMedia();
    toast('Theme deleted');
  }

  async function cleanupMedia() {
    try {
      const records = await LCT.media.list();
      if (!records || !records.length) return;
      const used = new Set();
      customThemes.forEach(function (theme) {
        if (theme.background && theme.background.mediaId) used.add(theme.background.mediaId);
      });
      if (draft && draft.background && draft.background.mediaId) used.add(draft.background.mediaId);
      // Skip fresh uploads: one may be saved but not yet attached to the draft when cleanup runs.
      const graceCutoff = Date.now() - 5 * 60 * 1000;
      for (const record of records) {
        if (!used.has(record.id) && (record.createdAt || 0) < graceCutoff) await LCT.media.delete(record.id);
      }
    } catch (error) { /* ignore */ }
  }

  function renderCustomList() {
    const list = $('customThemeList');
    list.innerHTML = '';
    if (!customThemes.length) {
      const empty = document.createElement('div');
      empty.className = 'custom-empty';
      empty.textContent = 'No customs yet. Your next signature theme starts with a blank draft.';
      list.appendChild(empty);
      return;
    }
    customThemes.forEach(function (theme) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'custom-item' + (draft && theme.id === draft.id ? ' active' : '');
      const dot = document.createElement('i');
      dot.className = 'dot';
      dot.style.background = theme.palette.accent;
      const name = document.createElement('span');
      name.textContent = theme.name;
      button.appendChild(dot);
      button.appendChild(name);
      button.addEventListener('click', function () { fillDraft(theme, true); });
      list.appendChild(button);
    });
  }

  function populateDuplicateSelect() {
    const select = $('duplicateSelect');
    select.innerHTML = '';
    LCT.THEMES.forEach(function (theme) {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.name;
      select.appendChild(option);
    });
    if (LCT.themeById(settings.themeId)) select.value = settings.themeId;
  }

  async function initStudio() {
    populateFonts();
    populateDuplicateSelect();
    const activeCustom = customThemes.find(function (theme) { return theme.id === settings.themeId; });
    const initial = activeCustom || customThemes[0] || LCT.newCustomTheme(activeTheme());
    fillDraft(initial, Boolean(activeCustom || customThemes[0]));
    renderCustomList();
    bindStudio();
    cleanupMedia();
  }

  /* ---------- External changes ---------- */
  function watchChanges() {
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area === 'sync' && changes[LCT.KEYS.settings] && saveDepth === 0) {
          LCT.getSettings().then(function (next) {
            settings = next;
            syncSettingsUI();
            renderSidebar();
            renderGallery();
          });
        }
        if (area === 'local' && changes[LCT.KEYS.customThemes]) {
          LCT.getAllThemes().then(function (list) {
            allThemes = list;
            customThemes = list.filter(function (theme) { return theme.custom; });
            renderGallery();
            renderCustomList();
          });
        }
      });
    } catch (error) { /* ignore */ }
  }

  /* ---------- Boot ---------- */
  async function init() {
    settings = await LCT.getSettings();
    allThemes = await LCT.getAllThemes();
    customThemes = allThemes.filter(function (theme) { return theme.custom; });
    if (!allThemes.some(function (theme) { return theme.id === settings.themeId; })) {
      settings.themeId = allThemes[0].id;
    }
    LCT.audio.setVolume(settings.audio.volume);
    LCT.audio.setPauseOnHide(settings.audio.pauseOnHide !== false);

    initNav();
    syncSettingsUI();
    renderSidebar();
    renderGallery();
    bindSettings();
    await initStudio();
    watchChanges();
    updateSoundButton();
  }

  init().catch(function (error) {
    console.error(error);
    toast('Something went wrong loading settings');
  });
})();
