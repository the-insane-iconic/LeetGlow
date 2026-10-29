/* LeetThemes — built-in theme registry. Loaded as a classic script. */
(function () {
  'use strict';

  const CATEGORIES = ['All', 'Movie', 'Lofi', 'Anime', 'Retro', 'Nature', 'Space', 'Minimal', 'Classic', 'Custom'];

  const THEMES = [
    {
      id: 'cinema-noir',
      name: 'Cinema Noir',
      category: 'Movie',
      tagline: 'main character lighting',
      mode: 'dark',
      palette: {
        bg: '#08080a',
        surface: '#121215',
        surface2: '#19191d',
        elevated: '#222228',
        text: '#f3eee2',
        muted: '#a19b8d',
        border: 'rgba(230, 220, 200, 0.14)',
        accent: '#e3b664',
        accent2: '#b64040',
        code: '#d9c8a4',
        glow: 'rgba(227, 182, 100, 0.32)'
      },
      fonts: { ui: 'Inter', display: 'Cinzel', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'dust', count: 18, grain: 0.11, vignette: 0.62, grid: false, scanlines: false, aurora: false }
    },
    {
      id: 'reel-retro',
      name: 'Reel Retro',
      category: 'Movie',
      tagline: '1970s film club',
      mode: 'dark',
      palette: {
        bg: '#17110e',
        surface: '#211813',
        surface2: '#2a1e17',
        elevated: '#34261c',
        text: '#f5e4c8',
        muted: '#b09a7f',
        border: 'rgba(245, 228, 200, 0.15)',
        accent: '#e8a44c',
        accent2: '#4b9b96',
        code: '#ead6b0',
        glow: 'rgba(232, 164, 76, 0.28)'
      },
      fonts: { ui: 'Inter', display: 'Cinzel', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'dust', count: 26, grain: 0.16, vignette: 0.5, grid: false, scanlines: false, aurora: false }
    },
    {
      id: 'lofi-cafe',
      name: 'Lofi Café',
      category: 'Lofi',
      tagline: 'cozy grind hours',
      mode: 'dark',
      palette: {
        bg: '#1a1410',
        surface: '#241c16',
        surface2: '#2d231b',
        elevated: '#382c22',
        text: '#f4e7d3',
        muted: '#b9a48c',
        border: 'rgba(244, 231, 211, 0.14)',
        accent: '#e0a86a',
        accent2: '#9cbfa3',
        code: '#e6cfae',
        glow: 'rgba(224, 168, 106, 0.3)'
      },
      fonts: { ui: 'Space Grotesk', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'dust', count: 34, grain: 0.07, vignette: 0.44, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'rainy-window',
      name: 'Rainy Window',
      category: 'Lofi',
      tagline: '2am study session',
      mode: 'dark',
      palette: {
        bg: '#0e1520',
        surface: '#162130',
        surface2: '#1c2a3c',
        elevated: '#233447',
        text: '#e6eef7',
        muted: '#93a7bd',
        border: 'rgba(230, 238, 247, 0.13)',
        accent: '#7fb7d8',
        accent2: '#c7a6e0',
        code: '#c9dcec',
        glow: 'rgba(127, 183, 216, 0.3)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'rain', count: 46, grain: 0.05, vignette: 0.52, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'sakura-dream',
      name: 'Sakura Dream',
      category: 'Anime',
      tagline: 'soft launch era',
      mode: 'light',
      palette: {
        bg: '#fbeef2',
        surface: '#fff7fa',
        surface2: '#f7e6ee',
        elevated: '#ffffff',
        text: '#4a2f42',
        muted: '#7f6174',
        border: 'rgba(74, 47, 66, 0.12)',
        accent: '#dd5e95',
        accentText: '#cb2b70',
        accent2: '#8f7be8',
        code: '#a34d76',
        glow: 'rgba(228, 107, 158, 0.26)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'petals', count: 30, grain: 0.03, vignette: 0.16, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'neon-tokyo',
      name: 'Neon Tokyo',
      category: 'Anime',
      tagline: 'late night protagonist',
      mode: 'dark',
      palette: {
        bg: '#0b0a18',
        surface: '#141327',
        surface2: '#1c1a35',
        elevated: '#252247',
        text: '#f4f0ff',
        muted: '#a79ec9',
        border: 'rgba(244, 240, 255, 0.13)',
        accent: '#ff5fa2',
        accent2: '#48e6ff',
        code: '#ffd2e9',
        glow: 'rgba(255, 95, 162, 0.3)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'rain', count: 38, grain: 0.05, vignette: 0.48, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'meadow-breeze',
      name: 'Meadow Breeze',
      category: 'Anime',
      tagline: 'healing arc, loading',
      mode: 'light',
      palette: {
        bg: '#eef7ed',
        surface: '#f7fcf4',
        surface2: '#e3f0df',
        elevated: '#ffffff',
        text: '#253b32',
        muted: '#587162',
        border: 'rgba(37, 59, 50, 0.12)',
        accent: '#4f9568',
        accentText: '#427c57',
        accent2: '#e8b45e',
        code: '#2f6b4f',
        glow: 'rgba(79, 149, 104, 0.24)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'leaves', count: 24, grain: 0.02, vignette: 0.12, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'cyberpunk-grid',
      name: 'Cyberpunk Grid',
      category: 'Retro',
      tagline: 'built different',
      mode: 'dark',
      palette: {
        bg: '#07080a',
        surface: '#101216',
        surface2: '#171a20',
        elevated: '#20242c',
        text: '#f4f7ec',
        muted: '#9aa39b',
        border: 'rgba(215, 255, 63, 0.16)',
        accent: '#d7ff3f',
        accent2: '#4ce7ff',
        code: '#d7ff8f',
        glow: 'rgba(215, 255, 63, 0.28)'
      },
      fonts: { ui: 'Space Grotesk', display: 'Orbitron', mono: 'JetBrains Mono', accent: 'Space Grotesk' },
      effects: { particles: 'dust', count: 12, grain: 0.04, vignette: 0.45, grid: true, scanlines: true, aurora: true }
    },
    {
      id: 'synthwave-sunset',
      name: 'Synthwave Sunset',
      category: 'Retro',
      tagline: 'outrun the deadline',
      mode: 'dark',
      palette: {
        bg: '#140b24',
        surface: '#1d1033',
        surface2: '#281545',
        elevated: '#351d58',
        text: '#ffeef8',
        muted: '#b79bcc',
        border: 'rgba(255, 238, 248, 0.13)',
        accent: '#ff7a59',
        accent2: '#4fe4ff',
        code: '#ffc6ad',
        glow: 'rgba(255, 122, 89, 0.28)'
      },
      fonts: { ui: 'Space Grotesk', display: 'Orbitron', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'stars', count: 38, grain: 0.04, vignette: 0.42, grid: true, scanlines: false, aurora: true }
    },
    {
      id: 'forest-mist',
      name: 'Forest Mist',
      category: 'Nature',
      tagline: 'touch grass, digitally',
      mode: 'dark',
      palette: {
        bg: '#0b1410',
        surface: '#11201a',
        surface2: '#172a22',
        elevated: '#1f372c',
        text: '#e8f3e6',
        muted: '#96ab9c',
        border: 'rgba(232, 243, 230, 0.12)',
        accent: '#7fd18b',
        accent2: '#d8c27a',
        code: '#bfe3bf',
        glow: 'rgba(127, 209, 139, 0.24)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'fireflies', count: 20, grain: 0.04, vignette: 0.4, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'ocean-deep',
      name: 'Ocean Deep',
      category: 'Nature',
      tagline: 'deep work, deeper water',
      mode: 'dark',
      palette: {
        bg: '#06131c',
        surface: '#0c2230',
        surface2: '#102c3e',
        elevated: '#163a50',
        text: '#e3f5fb',
        muted: '#8fb1c2',
        border: 'rgba(227, 245, 251, 0.12)',
        accent: '#46c8d8',
        accent2: '#8a9dff',
        code: '#b7ecf3',
        glow: 'rgba(70, 200, 216, 0.26)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'bubbles', count: 26, grain: 0.03, vignette: 0.42, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'starlight',
      name: 'Starlight',
      category: 'Space',
      tagline: 'locked in, galaxies away',
      mode: 'dark',
      palette: {
        bg: '#080b1a',
        surface: '#0f1428',
        surface2: '#151b35',
        elevated: '#1e2648',
        text: '#eef1ff',
        muted: '#9aa4c8',
        border: 'rgba(238, 241, 255, 0.12)',
        accent: '#8f9bff',
        accent2: '#e0a6ff',
        code: '#c9d2ff',
        glow: 'rgba(143, 155, 255, 0.28)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'stars', count: 64, grain: 0.02, vignette: 0.4, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'paper',
      name: 'Paper',
      category: 'Minimal',
      tagline: 'clean slate energy',
      mode: 'light',
      palette: {
        bg: '#f4efe4',
        surface: '#fbf8f1',
        surface2: '#efe8d9',
        elevated: '#ffffff',
        text: '#2b2a26',
        muted: '#6d685d',
        border: 'rgba(43, 42, 38, 0.13)',
        accent: '#c25c30',
        accentText: '#ae522b',
        accent2: '#4b6b5a',
        code: '#8a3f27',
        glow: 'rgba(180, 85, 45, 0.18)'
      },
      fonts: { ui: 'Inter', display: 'Cinzel', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'none', count: 0, grain: 0.025, vignette: 0.08, grid: false, scanlines: false, aurora: false }
    },
    {
      id: 'midnight-ink',
      name: 'Midnight Ink',
      category: 'Minimal',
      tagline: 'quiet luxury focus',
      mode: 'dark',
      palette: {
        bg: '#0b0d10',
        surface: '#12151a',
        surface2: '#181c23',
        elevated: '#21262f',
        text: '#e9edf2',
        muted: '#8f98a5',
        border: 'rgba(233, 237, 242, 0.11)',
        accent: '#7aa2ff',
        accent2: '#a78bfa',
        code: '#c7d6ff',
        glow: 'rgba(122, 162, 255, 0.24)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'none', count: 0, grain: 0.015, vignette: 0.28, grid: false, scanlines: false, aurora: false }
    },
    {
      id: 'dracula',
      name: 'Dracula',
      category: 'Classic',
      tagline: 'certified classic',
      mode: 'dark',
      palette: {
        bg: '#1e1f29',
        surface: '#282a36',
        surface2: '#313342',
        elevated: '#3a3d4f',
        text: '#f8f8f2',
        muted: '#a6a8b8',
        border: 'rgba(248, 248, 242, 0.12)',
        accent: '#bd93f9',
        accent2: '#ff79c6',
        code: '#f1fa8c',
        glow: 'rgba(189, 147, 249, 0.3)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'stars', count: 18, grain: 0.03, vignette: 0.32, grid: false, scanlines: false, aurora: true }
    },
    {
      id: 'nord',
      name: 'Nord',
      category: 'Classic',
      tagline: 'arctic calm',
      mode: 'dark',
      palette: {
        bg: '#242933',
        surface: '#2e3440',
        surface2: '#3b4252',
        elevated: '#434c5e',
        text: '#eceff4',
        muted: '#a9b3c4',
        border: 'rgba(236, 239, 244, 0.12)',
        accent: '#88c0d0',
        accent2: '#b48ead',
        code: '#a3be8c',
        glow: 'rgba(136, 192, 208, 0.28)'
      },
      fonts: { ui: 'Inter', display: 'Space Grotesk', mono: 'JetBrains Mono', accent: 'Caveat' },
      effects: { particles: 'snow', count: 26, grain: 0.04, vignette: 0.35, grid: false, scanlines: false, aurora: true }
    }
  ];

  function byId(id) {
    return THEMES.find(function (theme) { return theme.id === id; }) || null;
  }

  function next(currentId, direction) {
    const index = THEMES.findIndex(function (theme) { return theme.id === currentId; });
    const step = direction === -1 ? -1 : 1;
    return THEMES[(index + step + THEMES.length) % THEMES.length];
  }

  const registry = {
    CATEGORIES: CATEGORIES,
    THEMES: THEMES,
    byId: byId,
    next: next,
    customPrefix: 'custom-',
    isCustom: function (theme) { return Boolean(theme && theme.custom); }
  };

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.THEMES = THEMES;
  globalThis.LCT.CATEGORIES = CATEGORIES;
  globalThis.LCT.themeById = byId;
  globalThis.LCT.nextTheme = next;
  globalThis.LCT.registry = registry;
})();
