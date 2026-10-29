/* LeetThemes — offline preview harness. */
(function () {
  'use strict';

  const params = new URLSearchParams(location.search);
  const embed = params.get('embed') === '1';
  document.body.classList.toggle('embed', embed);

  let currentTheme = LCT.themeById(params.get('theme')) || LCT.themeById('neon-tokyo') || LCT.THEMES[0];
  let currentSettings = {
    enabled: true,
    intensity: 78,
    fonts: true,
    reducedMotion: false
  };

  function apply(theme, settings) {
    if (!theme) return;
    currentTheme = theme;
    currentSettings = Object.assign({}, currentSettings, settings || {});
    LCT.engine.apply(theme, currentSettings);
    const select = document.getElementById('themeSelect');
    if (select && LCT.themeById(theme.id)) select.value = theme.id;
  }

  function populateSelect() {
    const select = document.getElementById('themeSelect');
    LCT.THEMES.forEach(function (theme) {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.name;
      select.appendChild(option);
    });
    select.value = currentTheme.id;
    select.addEventListener('change', function () {
      const theme = LCT.themeById(select.value);
      if (theme) apply(theme, currentSettings);
    });
    const motion = document.getElementById('motionToggle');
    motion.addEventListener('change', function () {
      currentSettings.reducedMotion = !motion.checked;
      apply(currentTheme, currentSettings);
    });
  }

  function ready() {
    if (embed) {
      try { window.parent.postMessage({ type: 'lct-preview-ready' }, '*'); } catch (error) { /* ignore */ }
    }
  }

  window.addEventListener('message', function (event) {
    const data = event.data;
    if (!data || data.type !== 'lct-preview') return;
    if (data.theme) {
      apply(data.theme, data.settings);
    }
  });

  apply(currentTheme, currentSettings);
  if (!embed) populateSelect();
  ready();
  window.addEventListener('load', ready);
})();
