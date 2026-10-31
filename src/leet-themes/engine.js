/* LeetThemes — theme application + animated backdrop engine. */
(function () {
  'use strict';

  const BACKDROP_ID = 'lct-backdrop';
  const PALETTE_VARS = {
    bg: '--lct-bg',
    surface: '--lct-surface',
    surface2: '--lct-surface-2',
    elevated: '--lct-elevated',
    text: '--lct-text',
    muted: '--lct-muted',
    border: '--lct-border',
    accent: '--lct-accent',
    accent2: '--lct-accent-2',
    code: '--lct-code',
    glow: '--lct-glow'
  };

  let activeMediaURL = null;
  let mediaToken = 0;
  let lastParticleSignature = '';
  let lastBackgroundSignature = null;
  let activeSettings = null;
  let originalThemeClasses = null;
  let modeObserver = null;

  function hexToHsl(hex) {
    let value = String(hex || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(value)) {
      value = '#' + value.slice(1).split('').map(function (char) { return char + char; }).join('');
    }
    if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
    const r = parseInt(value.slice(1, 3), 16) / 255;
    const g = parseInt(value.slice(3, 5), 16) / 255;
    const b = parseInt(value.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    const lightness = (max + min) / 2;
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    return Math.round(hue) + ' ' + Math.round(saturation * 100) + '% ' + Math.round(lightness * 100) + '%';
  }

  function hexToRgb(hex) {
    let value = String(hex || '').trim();
    if (/^#[0-9a-f]{3}$/i.test(value)) {
      value = '#' + value.slice(1).split('').map(function (char) { return char + char; }).join('');
    }
    if (!/^#[0-9a-f]{6}$/i.test(value)) return null;
    return [
      parseInt(value.slice(1, 3), 16) / 255,
      parseInt(value.slice(3, 5), 16) / 255,
      parseInt(value.slice(5, 7), 16) / 255
    ];
  }

  function relativeLuminance(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0.5;
    const channels = rgb.map(function (channel) {
      return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  }

  function contrastRatio(a, b) {
    const first = relativeLuminance(a);
    const second = relativeLuminance(b);
    const light = Math.max(first, second);
    const dark = Math.min(first, second);
    return (light + 0.05) / (dark + 0.05);
  }

  function hexToHslTuple(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) return null;
    const r = rgb[0], g = rgb[1], b = rgb[2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let hue = 0;
    if (delta) {
      if (max === r) hue = ((g - b) / delta) % 6;
      else if (max === g) hue = (b - r) / delta + 2;
      else hue = (r - g) / delta + 4;
      hue *= 60;
      if (hue < 0) hue += 360;
    }
    const lightness = (max + min) / 2;
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
    return [hue, saturation, lightness];
  }

  function hslToHex(hue, saturation, lightness) {
    const h = ((hue % 360) + 360) % 360;
    const s = Math.max(0, Math.min(1, saturation));
    const l = Math.max(0, Math.min(1, lightness));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }
    return '#' + [r, g, b].map(function (value) {
      return Math.round((value + m) * 255).toString(16).padStart(2, '0');
    }).join('');
  }

  // Light themes need a darker variant for accent-coloured text/links than for accent-filled buttons.
  function accessibleAccentText(accent, surface, background, mode) {
    if (mode !== 'light') return accent;
    if (!hexToRgb(accent) || !hexToRgb(surface)) return accent;
    const targets = [surface, background].filter(function (color) { return hexToRgb(color); });
    const passes = function (color) {
      return targets.every(function (target) { return contrastRatio(color, target) >= 4.5; });
    };
    if (passes(accent)) return accent;
    const hsl = hexToHslTuple(accent);
    if (!hsl) return accent;
    for (let lightness = hsl[2]; lightness >= 0; lightness -= 0.01) {
      const candidate = hslToHex(hsl[0], hsl[1], lightness);
      if (passes(candidate)) return candidate;
    }
    return '#000000';
  }

  function readableOnAccent(accent) {
    if (!hexToRgb(accent)) return '#0b0b10';
    return contrastRatio(accent, '#0b0b10') >= contrastRatio(accent, '#ffffff') ? '#0b0b10' : '#ffffff';
  }

  function applyHslVars(root, palette) {
    const map = {
      '--lct-hsl-bg': palette.bg,
      '--lct-hsl-surface': palette.surface,
      '--lct-hsl-surface-2': palette.surface2,
      '--lct-hsl-elevated': palette.elevated,
      '--lct-hsl-text': palette.text,
      '--lct-hsl-muted': palette.muted,
      '--lct-hsl-accent': palette.accent,
      '--lct-hsl-accent-2': palette.accent2
    };
    Object.keys(map).forEach(function (name) {
      const hsl = hexToHsl(map[name]);
      if (hsl) root.style.setProperty(name, hsl);
    });
  }

  function enforceModeClass() {
    if (!activeSettings || activeSettings.enabled === false) return;
    const root = document.documentElement;
    const wanted = root.dataset.lctMode === 'light' ? 'light' : 'dark';
    if (root.classList.contains(wanted)) {
      if (root.classList.contains(wanted === 'dark' ? 'light' : 'dark')) {
        root.classList.remove(wanted === 'dark' ? 'light' : 'dark');
      }
      return;
    }
    root.classList.remove(wanted === 'dark' ? 'light' : 'dark');
    root.classList.add(wanted);
  }

  function syncLeetCodeMode(mode) {
    const root = document.documentElement;
    if (!originalThemeClasses) {
      originalThemeClasses = {
        dark: root.classList.contains('dark'),
        light: root.classList.contains('light')
      };
    }
    root.classList.toggle('dark', mode === 'dark');
    root.classList.toggle('light', mode === 'light');
    if (!modeObserver) {
      modeObserver = new MutationObserver(function () { enforceModeClass(); });
      modeObserver.observe(root, { attributes: true, attributeFilter: ['class'] });
    }
  }

  function restoreLeetCodeMode() {
    if (modeObserver) {
      modeObserver.disconnect();
      modeObserver = null;
    }
    if (!originalThemeClasses) return;
    const root = document.documentElement;
    root.classList.toggle('dark', originalThemeClasses.dark);
    root.classList.toggle('light', originalThemeClasses.light);
    originalThemeClasses = null;
  }

  function motionIsReduced(settings) {
    if (settings && settings.reducedMotion) return true;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (error) {
      return false;
    }
  }

  function ensureBackdrop() {
    let backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) return backdrop;

    backdrop = document.createElement('div');
    backdrop.id = BACKDROP_ID;
    backdrop.setAttribute('aria-hidden', 'true');
    backdrop.innerHTML = [
      '<div class="lct-bg-base"></div>',
      '<div class="lct-bg-prev"></div>',
      '<div class="lct-bg-media"></div>',
      '<div class="lct-bg-aurora"><i></i><i></i><i></i></div>',
      '<div class="lct-bg-grid"></div>',
      '<div class="lct-bg-particles"></div>',
      '<div class="lct-bg-scanlines"></div>',
      '<div class="lct-bg-shade"></div>',
      '<div class="lct-bg-grain"></div>',
      '<div class="lct-bg-vignette"></div>'
    ].join('');

    const target = document.body || document.documentElement;
    target.appendChild(backdrop);
    return backdrop;
  }

  function setVars(root, theme, settings) {
    const palette = theme.palette || {};
    Object.keys(PALETTE_VARS).forEach(function (key) {
      if (palette[key]) root.style.setProperty(PALETTE_VARS[key], palette[key]);
    });
    const fonts = theme.fonts || {};
    // 'LCT <name>' is the namespaced copy injected on LeetCode (fonts-content.css); the plain name
    // covers extension pages (popup/options/preview), which load fonts.css instead.
    const stack = function (name) {
      const clean = String(name).replace(/['"\\]/g, '');
      return "'LCT " + clean + "', '" + clean + "'";
    };
    root.style.setProperty('--lct-font-ui', stack(fonts.ui || 'Inter'));
    root.style.setProperty('--lct-font-display', stack(fonts.display || 'Space Grotesk'));
    root.style.setProperty('--lct-font-mono', stack(fonts.mono || 'JetBrains Mono'));
    root.style.setProperty('--lct-font-accent', stack(fonts.accent || 'Caveat'));

    const accentText = palette.accentText || accessibleAccentText(
      palette.accent,
      palette.surface || palette.bg,
      palette.bg,
      theme.mode === 'light' ? 'light' : 'dark'
    );
    if (accentText) root.style.setProperty('--lct-accent-text', accentText);
    const onAccent = palette.onAccent || readableOnAccent(palette.accent);
    if (onAccent) root.style.setProperty('--lct-on-accent', onAccent);

    const intensity = typeof settings.intensity === 'number' ? settings.intensity : 75;
    root.style.setProperty('--lct-intensity', String(Math.max(0, Math.min(1, intensity / 100))));
    root.style.setProperty('--lct-particle-opacity', String(0.35 + (intensity / 100) * 0.65));

    const effects = theme.effects || {};
    root.style.setProperty('--lct-grain', String(effects.grain == null ? 0.04 : effects.grain));
    root.style.setProperty('--lct-vignette', String(effects.vignette == null ? 0.4 : effects.vignette));
  }

  function applyEffectFlags(backdrop, theme) {
    const effects = theme.effects || {};
    backdrop.classList.toggle('fx-grid', Boolean(effects.grid));
    backdrop.classList.toggle('fx-scanlines', Boolean(effects.scanlines));
    backdrop.classList.toggle('fx-aurora', Boolean(effects.aurora));
    const particles = backdrop.querySelector('.lct-bg-particles');
    if (particles) {
      const type = effects.particles && effects.particles !== 'none' ? effects.particles : 'none';
      particles.dataset.particles = type;
      particles.style.display = type === 'none' ? 'none' : '';
    }
  }

  function randomBetween(min, max) {
    return min + Math.random() * (max - min);
  }

  function renderParticles(theme, settings) {
    const backdrop = ensureBackdrop();
    const layer = backdrop.querySelector('.lct-bg-particles');
    if (!layer) return;
    const effects = theme.effects || {};
    const type = effects.particles && effects.particles !== 'none' ? effects.particles : 'none';
    const intensity = typeof settings.intensity === 'number' ? settings.intensity : 75;
    const reduced = motionIsReduced(settings);
    const signature = [theme.id, type, effects.count, intensity, reduced].join(':');
    if (signature === lastParticleSignature) return;
    lastParticleSignature = signature;

    const spawn = () => {
      layer.innerHTML = '';
      if (type === 'none' || reduced) return;

      const base = Math.max(0, Number(effects.count) || 0);
      const count = Math.round(Math.min(90, base * (intensity / 100) * 1.1));
      if (!count) return;

      const fragment = document.createDocumentFragment();
      for (let index = 0; index < count; index += 1) {
        const dot = document.createElement('i');
        dot.className = 'lct-p lct-p-' + type;
        dot.style.left = randomBetween(0, 100).toFixed(2) + '%';

        if (type === 'stars') {
          dot.style.top = randomBetween(0, 100).toFixed(2) + '%';
          dot.style.setProperty('--p-size', randomBetween(1, 3.2).toFixed(2) + 'px');
          dot.style.setProperty('--p-delay', randomBetween(-10, 0).toFixed(2) + 's');
          dot.style.setProperty('--p-dur', randomBetween(2.4, 7.5).toFixed(2) + 's');
        } else if (type === 'rain') {
          dot.style.top = randomBetween(-30, 15).toFixed(2) + '%';
          dot.style.setProperty('--p-size', randomBetween(1, 1.8).toFixed(2) + 'px');
          dot.style.setProperty('--p-len', randomBetween(40, 100).toFixed(1) + 'px');
          dot.style.setProperty('--p-delay', randomBetween(-8, 0).toFixed(2) + 's');
          dot.style.setProperty('--p-dur', randomBetween(0.8, 1.8).toFixed(2) + 's');
          dot.style.setProperty('--p-drift', randomBetween(-40, -10).toFixed(1) + 'px');
        } else if (type === 'bubbles') {
          dot.style.top = randomBetween(20, 105).toFixed(2) + '%';
          dot.style.setProperty('--p-size', randomBetween(3, 12).toFixed(2) + 'px');
          dot.style.setProperty('--p-delay', randomBetween(-18, 0).toFixed(2) + 's');
          dot.style.setProperty('--p-dur', randomBetween(8, 20).toFixed(2) + 's');
          dot.style.setProperty('--p-drift', randomBetween(-30, 30).toFixed(1) + 'px');
        } else if (type === 'fireflies') {
          dot.style.top = randomBetween(15, 95).toFixed(2) + '%';
          dot.style.setProperty('--p-size', randomBetween(2, 4).toFixed(2) + 'px');
          dot.style.setProperty('--p-delay', randomBetween(-14, 0).toFixed(2) + 's');
          dot.style.setProperty('--p-dur', randomBetween(6, 15).toFixed(2) + 's');
          dot.style.setProperty('--p-drift', randomBetween(-60, 60).toFixed(1) + 'px');
        } else {
          dot.style.top = randomBetween(-15, 5).toFixed(2) + '%';
          dot.style.setProperty('--p-size', type === 'petals' ? randomBetween(6, 13).toFixed(2) + 'px' : randomBetween(1.5, 4).toFixed(2) + 'px');
          dot.style.setProperty('--p-delay', randomBetween(-24, 0).toFixed(2) + 's');
          dot.style.setProperty('--p-dur', type === 'leaves' ? randomBetween(11, 22).toFixed(2) + 's' : randomBetween(8, 20).toFixed(2) + 's');
          dot.style.setProperty('--p-drift', randomBetween(-140, 140).toFixed(1) + 'px');
          dot.style.setProperty('--p-rot', randomBetween(-180, 180).toFixed(0) + 'deg');
        }
        fragment.appendChild(dot);
      }
      layer.appendChild(fragment);
    };

    if (layer.children.length > 0) {
      layer.style.opacity = '0';
      setTimeout(() => {
        spawn();
        layer.style.opacity = '1';
      }, 200);
    } else {
      spawn();
    }
  }

  function clearMedia() {
    const backdrop = document.getElementById(BACKDROP_ID);
    if (!backdrop) return;
    const layer = backdrop.querySelector('.lct-bg-media');
    if (layer) layer.innerHTML = '';
    backdrop.classList.remove('has-media', 'media-video');
    backdrop.style.removeProperty('--lct-media-dim');
    backdrop.style.removeProperty('--lct-media-blur');
    if (activeMediaURL && activeMediaURL.indexOf('blob:') === 0) {
      URL.revokeObjectURL(activeMediaURL);
      activeMediaURL = null;
    }
  }

  function isVideoSource(type, url) {
    if (type && type.indexOf('video/') === 0) return true;
    return /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url || '');
  }

  function setMediaElement(layer, src, video, background, reducedMotion) {
    layer.innerHTML = '';
    let element;
    if (video) {
      element = document.createElement('video');
      element.muted = true;
      element.loop = true;
      element.autoplay = !reducedMotion;
      element.playsInline = true;
      element.setAttribute('muted', '');
      element.setAttribute('playsinline', '');
    } else {
      element = document.createElement('img');
      element.alt = '';
      element.decoding = 'async';
      element.loading = 'eager';
    }
    element.src = src;
    element.style.objectFit = (background && background.fit) || 'cover';
    element.style.objectPosition = (background && background.position) || 'center';
    layer.appendChild(element);
    if (!video) return;
    if (reducedMotion) {
      element.pause();
      return;
    }
    const result = element.play && element.play();
    if (result && result.catch) result.catch(function () { /* autoplay with muted should be fine */ });
  }

  async function applyCustomBackground(theme) {
    const backdrop = ensureBackdrop();
    const layer = backdrop.querySelector('.lct-bg-media');
    const base = backdrop.querySelector('.lct-bg-base');
    if (!layer || !base) return;
    const background = theme.custom ? theme.background : null;

    if (!background || background.type === 'gradient') {
      clearMedia();
      base.style.background = (background && background.gradient) || '';
      return;
    }

    const token = ++mediaToken;
    const dim = typeof background.dim === 'number' ? background.dim : 0.35;
    const blur = typeof background.blur === 'number' ? background.blur : 0;
    let src = null;
    let video = false;
    let objectURL = null;

    if (background.type === 'media' && background.mediaId && globalThis.LCT.media) {
      try {
        const result = await LCT.media.createURL(background.mediaId);
        if (result) {
          src = result.url;
          objectURL = result.url;
          video = result.record && result.record.type && result.record.type.indexOf('video/') === 0;
        }
      } catch (error) { /* media missing */ }
    } else if (background.type === 'url' && background.url) {
      src = background.url;
      video = isVideoSource('', src);
    }

    if (token !== mediaToken) {
      if (objectURL) URL.revokeObjectURL(objectURL);
      return;
    }
    if (!src) {
      base.style.background = background.gradient || '';
      return;
    }

    clearMedia();
    if (objectURL) activeMediaURL = objectURL;
    base.style.background = theme.palette.bg || '';
    backdrop.classList.add('has-media');
    backdrop.classList.toggle('media-video', video);
    backdrop.style.setProperty('--lct-media-dim', String(Math.max(0, Math.min(1, dim))));
    backdrop.style.setProperty('--lct-media-blur', String(Math.max(0, Math.min(40, blur))) + 'px');
    setMediaElement(layer, src, video, background, motionIsReduced(activeSettings || {}));

    const image = layer.querySelector(video ? 'video' : 'img');
    if (image) {
      image.addEventListener('error', function () {
        if (token === mediaToken) {
          layer.innerHTML = '';
          backdrop.classList.remove('has-media');
        }
      }, { once: true });
    }
  }

  function apply(theme, settings) {
    const root = document.documentElement;
    settings = settings || {};
    if (!theme || settings.enabled === false) {
      clear(settings);
      return;
    }

    activeSettings = settings;
    const backdrop = ensureBackdrop();

    const prevThemeId = root.dataset.lctTheme;
    if (prevThemeId && prevThemeId !== theme.id) {
      const base = backdrop.querySelector('.lct-bg-base');
      const prev = backdrop.querySelector('.lct-bg-prev');
      if (base && prev) {
        try {
          const comp = window.getComputedStyle(base);
          prev.style.transition = 'none';
          prev.style.background = comp.background || comp.backgroundImage || '';
          prev.style.backgroundColor = comp.backgroundColor || '';
          prev.style.opacity = '1';
          void prev.offsetHeight;
          requestAnimationFrame(() => {
            prev.style.transition = 'opacity 0.38s cubic-bezier(0.16, 1, 0.3, 1)';
            prev.style.opacity = '0';
          });
        } catch (e) {}
      }
    }

    root.dataset.lctEnabled = 'true';
    root.dataset.lctTheme = theme.id;
    root.dataset.lctMode = theme.mode === 'light' ? 'light' : 'dark';
    root.dataset.lctFonts = settings.fonts === false ? 'off' : 'on';
    root.dataset.lctMotion = motionIsReduced(settings) ? 'off' : 'on';
    root.dataset.lctCustom = theme.custom ? 'true' : 'false';
    syncLeetCodeMode(theme.mode === 'light' ? 'light' : 'dark');
    setVars(root, theme, settings);
    applyHslVars(root, theme.palette || {});

    applyEffectFlags(backdrop, theme);
    renderParticles(theme, settings);

    const backgroundSignature = theme.custom ? JSON.stringify(theme.background || {}) : 'builtin:' + theme.id;
    if (backgroundSignature !== lastBackgroundSignature) {
      lastBackgroundSignature = backgroundSignature;
      if (theme.custom) {
        applyCustomBackground(theme);
      } else {
        clearMedia();
        const base = backdrop.querySelector('.lct-bg-base');
        if (base) base.style.background = '';
      }
    }

    if (theme.id === 'cinema-noir' || theme.id === 'reel-retro') {
      backdrop.classList.add('cinema');
    } else {
      backdrop.classList.remove('cinema');
    }

    document.dispatchEvent(new CustomEvent('lct:theme-applied', { detail: { theme: theme } }));
  }

  function clear(settings) {
    const root = document.documentElement;
    root.removeAttribute('data-lct-theme');
    root.removeAttribute('data-lct-custom');
    // data-lct-motion='off' freezes every animation on the page, so it must not outlive the theme.
    root.removeAttribute('data-lct-motion');
    root.removeAttribute('data-lct-fonts');
    root.removeAttribute('data-lct-mode');
    root.dataset.lctEnabled = 'false';
    activeSettings = settings || null;
    restoreLeetCodeMode();
    mediaToken += 1;
    lastBackgroundSignature = null;
    clearMedia();
    lastParticleSignature = '';
    const backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) {
      backdrop.querySelector('.lct-bg-particles').innerHTML = '';
    }
  }

  function destroy() {
    const backdrop = document.getElementById(BACKDROP_ID);
    if (backdrop) backdrop.remove();
    clearMedia();
    clear();
    delete document.documentElement.dataset.lctTheme;
    delete document.documentElement.dataset.lctEnabled;
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.engine = {
    apply: apply,
    clear: clear,
    destroy: destroy,
    ensureBackdrop: ensureBackdrop,
    prefersReducedMotion: function () {
      try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (error) { return false; }
    }
  };
})();
