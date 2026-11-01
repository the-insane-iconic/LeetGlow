/* LeetThemes Bootstrap — integrates LeetThemes engine & on-page widgets with LeetGlow. */
(function () {
  'use strict';

  const LCT_THEME_IDS = new Set([
    'sakura-dream', 'forest-mist', 'midnight-ink', 'lofi-cafe',
    'rainy-window', 'meadow-breeze', 'ocean-deep', 'paper', 'nord'
  ]);

  const state = {
    settings: null,
    theme: null,
    booted: false,
    gestureArmed: false,
    gestureHandler: null
  };

  const PRESET_TITLES = {
    cafe: 'Lofi Café',
    water: 'Lofi Water',
    fish: 'Lofi Fish',
    night: 'Night Drive'
  };

  function toast(html, options) {
    if (globalThis.LCT && globalThis.LCT.widgets) {
      globalThis.LCT.widgets.showToast(html, options);
    }
  }

  function updateAudioWidget(data) {
    if (!state.settings || !globalThis.LCT || !globalThis.LCT.widgets) return;
    const enabled = Boolean(state.settings.audio && state.settings.audio.enabled);
    const audio = globalThis.LCT.audio;
    if (!enabled || !audio) {
      globalThis.LCT.widgets.updateAudio({ visible: false });
      return;
    }
    const activePreset = (data && data.preset)
      ? data.preset
      : (audio.preset || ((state.settings.audio && state.settings.audio.preset === 'rain')
        ? 'water'
        : (state.settings.audio ? state.settings.audio.preset : 'cafe')));

    if (state.settings.audio && activePreset !== state.settings.audio.preset) {
      state.settings.audio.preset = activePreset;
      globalThis.LCT.setSettings({ audio: { preset: activePreset } });
    }

    globalThis.LCT.widgets.updateAudio({
      visible: true,
      playing: audio.playing,
      pending: audio.pending,
      title: PRESET_TITLES[activePreset] || 'Lofi',
      volume: state.settings.audio.volume
    });
  }

  function disarmGesture() {
    if (!state.gestureArmed) return;
    state.gestureArmed = false;
    if (state.gestureHandler) {
      document.removeEventListener('pointerdown', state.gestureHandler, true);
      document.removeEventListener('keydown', state.gestureHandler, true);
      state.gestureHandler = null;
    }
  }

  function armAudioGesture() {
    if (state.gestureArmed) return;
    state.gestureArmed = true;
    state.gestureHandler = function (event) {
      if (!state.settings || !state.settings.audio || !state.settings.audio.enabled) {
        disarmGesture();
        return;
      }
      if (event.target && event.target.closest && event.target.closest('#lct-widgets')) return;
      if (globalThis.LCT && globalThis.LCT.audio) {
        globalThis.LCT.audio.start(state.settings.audio.preset).then(function (ok) {
          if (ok) {
            disarmGesture();
            updateAudioWidget();
          }
        });
      }
    };
    document.addEventListener('pointerdown', state.gestureHandler, true);
    document.addEventListener('keydown', state.gestureHandler, true);
  }

  async function startAudio() {
    if (!state.settings || !state.settings.audio || !state.settings.audio.enabled) return;
    if (!globalThis.LCT || !globalThis.LCT.audio) return;
    const ok = await globalThis.LCT.audio.start(state.settings.audio.preset);
    updateAudioWidget();
    if (!ok && !document.hidden) {
      armAudioGesture();
      toast('<strong>Click anywhere</strong> to start the lofi vibes');
    }
  }

  function toggleAudio() {
    if (!state.settings) {
      state.settings = { enabled: true, audio: { enabled: true, preset: 'cafe', volume: 0.32 } };
    }
    if (!state.settings.audio) state.settings.audio = { enabled: true, preset: 'cafe', volume: 0.32 };
    const audio = globalThis.LCT.audio;
    let nextOn = false;
    if (audio && audio.playing) {
      audio.stop();
      state.settings.audio.enabled = false;
      updateAudioWidget();
      nextOn = false;
    } else {
      state.settings.audio.enabled = true;
      startAudio();
      nextOn = true;
    }
    chrome.storage.local.get(['lctSettings'], (res) => {
      const cfg = res.lctSettings || {};
      cfg.audio = cfg.audio || {};
      cfg.audio.enabled = nextOn;
      chrome.storage.local.set({ lctSettings: cfg });
    });
    return nextOn;
  }

  function togglePomodoro() {
    if (!state.settings) {
      state.settings = { enabled: true, pomodoro: { enabled: false } };
    }
    state.settings.pomodoro = state.settings.pomodoro || {};
    const nextOn = !state.settings.pomodoro.enabled;
    state.settings.pomodoro.enabled = nextOn;
    state.settings.enabled = true;
    if (globalThis.LCT && globalThis.LCT.pomodoro) {
      globalThis.LCT.pomodoro.setSettings(state.settings);
    }
    chrome.storage.local.get(['lctSettings'], (res) => {
      const cfg = res.lctSettings || {};
      cfg.pomodoro = cfg.pomodoro || {};
      cfg.pomodoro.enabled = nextOn;
      chrome.storage.local.set({ lctSettings: cfg });
    });
    return nextOn;
  }

  function nextPresetFromWidget() {
    if (!state.settings || !globalThis.LCT) return;
    const audio = globalThis.LCT.audio;
    let nextPresetKey;
    if (audio) {
      nextPresetKey = audio.nextPreset();
    } else {
      const presets = Object.keys(globalThis.LCT.AUDIO_PRESETS || { cafe: 1, water: 1, fish: 1, night: 1 });
      let current = presets.indexOf(state.settings.audio.preset);
      if (current === -1) current = 0;
      nextPresetKey = presets[(current + 1) % presets.length];
    }
    if (state.settings.audio) {
      state.settings.audio.preset = nextPresetKey;
    }
    globalThis.LCT.setSettings({ audio: { preset: nextPresetKey } });
    updateAudioWidget({ preset: nextPresetKey });
  }

  let volumeSaveTimer = null;
  function setVolumeFromWidget(volume) {
    if (!state.settings || !globalThis.LCT) return;
    if (globalThis.LCT.audio) globalThis.LCT.audio.setVolume(volume);
    state.settings.audio.volume = volume;
    clearTimeout(volumeSaveTimer);
    volumeSaveTimer = setTimeout(function () {
      globalThis.LCT.setSettings({ audio: { volume: volume } });
    }, 160);
  }

  function disableAudioFromWidget() {
    if (!globalThis.LCT) return;
    if (globalThis.LCT.audio) globalThis.LCT.audio.stop();
    globalThis.LCT.setSettings({ audio: { enabled: false } });
    updateAudioWidget();
  }

  function openStudio() {
    try {
      chrome.runtime.sendMessage({ type: 'open-side-panel' });
    } catch (e) {}
  }

  let lastSyncedLctThemeId = null;

  async function syncActiveTheme(themeId) {
    if (!globalThis.LCT || !globalThis.LCT.engine) return;
    const isLctTheme = LCT_THEME_IDS.has(themeId);
    if (!isLctTheme) {
      // Clear LeetThemes styles only if an LCT theme was previously active
      if (lastSyncedLctThemeId !== null) {
        lastSyncedLctThemeId = null;
        globalThis.LCT.engine.clear(state.settings || {});
        state.theme = null;
      }
      return;
    }

    // Deduplicate: avoid re-running apply engine if this LCT theme is already active
    if (themeId === lastSyncedLctThemeId) return;
    lastSyncedLctThemeId = themeId;

    const theme = globalThis.LCT.themeById ? globalThis.LCT.themeById(themeId) : null;
    if (!theme) return;

    state.theme = theme;
    const settings = Object.assign({}, state.settings || {}, {
      enabled: true,
      themeId: themeId,
      intensity: 85,
      fonts: true
    });
    globalThis.LCT.engine.apply(theme, settings);
  }

  async function boot() {
    if (!globalThis.LCT) return;

    // 1. Mount Shadow DOM widgets on page
    if (globalThis.LCT.widgets) {
      globalThis.LCT.widgets.mount();
      globalThis.LCT.widgets.configure({
        audioToggle: toggleAudio,
        audioNext: nextPresetFromWidget,
        audioVolume: setVolumeFromWidget,
        audioClose: disableAudioFromWidget,
        openSettings: openStudio
      });
      globalThis.LCT.widgets.setVisible(true);
    }

    // 2. Load settings
    const settings = await globalThis.LCT.getSettings();
    if (settings && settings.audio && settings.audio.preset === 'rain') {
      settings.audio.preset = 'water';
      globalThis.LCT.setSettings({ audio: { preset: 'water' } });
    }
    state.settings = settings;

    // 3. Audio setup
    if (globalThis.LCT.audio) {
      globalThis.LCT.audio.setVolume(settings.audio ? settings.audio.volume : 0.32);
      globalThis.LCT.audio.setPauseOnHide(true);
      globalThis.LCT.audio.onChange(updateAudioWidget);
    }

    // 4. Pomodoro setup
    if (globalThis.LCT.pomodoro) {
      await globalThis.LCT.pomodoro.init({
        settings: settings,
        widgets: globalThis.LCT.widgets,
        audio: globalThis.LCT.audio,
        toast: toast,
        onDisable: function () {
          globalThis.LCT.setSettings({ pomodoro: { enabled: false } });
        },
        openSettings: openStudio
      });
    }

    // 5. Read active theme from LeetGlow storage
    chrome.storage.local.get(['lcThemeStudio', 'lctSettings'], (res) => {
      const activeTheme = res.lcThemeStudio || 'paper';
      syncActiveTheme(activeTheme);
      const audioEnabled = (res.lctSettings && res.lctSettings.audio && typeof res.lctSettings.audio.enabled === 'boolean')
        ? res.lctSettings.audio.enabled
        : true;
      if (audioEnabled) {
        startAudio();
      }
      if (res.lctSettings && res.lctSettings.pomodoro && res.lctSettings.pomodoro.enabled) {
        if (globalThis.LCT.pomodoro) {
          globalThis.LCT.pomodoro.setSettings(Object.assign({}, state.settings, {
            enabled: true,
            pomodoro: Object.assign({}, (state.settings && state.settings.pomodoro) || {}, { enabled: true })
          }));
        }
      }

      // First-run onboarding toast
      chrome.storage.local.get(['leetglowWelcomed'], (wRes) => {
        if (!wRes.leetglowWelcomed) {
          chrome.storage.local.set({ leetglowWelcomed: true });
          const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
          const shortcut = isMac ? '⌘+Shift+.' : 'Ctrl+Shift+.';
          setTimeout(() => {
            toast(
              `✨ <strong>Welcome to LeetGlow!</strong> Press <strong>${shortcut}</strong> for Focus Mode, or click the toolbar icon to switch themes.`,
              { duration: 6500 }
            );
          }, 1500);
        }
      });
    });

    // 6. Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.lcThemeStudio) {
        if (typeof globalThis.__lctsApplyTheme === 'function') {
          globalThis.__lctsApplyTheme(changes.lcThemeStudio.newValue);
        } else {
          syncActiveTheme(changes.lcThemeStudio.newValue);
        }
      }
      if (changes.lctSettings && changes.lctSettings.newValue) {
        state.settings = changes.lctSettings.newValue;
        if (state.settings.audio) {
          if (state.settings.audio.enabled && !globalThis.LCT.audio.playing) {
            startAudio();
          } else if (!state.settings.audio.enabled && globalThis.LCT.audio.playing) {
            globalThis.LCT.audio.stop();
          }
          updateAudioWidget();
        }
        if (state.settings.pomodoro && globalThis.LCT.pomodoro) {
          globalThis.LCT.pomodoro.setSettings(state.settings);
        }
      }
    });

    // 7. Message bus for popup quick actions (Focus, Lofi, Timer, Theme)
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg) return;
      if (msg.type === 'lct:set-theme') {
        if (typeof globalThis.__lctsApplyTheme === 'function') {
          globalThis.__lctsApplyTheme(msg.theme);
        } else {
          syncActiveTheme(msg.theme);
        }
        sendResponse({ ok: true });
      } else if (msg.type === 'lct:toggle-audio') {
        const on = toggleAudio();
        sendResponse({ ok: true, playing: on });
      } else if (msg.type === 'lct:toggle-pomodoro') {
        const on = togglePomodoro();
        sendResponse({ ok: true, enabled: on });
      } else if (msg.type === 'lct:toggle-focus') {
        if (globalThis.LCT.focus) {
          const root = document.documentElement;
          const isFocus = root.hasAttribute('data-lc-focus') || root.classList.contains('lct-focus');
          root.toggleAttribute('data-lc-focus', !isFocus);
          root.classList.toggle('lct-focus', !isFocus);
          if (globalThis.LCT.widgets) globalThis.LCT.widgets.setFocus(!isFocus);
          sendResponse({ ok: true, focus: !isFocus });
        }
      } else if (msg.type === 'lcts:play-moment') {
        try {
          document.dispatchEvent(new CustomEvent('lcts:moment', { detail: msg.moment }));
        } catch (e) {}
        sendResponse({ ok: true });
      }
    });

    state.booted = true;
  }

  // Early theme apply
  chrome.storage.local.get(['lcThemeStudio'], (res) => {
    const activeTheme = (res && res.lcThemeStudio) || 'paper';
    if (activeTheme && LCT_THEME_IDS.has(activeTheme)) {
      document.documentElement.setAttribute('data-lct-enabled', 'true');
      document.documentElement.setAttribute('data-lct-theme', activeTheme);
      syncActiveTheme(activeTheme);
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  globalThis.LCTBootstrap = { syncActiveTheme, toggleAudio };
})();

