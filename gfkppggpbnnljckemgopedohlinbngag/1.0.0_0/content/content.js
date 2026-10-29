/* LeetThemes — content bootstrap: theme, focus, audio and timer wiring. */
(function () {
  'use strict';

  const state = {
    settings: null,
    theme: null,
    booted: false,
    gestureArmed: false,
    gestureHandler: null,
    lastAudioEnabled: false
  };

  const PRESET_TITLES = {
    cafe: 'Lofi Café',
    rain: 'Rainy Window',
    night: 'Night Drive'
  };

  function toast(html, options) {
    if (state.settings && state.settings.enabled === false) return;
    LCT.widgets.showToast(html, options);
  }

  function updateAudioWidget() {
    if (!state.settings) return;
    const enabled = state.settings.enabled && state.settings.audio.enabled;
    const audio = LCT.audio;
    if (!enabled) {
      LCT.widgets.updateAudio({ visible: false });
      return;
    }
    LCT.widgets.updateAudio({
      visible: true,
      playing: audio.playing,
      pending: audio.pending,
      title: PRESET_TITLES[state.settings.audio.preset] || 'Lofi',
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
      if (!state.settings || !state.settings.enabled || !state.settings.audio.enabled) {
        disarmGesture();
        return;
      }
      if (event.target && event.target.closest && event.target.closest('#lct-widgets')) return;
      LCT.audio.start(state.settings.audio.preset).then(function (ok) {
        if (ok) {
          disarmGesture();
          updateAudioWidget();
        }
      });
    };
    document.addEventListener('pointerdown', state.gestureHandler, true);
    document.addEventListener('keydown', state.gestureHandler, true);
  }

  async function startAudio() {
    if (!state.settings || !state.settings.enabled || !state.settings.audio.enabled) return;
    const ok = await LCT.audio.start(state.settings.audio.preset);
    updateAudioWidget();
    if (!ok && !document.hidden) {
      armAudioGesture();
      toast('<strong>Click anywhere</strong> to start the lofi vibes');
    }
  }

  function toggleAudioFromWidget() {
    if (!state.settings || !state.settings.audio.enabled) return;
    if (LCT.audio.playing) {
      LCT.audio.stop();
      updateAudioWidget();
    } else {
      startAudio();
    }
  }

  function nextPresetFromWidget() {
    if (!state.settings) return;
    const presets = Object.keys(LCT.AUDIO_PRESETS);
    const current = presets.indexOf(state.settings.audio.preset);
    const preset = presets[(current + 1) % presets.length];
    LCT.setSettings({ audio: { preset: preset } });
    updateAudioWidget();
  }

  let volumeSaveTimer = null;

  function setVolumeFromWidget(volume) {
    if (!state.settings) return;
    LCT.audio.setVolume(volume);
    state.settings.audio.volume = volume;
    clearTimeout(volumeSaveTimer);
    volumeSaveTimer = setTimeout(function () {
      LCT.setSettings({ audio: { volume: volume } });
    }, 160);
  }

  function disableAudioFromWidget() {
    LCT.setSettings({ audio: { enabled: false } });
  }

  function openOptions() {
    try {
      chrome.runtime.sendMessage({ type: 'lct:open-options' });
    } catch (error) {
      window.open(chrome.runtime.getURL('options/options.html'), '_blank');
    }
  }

  async function applyTheme(settings) {
    const theme = await LCT.getResolvedTheme(settings.themeId);
    state.theme = theme;
    if (settings.enabled) {
      LCT.engine.apply(theme, settings);
    } else {
      LCT.engine.clear(settings);
    }
  }

  function applyChrome(settings) {
    const active = settings.enabled !== false;
    LCT.focus.apply(active ? settings : { focus: { enabled: false } });
    LCT.widgets.setVisible(active);
  }

  function syncAudio(previous, next) {
    const audio = LCT.audio;
    const active = next.enabled && next.audio.enabled;
    audio.setVolume(next.audio.volume);
    audio.setPauseOnHide(next.audio.pauseOnHide !== false);

    if (!active) {
      if (previous && previous.enabled && previous.audio.enabled) audio.stop();
      disarmedCheck();
      updateAudioWidget();
      return;
    }

    const justEnabled = !previous || !previous.enabled || !previous.audio.enabled;
    if (justEnabled && state.booted) {
      const samePreset = previous && previous.audio.preset === next.audio.preset;
      if (!samePreset && audio.playing) audio.setPreset(next.audio.preset);
      startAudio().then(updateAudioWidget);
    } else if (audio.playing && previous && previous.audio.preset !== next.audio.preset) {
      audio.setPreset(next.audio.preset);
      if (!audio.playing) startAudio();
    }
    updateAudioWidget();
  }

  function themeNeedsRebuild(previous, next) {
    if (!previous) return true;
    return previous.enabled !== next.enabled ||
      previous.themeId !== next.themeId ||
      previous.intensity !== next.intensity ||
      previous.fonts !== next.fonts ||
      previous.reducedMotion !== next.reducedMotion;
  }

  function disarmedCheck() {
    if (LCT.audio.playing) LCT.audio.stop();
    disarmGesture();
  }

  async function boot() {
    LCT.widgets.mount();
    LCT.widgets.configure({
      audioToggle: toggleAudioFromWidget,
      audioNext: nextPresetFromWidget,
      audioVolume: setVolumeFromWidget,
      audioClose: disableAudioFromWidget,
      openSettings: openOptions
    });

    const settings = await LCT.getSettings();
    state.settings = settings;
    state.lastAudioEnabled = settings.audio.enabled;
    LCT.audio.setVolume(settings.audio.volume);
    LCT.audio.setPauseOnHide(settings.audio.pauseOnHide !== false);

    await applyTheme(settings);
    LCT.focus.init(LCT.widgets, function (enabled) {
      LCT.setSettings({ focus: { enabled: enabled } });
    });
    applyChrome(settings);

    await LCT.pomodoro.init({
      settings: settings,
      widgets: LCT.widgets,
      audio: LCT.audio,
      toast: toast,
      onDisable: function () { LCT.setSettings({ pomodoro: { enabled: false } }); },
      openSettings: openOptions
    });

    LCT.audio.onChange(updateAudioWidget);

    if (settings.enabled && settings.audio.enabled) {
      updateAudioWidget();
    }

    LCT.onSettingsChanged(async function (next) {
      const previous = state.settings;
      state.settings = next;
      state.lastAudioEnabled = next.audio.enabled;

      if (themeNeedsRebuild(previous, next)) {
        await applyTheme(next);
      }
      applyChrome(next);
      syncAudio(previous, next);
      LCT.pomodoro.setSettings(next.enabled ? next : Object.assign({}, next, { pomodoro: Object.assign({}, next.pomodoro, { enabled: false }) }));
      if (next.enabled && next.audio.enabled) updateAudioWidget();
      else LCT.widgets.updateAudio({ visible: false });
    });

    LCT.onCustomThemesChanged(async function () {
      if (!state.settings) return;
      await applyTheme(state.settings);
    });

    state.booted = true;
    updateAudioWidget();
  }

  try {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (!message || !message.type) return;
      if (message.type === 'lct:ping') {
        sendResponse({ ok: true, themed: Boolean(state.theme), booted: state.booted });
        return;
      }
      if (message.type === 'lct:command') {
        if (message.command === 'audio-toggle') toggleAudioFromWidget();
        if (message.command === 'audio-start') startAudio();
        if (message.command === 'audio-stop') { LCT.audio.stop(); updateAudioWidget(); }
        if (message.command === 'toast' && message.message) toast(message.message);
        sendResponse({ ok: true });
        return;
      }
      if (message.type === 'lct:refresh') {
        applyTheme(state.settings || {}).catch(function () {});
        updateAudioWidget();
        sendResponse({ ok: true });
      }
    });
  } catch (error) { /* extension reloaded */ }

  async function earlyBoot() {
    const settings = await LCT.getSettings();
    state.settings = settings;
    LCT.audio.setVolume(settings.audio.volume);
    LCT.audio.setPauseOnHide(settings.audio.pauseOnHide !== false);
    await applyTheme(settings);
    LCT.focus.apply(settings.enabled ? settings : { focus: { enabled: false } });
  }

  earlyBoot()
    .catch(function (error) { console.warn('LeetThemes early boot', error); })
    .finally(function () {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { boot().catch(console.warn); }, { once: true });
      } else {
        boot().catch(console.warn);
      }
    });
})();
