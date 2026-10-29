/* LeetThemes — shared settings, storage and theme resolution. */
(function () {
  'use strict';

  const KEYS = {
    settings: 'lctSettings',
    customThemes: 'lctCustomThemes',
    pomodoro: 'lctPomodoro'
  };

  const DEFAULTS = {
    version: 1,
    enabled: true,
    themeId: 'neon-tokyo',
    intensity: 75,
    fonts: true,
    reducedMotion: false,
    focus: {
      enabled: false,
      hideHeader: false,
      hidePromos: true,
      hideSidebar: true,
      hideDiscussion: true,
      hideFooter: true
    },
    audio: {
      enabled: false,
      preset: 'cafe',
      volume: 0.32,
      pauseOnHide: true
    },
    pomodoro: {
      enabled: false,
      work: 25,
      break: 5,
      longBreak: 15,
      longEvery: 4,
      autoStart: false,
      sound: true
    }
  };

  const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function deepMerge(base, patch) {
    if (patch === null || patch === undefined) return clone(base);
    if (Array.isArray(base) || Array.isArray(patch)) return clone(patch);
    if (typeof base !== 'object' || typeof patch !== 'object') return patch;
    const result = clone(base);
    Object.keys(patch).forEach(function (key) {
      result[key] = key in base ? deepMerge(base[key], patch[key]) : clone(patch[key]);
    });
    return result;
  }

  function areaGet(area, keys) {
    if (hasChromeStorage) {
      return new Promise(function (resolve) {
        chrome.storage[area].get(keys, function (result) {
          if (chrome.runtime.lastError) {
            resolve({});
          } else {
            resolve(result || {});
          }
        });
      });
    }
    return Promise.resolve().then(function () {
      const result = {};
      const list = Array.isArray(keys) ? keys : [keys];
      list.forEach(function (key) {
        const raw = localStorage.getItem('lct:' + key);
        if (raw) {
          try { result[key] = JSON.parse(raw); } catch (error) { /* ignore */ }
        }
      });
      return result;
    });
  }

  function areaSet(area, values) {
    if (hasChromeStorage) {
      return new Promise(function (resolve) {
        chrome.storage[area].set(values, function () { resolve(); });
      });
    }
    Object.keys(values).forEach(function (key) {
      localStorage.setItem('lct:' + key, JSON.stringify(values[key]));
    });
    return Promise.resolve();
  }

  function areaRemove(area, keys) {
    if (hasChromeStorage) {
      return new Promise(function (resolve) {
        chrome.storage[area].remove(keys, function () { resolve(); });
      });
    }
    (Array.isArray(keys) ? keys : [keys]).forEach(function (key) {
      localStorage.removeItem('lct:' + key);
    });
    return Promise.resolve();
  }

  async function getSettings() {
    const stored = await areaGet('local', KEYS.settings);
    return deepMerge(DEFAULTS, stored[KEYS.settings] || {});
  }

  async function replaceSettings(settings) {
    const next = deepMerge(DEFAULTS, settings || {});
    await areaSet('local', { [KEYS.settings]: next });
    return next;
  }

  // Serialize read-modify-write so rapid patches don't overwrite each other. On extension pages
  // and content scripts, patches are routed through local storage queue.
  let settingsQueue = Promise.resolve();
  const isServiceWorker = typeof self !== 'undefined' && typeof window === 'undefined' && typeof importScripts === 'function';

  function queueSetSettings(patch) {
    const run = settingsQueue.then(async function () {
      const current = await getSettings();
      const next = deepMerge(current, patch || {});
      await areaSet('local', { [KEYS.settings]: next });
      return next;
    });
    settingsQueue = run.catch(function () {});
    return run;
  }

  function setSettings(patch) {
    return queueSetSettings(patch);
  }

  async function getCustomThemes() {
    const stored = await areaGet('local', KEYS.customThemes);
    const list = stored[KEYS.customThemes];
    return Array.isArray(list) ? list : [];
  }

  async function setCustomThemes(list) {
    const next = Array.isArray(list) ? list : [];
    await areaSet('local', { [KEYS.customThemes]: next });
    return next;
  }

  async function saveCustomTheme(theme) {
    const list = await getCustomThemes();
    const index = list.findIndex(function (item) { return item.id === theme.id; });
    if (index >= 0) list[index] = theme;
    else list.push(theme);
    return setCustomThemes(list);
  }

  async function removeCustomTheme(id) {
    const list = await getCustomThemes();
    const next = list.filter(function (item) { return item.id !== id; });
    await setCustomThemes(next);
    return next;
  }

  async function getAllThemes() {
    const custom = await getCustomThemes();
    return globalThis.LCT.THEMES.concat(custom);
  }

  async function getResolvedTheme(id) {
    const custom = await getCustomThemes();
    const found = custom.find(function (theme) { return theme.id === id; });
    if (found) return found;
    return globalThis.LCT.themeById(id) || globalThis.LCT.themeById(DEFAULTS.themeId) || globalThis.LCT.THEMES[0];
  }

  async function getPomodoroRuntime() {
    const stored = await areaGet('local', KEYS.pomodoro);
    return stored[KEYS.pomodoro] || null;
  }

  async function setPomodoroRuntime(state) {
    await areaSet('local', { [KEYS.pomodoro]: state });
    return state;
  }

  function onSettingsChanged(callback) {
    if (!hasChromeStorage) {
      window.addEventListener('storage', function (event) {
        if (event.key === 'lct:' + KEYS.settings && event.newValue) {
          try { callback(deepMerge(DEFAULTS, JSON.parse(event.newValue))); } catch (error) { /* ignore */ }
        }
      });
      return function () {};
    }
    const listener = function (changes, area) {
      if (area === 'local' && changes[KEYS.settings]) {
        callback(deepMerge(DEFAULTS, changes[KEYS.settings].newValue || {}));
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return function () { chrome.storage.onChanged.removeListener(listener); };
  }

  function onCustomThemesChanged(callback) {
    if (!hasChromeStorage) return function () {};
    const listener = function (changes, area) {
      if (area === 'local' && changes[KEYS.customThemes]) {
        callback(changes[KEYS.customThemes].newValue || []);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return function () { chrome.storage.onChanged.removeListener(listener); };
  }

  function makeCustomThemeId() {
    return 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  function newCustomTheme(baseTheme) {
    const base = baseTheme || globalThis.LCT.THEMES[0];
    return {
      id: makeCustomThemeId(),
      custom: true,
      name: 'My Theme',
      category: 'Custom',
      tagline: 'one of one',
      mode: base.mode,
      palette: clone(base.palette),
      fonts: clone(base.fonts),
      effects: deepMerge({ particles: 'none', count: 0, grain: 0.04, vignette: 0.35, grid: false, scanlines: false, aurora: false }, base.effects || {}),
      background: {
        type: 'gradient',
        gradient: 'linear-gradient(140deg, ' + base.palette.bg + ' 0%, ' + base.palette.surface2 + ' 55%, ' + base.palette.accent + ' 160%)',
        mediaId: null,
        url: '',
        fit: 'cover',
        blur: 0,
        dim: 0.35,
        position: 'center'
      },
      createdAt: Date.now()
    };
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.KEYS = KEYS;
  globalThis.LCT.DEFAULTS = DEFAULTS;
  globalThis.LCT.clone = clone;
  globalThis.LCT.deepMerge = deepMerge;
  globalThis.LCT.storage = { get: areaGet, set: areaSet, remove: areaRemove };
  globalThis.LCT.getSettings = getSettings;
  globalThis.LCT.setSettings = setSettings;
  globalThis.LCT.replaceSettings = replaceSettings;
  globalThis.LCT.getCustomThemes = getCustomThemes;
  globalThis.LCT.setCustomThemes = setCustomThemes;
  globalThis.LCT.saveCustomTheme = saveCustomTheme;
  globalThis.LCT.removeCustomTheme = removeCustomTheme;
  globalThis.LCT.getAllThemes = getAllThemes;
  globalThis.LCT.getResolvedTheme = getResolvedTheme;
  globalThis.LCT.getPomodoroRuntime = getPomodoroRuntime;
  globalThis.LCT.setPomodoroRuntime = setPomodoroRuntime;
  globalThis.LCT.onSettingsChanged = onSettingsChanged;
  globalThis.LCT.onCustomThemesChanged = onCustomThemesChanged;
  globalThis.LCT.newCustomTheme = newCustomTheme;
  globalThis.LCT.makeCustomThemeId = makeCustomThemeId;
})();
