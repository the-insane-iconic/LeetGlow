/* =============================================================================
   studio.js — Anime Studio.

   Every change re-solves the scene here, previews it, and saves the solved
   result. LeetCode tabs then only read storage; they never decode, resize or
   solve anything themselves.
============================================================================= */
(() => {
  'use strict';

  const SCENES = globalThis.LCTS_SCENES, DEF = globalThis.LCTS_SCENE_DEFAULT;
  const ARC = globalThis.LCTS_ARC_DEFAULT || { easy: DEF, medium: DEF, hard: DEF };
  const SLOTS = [['easy', 'Easy', '日常編'], ['medium', 'Medium', '修行編'], ['hard', 'Hard', '最終決戦']];
  const Solver = globalThis.LCTSAnimeSolver, Proc = globalThis.LCTSAnimeProcess;
  const $ = (id) => document.getElementById(id);
  const MAX_INPUT = 30 * 1024 * 1024;

  const settings = { scene: DEF, arcs: true, arcScenes: {}, glass: 'auto', visibility: 0.85,
                     titleCard: true, moments: true, japanese: true, sound: true, volume: 1 };
  let slot = 'medium';          // the difficulty slot being edited while arcs are on (opens on your last problem's)
  let justSet = null;           // the scene just given to `slot`, for the confirmation line
  const preparedCache = {};     // scene id -> samples + blobs
  let themes = {};              // scene id -> solve at the current glass settings

  /* which scene the preview shows (and a gallery click changes) */
  const arcScene = (d) => (SCENES[settings.arcScenes[d]] ? settings.arcScenes[d] : ARC[d]);
  const viewId = () => settings.scene === 'custom' ? 'custom' : (settings.arcs ? arcScene(slot) : settings.scene);
  /* every scene LeetCode may show with the current settings */
  const neededIds = () => settings.scene === 'custom' ? ['custom']
    : settings.arcs ? [...new Set(SLOTS.map(([d]) => arcScene(d)))] : [settings.scene];
  let prepared = null;          // samples + blobs for the current scene
  let theme = null;             // the current solve
  let previewUrls = null;       // object URLs the preview is showing
  let hasArt = false;
  let customThumb = null;
  let isPremium = false;

  /* ---- preview frame --------------------------------------------------------- */
  const frame = $('frame');
  /* Poll for the preview's API rather than wait for the iframe's load event:
     that event can fire before this script attaches a listener, and then the
     whole Studio would wait forever. */
  const frameReady = new Promise((res) => {
    const check = () => {
      let w = null;
      try { w = frame.contentWindow; } catch (e) {}
      if (w && w.LCTSPreview && w.document.readyState !== 'loading') res();
      else setTimeout(check, 40);
    };
    check();
  });
  function fitFrame() {
    const box = $('frameBox');
    frame.style.transform = `scale(${box.clientWidth / 1280})`;
  }
  new ResizeObserver(fitFrame).observe($('frameBox'));

  let currentPreviewScene = null;
  async function showPreview() {
    await frameReady;
    if (!theme || !prepared) return;
    const sceneId = viewId();
    if (!previewUrls || currentPreviewScene !== sceneId) {
      if (previewUrls) { URL.revokeObjectURL(previewUrls.wall); URL.revokeObjectURL(previewUrls.blur); }
      previewUrls = { wall: URL.createObjectURL(prepared.wallBlob), blur: URL.createObjectURL(prepared.blurBlob) };
      currentPreviewScene = sceneId;
    }
    frame.contentWindow.LCTSPreview.apply(theme, previewUrls);
    if (settings.sceneMode === 'live' && settings.liveWallpaper && settings.liveWallpaper.videoUrl) {
      frame.contentWindow.LCTSPreview.setLiveVideo(settings.liveWallpaper.videoUrl);
    } else {
      frame.contentWindow.LCTSPreview.setLiveVideo(null);
    }
  }

  /* the studio's own accent follows the scene */
  function tintStudio() {
    if (!theme) return;
    const r = document.documentElement.style;
    const acc = theme.roles['--lc-accent'];
    r.setProperty('--accent', acc);
    r.setProperty('--accent-ink', theme.roles['--lc-accent-contrast'] || (theme.mode === 'dark' ? theme.scrim : '#ffffff'));
    if (theme.roles['--lc-hsl-accent']) {
      const parts = theme.roles['--lc-hsl-accent'].match(/\d+/g);
      if (parts && parts.length >= 3) {
        r.setProperty('--accent-text', `hsl(${parts[0]}, 80%, 38%)`);
      }
    }
  }

  /* ---- solving ---------------------------------------------------------------- */
  function solveNow() {
    if (!prepared) return;
    theme = Solver.analyze(prepared.sharp, prepared.blurSamples, {
      glass: settings.glass, visibility: settings.visibility, cols: prepared.cols
    });
    tintStudio();
  }

  async function blobFromExtension(path) {
    const res = await fetch(chrome.runtime.getURL(path));
    return res.blob();
  }

  async function samplesFor(id) {
    if (preparedCache[id]) return preparedCache[id];
    let p;
    if (id === 'custom') {
      const art = (await chrome.storage.local.get('lcAnimeArt')).lcAnimeArt;
      if (!art) return samplesFor(DEF);
      const [w, b] = await Promise.all([Proc.dataURLToBlob(art.wall), Proc.dataURLToBlob(art.blur)]);
      p = await Proc.samplesFrom(w, b);
    } else {
      const s = SCENES[id] || SCENES[DEF];
      const [w, b] = await Promise.all([blobFromExtension(s.wall), blobFromExtension(s.blur)]);
      p = await Proc.samplesFrom(w, b);
    }
    return (preparedCache[id] = p);
  }
  async function loadScene(id) { prepared = await samplesFor(id); }

  const solveOf = (p) => Solver.analyze(p.sharp, p.blurSamples, {
    glass: settings.glass, visibility: settings.visibility, cols: p.cols
  });
  /* solve every scene LeetCode may show, so each difficulty gets the same
     glass settings (a few tens of ms per scene) */
  async function solveAll() {
    const out = {};
    for (const id of neededIds()) out[id] = solveOf(await samplesFor(id));
    themes = out;
  }

  /* ---- saving ------------------------------------------------------------------ */
  let saveTimer = 0;
  async function solveAndSave() { await solveAll(); save(true); }
  function save(immediate) {
    clearTimeout(saveTimer);
    const write = () => chrome.storage.local.set({
      lcAnime: Object.assign({}, settings, { themes, theme, themeFor: viewId() })
    });
    if (immediate) write(); else saveTimer = setTimeout(write, 220);
  }

  /* ---- scene tiles ---------------------------------------------------------------- */
  function renderScenes() {
    const box = $('scenes');
    box.innerHTML = '';
    /* your own picture comes first, so it is never scrolled out of sight */
    const presets = document.createDocumentFragment();
    Object.entries(SCENES).forEach(([id, s]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(viewId() === id));
      b.style.backgroundImage = `url("${chrome.runtime.getURL(s.thumb || s.wall)}")`;

      // When basic free tier, all scenes other than golden-hour are PRO
      const isLocked = !isPremium && id !== 'golden-hour';
      if (isLocked) {
        b.classList.add('is-locked');
      }

      const proBadgeHTML = isLocked
        ? `<span class="scene-pro-badge" aria-label="PRO wallpaper">PRO</span>`
        : '';

      b.innerHTML = `${proBadgeHTML}<span class="name">${s.name}</span>`;
      b.title = isLocked
        ? `${s.name} (PRO Wallpaper — Click to unlock)`
        : s.desc + (s.credit ? ' · ' + s.credit : '');

      b.addEventListener('click', () => {
        if (isLocked) {
          $('purchaseModal').showModal();
        } else {
          pickScene(id);
        }
      });
      presets.appendChild(b);
    });

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'scene upload' + (hasArt ? ' has-art' : '');
    const upLocked = !isPremium;
    if (upLocked) {
      up.classList.add('is-locked');
    }
    up.setAttribute('role', 'radio');
    up.setAttribute('aria-checked', String(settings.scene === 'custom'));
    if (hasArt && customThumb) up.style.backgroundImage = `url("${customThumb}")`;

    const upLockHTML = upLocked
      ? `<span class="scene-pro-badge" aria-label="PRO feature">PRO</span>`
      : '';

    up.innerHTML = `${upLockHTML}<span class="plus" aria-hidden="true">+</span><span class="name">${hasArt ? 'Your picture' : 'Add your picture'}</span>`;
    up.addEventListener('click', () => {
      if (upLocked) {
        $('purchaseModal').showModal();
        return;
      }
      if (hasArt && settings.scene !== 'custom') pickScene('custom');
      else $('file').click();
    });
    ['dragenter', 'dragover'].forEach((t) => up.addEventListener(t, (e) => { e.preventDefault(); up.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach((t) => up.addEventListener(t, () => up.classList.remove('dragging')));
    up.addEventListener('drop', (e) => {
      e.preventDefault();
      if (upLocked) {
        $('purchaseModal').showModal();
        return;
      }
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) upload(f);
    });
    if (hasArt) {
      const x = document.createElement('span');
      /* an SVG cross, not the × character: a glyph sits on the font's
         baseline and never lands in the circle's true centre */
      x.className = 'remove'; x.title = 'Remove your picture';
      x.setAttribute('aria-label', 'Remove your picture');
      x.innerHTML = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5"/></svg>';
      x.setAttribute('role', 'button');
      x.addEventListener('click', (e) => { e.stopPropagation(); removeArt(); });
      up.appendChild(x);
    }
    box.appendChild(up);
    box.appendChild(presets);
    const picked = box.querySelector('[aria-checked="true"]');
    if (picked) box.scrollTop = Math.max(0, picked.offsetTop - box.offsetTop - 8);
    renderCredit();
  }

  /* the picked scene's credit; the free Freepik/Magnific licence requires
     "designed by Freepik - Magnific.com" wherever its pictures are shown */
  function renderCredit() {
    const n = $('sceneCredit');
    if (!n) return;
    if (settings.sceneMode === 'live' && settings.liveWallpaper) {
      n.textContent = settings.liveWallpaper.isSupabase
        ? `${settings.liveWallpaper.name}: Video from Supabase livewallpaper bucket`
        : `${settings.liveWallpaper.name}: High Definition Looping Live Wallpaper`;
      return;
    }
    const s = SCENES[settings.scene];
    if (!s || !s.credit || s.credit === 'Original') { n.textContent = ''; return; }
    n.textContent = s.credit.indexOf('Freepik') === 0
      ? `${s.name}: designed by Freepik – Magnific.com`
      : `${s.name}: ${s.credit}`;
  }

  /* ---- Live Wallpapers (Supabase Storage + Built-in) ----------------------------- */
  let liveWallpapersList = [];

  async function renderLiveWallpapers() {
    const box = $('liveScenes');
    if (!box) return;
    box.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 24px; font-size: 13px; color: var(--muted);"><span class="scene-spinner" style="display:inline-block; position:relative; top:3px; margin-right:8px;"></span>Syncing live wallpapers from Supabase…</div>';

    if (!liveWallpapersList.length && globalThis.LCTSLiveWallpapers) {
      liveWallpapersList = await globalThis.LCTSLiveWallpapers.getAll();
    }

    box.innerHTML = '';
    const activeLiveId = settings.liveWallpaper ? settings.liveWallpaper.id : null;

    if (!liveWallpapersList.length) {
      box.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 24px; font-size: 13px; color: var(--muted);">No live wallpapers found in bucket. Upload MP4/WebM videos to Supabase bucket <code>livewallpaper</code> to see them here!</div>';
      return;
    }

    liveWallpapersList.forEach(w => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene' + (w.isLive ? ' live-item' : ' bucket-static');
      b.setAttribute('role', 'radio');
      const isSelected = w.isLive
        ? (settings.sceneMode === 'live' && activeLiveId === w.id)
        : (settings.scene === w.id);
      b.setAttribute('aria-checked', String(isSelected));

      // Fast thumbnail: direct thumbUrl, cached snapshot, or dynamic snapshot from video
      const thumbUrl = w.thumbUrl || w.imageUrl || (w.thumb ? chrome.runtime.getURL(w.thumb) : '');
      if (thumbUrl) {
        b.style.backgroundImage = `url("${thumbUrl}")`;
      } else if (w.isLive) {
        b.classList.add('loading-thumb');
        if (globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.getThumbnail) {
          globalThis.LCTSLiveWallpapers.getThumbnail(w).then(tUrl => {
            if (tUrl) {
              b.style.backgroundImage = `url("${tUrl}")`;
              b.classList.remove('loading-thumb');
            }
          }).catch(() => {
            b.classList.remove('loading-thumb');
          });
        }
      }

      // Lock status (pro in filename = PRO for premium users only)
      const isLocked = !isPremium && w.isPro;
      if (isLocked) {
        b.classList.add('is-locked');
      }

      const proBadgeHTML = isLocked
        ? `<span class="scene-pro-badge" aria-label="PRO wallpaper">PRO</span>`
        : '';
      const liveBadgeHTML = w.isLive
        ? `<span class="live-badge"><span class="live-pulse-dot"></span> LIVE</span>`
        : '';
      const spinnerHTML = w.isLive
        ? `<span class="scene-spinner" title="Loading video..."></span>`
        : '';

      b.innerHTML = `
        ${liveBadgeHTML}
        ${proBadgeHTML}
        ${spinnerHTML}
        <span class="name">${w.name}</span>
      `;
      b.title = isLocked
        ? `${w.name} (PRO Wallpaper — Click to unlock)`
        : `${w.name}: ${w.desc}`;

      b.addEventListener('click', async () => {
        if (isLocked) {
          $('purchaseModal').showModal();
          return;
        }
        if (w.isLive) {
          await pickLiveWallpaper(w, b);
        } else {
          await pickBucketStaticWallpaper(w, b);
        }
      });

      box.appendChild(b);
    });
  }

  async function pickBucketStaticWallpaper(wallpaper, buttonEl) {
    settings.sceneMode = 'static';
    settings.scene = wallpaper.id;
    settings.staticWallpaper = wallpaper;
    delete settings.liveWallpaper;

    if (frame && frame.contentWindow && frame.contentWindow.LCTSPreview) {
      frame.contentWindow.LCTSPreview.setLiveVideo(null);
      const urls = { wall: wallpaper.imageUrl, blur: wallpaper.imageUrl };
      frame.contentWindow.LCTSPreview.apply(settings.theme || SCENES[DEF].theme, urls);
    }

    await solveAndSave();
    activate();

    const allButtons = document.querySelectorAll('#liveScenes .scene, #scenes .scene');
    allButtons.forEach(btn => btn.setAttribute('aria-checked', 'false'));
    if (buttonEl) buttonEl.setAttribute('aria-checked', 'true');
    renderCredit();
  }

  async function pickLiveWallpaper(wallpaper, buttonEl) {
    if (buttonEl) {
      buttonEl.classList.add('is-loading');
    }

    try {
      const directVideoUrl = wallpaper.videoUrl;

      // 1. Download / retrieve cached video for local preview frame
      let playableUrl = directVideoUrl;
      try {
        if (globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.downloadAndCache) {
          playableUrl = await globalThis.LCTSLiveWallpapers.downloadAndCache(directVideoUrl);
        }
      } catch (cacheErr) {
        console.warn('[LeetGlow Live] Cache download error, using direct URL:', cacheErr);
      }

      // 2. Play in preview
      if (frame && frame.contentWindow && frame.contentWindow.LCTSPreview) {
        frame.contentWindow.LCTSPreview.setLiveVideo(playableUrl || directVideoUrl);
      }

      // 3. Save mode and live wallpaper with permanent HTTPS URL (never store blob URL in storage!)
      settings.sceneMode = 'live';
      settings.liveWallpaper = Object.assign({}, wallpaper, {
        videoUrl: directVideoUrl,
        originalUrl: directVideoUrl
      });
      
      // Update theme accent to match if scene exists
      if (wallpaper.themeId && SCENES[wallpaper.themeId]) {
        settings.scene = wallpaper.themeId;
      }

      await solveAndSave();
      activate();

      // Update UI active states
      const allLiveButtons = document.querySelectorAll('#liveScenes .scene');
      allLiveButtons.forEach(btn => btn.setAttribute('aria-checked', 'false'));
      if (buttonEl) {
        buttonEl.setAttribute('aria-checked', 'true');
      }
      renderCredit();
    } catch (err) {
      console.warn('[LeetGlow Live] Failed to load live wallpaper:', err);
      note('Could not load live video. Please check your internet connection.', true);
    } finally {
      if (buttonEl) {
        buttonEl.classList.remove('is-loading');
      }
    }
  }

  async function pickScene(id) {
    if (id === 'custom' && !isPremium) {
      $('purchaseModal').showModal();
      return;
    }
    busy(true);
    try {
      justSet = null;
      settings.sceneMode = 'static';
      delete settings.staticWallpaper;
      delete settings.liveWallpaper;
      if (frame && frame.contentWindow && frame.contentWindow.LCTSPreview) {
        frame.contentWindow.LCTSPreview.setLiveVideo(null);
      }
      if (id === 'custom') settings.scene = 'custom';
      else {
        settings.scene = id;                        // remembered for "one scene" mode
        if (settings.arcs) { settings.arcScenes = Object.assign({}, settings.arcScenes, { [slot]: id }); justSet = id; }
      }
      await refresh();
      await solveAndSave();
      activate();
    } finally { busy(false); }
  }

  /* re-solve and redraw whatever the preview should show now */
  async function refresh() {
    await loadScene(viewId());
    solveNow();
    renderScenes();
    renderArcs();
    await showPreview();
  }

  /* ---- scenes by difficulty ------------------------------------------------------ */
  function renderArcs() {
    $('arcs').checked = settings.arcs;
    const box = $('arcSlots'), custom = settings.scene === 'custom';
    box.hidden = !settings.arcs || custom;
    const label = (SLOTS.find(([d]) => d === slot) || [])[1] || '';
    const n = $('arcNote');
    if (n) {
      n.classList.toggle('done', !!justSet);
      if (custom) n.textContent = 'Your picture is used for every difficulty.';
      else if (!settings.arcs) n.textContent = '';
      else if (justSet) n.textContent = `✓ ${label} problems now use ${SCENES[justSet].name}. Pick another slot to change it too.`;
      else n.innerHTML = `Choosing the scene for <b>${label}</b> problems. Pick a slot above to change another difficulty.`;
    }
    box.innerHTML = '';
    SLOTS.forEach(([d, label, jp]) => {
      const s = SCENES[arcScene(d)];
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'slot'; b.dataset.slot = d;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(d === slot));
      b.style.backgroundImage = `url("${chrome.runtime.getURL(s.thumb || s.wall)}")`;
      b.innerHTML = `<span class="slot-label"><b>${label}</b> <span class="jp">${jp}</span></span><span class="slot-name">${s.name}</span>`;
      if (justSet && d === slot) { b.classList.remove('pulse'); void b.offsetWidth; b.classList.add('pulse'); }
      b.addEventListener('click', async () => { slot = d; justSet = null; busy(true); try { await refresh(); } finally { busy(false); } });
      box.appendChild(b);
    });
  }

  function busy(on, text) {
    $('busy').hidden = !on;
    if (text) $('busy').lastChild.textContent = text;
  }

  function note(text, error) {
    const n = $('uploadNote');
    n.textContent = text;
    n.classList.toggle('error', !!error);
  }

  async function upload(file) {
    if (!isPremium) {
      $('purchaseModal').showModal();
      note('Custom picture backgrounds are a LeetGlow Premium feature.', true);
      return;
    }
    if (!/^image\//.test(file.type)) { note('That file is not an image.', true); return; }
    if (file.size > MAX_INPUT) { note('That image is over 30 MB. Try a smaller copy.', true); return; }
    busy(true, 'Preparing your picture…');
    try {
      const p = await Proc.prepare(file);
      const [wall, blur] = await Promise.all([Proc.blobToDataURL(p.wallBlob), Proc.blobToDataURL(p.blurBlob)]);
      const existingGal = (await chrome.storage.local.get('lcCustomGallery')).lcCustomGallery || [];
      const updatedGal = [{
        id: 'cg_' + Date.now(),
        name: file.name,
        wall,
        thumb: blur,
        blur,
        uploadedAt: Date.now()
      }, ...existingGal.filter(g => g.name !== file.name)].slice(0, 10);
      await chrome.storage.local.set({
        lcAnimeArt: { wall, blur, name: file.name },
        lcCustomGallery: updatedGal
      });
      preparedCache.custom = p;
      hasArt = true;
      customThumb = blur;
      settings.scene = 'custom';
      await refresh();
      await solveAndSave();
      activate();
      const soft = p.width < 1280 ? ' It is under 1280 px wide, so it may look soft on a large screen.' : '';
      note(`Ready: ${file.name}, ${Math.round(p.wallBlob.size / 1024)} KB.${soft}`);
    } catch (e) {
      note('That image could not be read. Try a PNG, JPEG or WebP.', true);
    } finally { busy(false); }
  }

  async function removeArt() {
    await chrome.storage.local.remove('lcAnimeArt');
    hasArt = false; customThumb = null;
    note('Your picture was removed from this browser.');
    delete preparedCache.custom;
    await pickScene(settings.scene === 'custom' ? DEF : settings.scene);
  }

  /* ---- theme on/off ---------------------------------------------------------- */
  function activate() { chrome.storage.local.set({ lcThemeStudio: 'anime' }); }
  function renderActive(themeId) {
    const on = (themeId || 'anime') === 'anime';   // nothing saved = fresh install = anime (content.js DEFAULT)
    $('activeState').textContent = on ? 'Active on LeetCode' : 'Not active on LeetCode';
    $('activeState').classList.toggle('on', on);
    $('activate').hidden = on;
  }
  $('activate').addEventListener('click', activate);
  const helpBtn = $('getHelpBtn') || $('bug');
  if (helpBtn) {
    if (globalThis.LCTSHelpButton) globalThis.LCTSHelpButton(helpBtn);
    else if (globalThis.LCTSBugButton) globalThis.LCTSBugButton(helpBtn);
  }

  /* ---- controls ---------------------------------------------------------------- */
  function renderGlass() {
    document.querySelectorAll('#glass button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === settings.glass)));
  }
  document.querySelectorAll('#glass button').forEach((b) => b.addEventListener('click', async () => {
    settings.glass = b.dataset.v;
    renderGlass();
    solveNow(); await showPreview(); solveAndSave();
  }));

  const vis = $('visibility');
  const showVis = () => { $('visibilityOut').textContent = Math.round(settings.visibility * 100); };
  let raf = 0;
  vis.addEventListener('input', () => {
    settings.visibility = vis.value / 100;
    showVis();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(async () => { solveNow(); await showPreview(); });
  });
  vis.addEventListener('change', () => solveAndSave());

  $('arcs').addEventListener('change', async () => {
    settings.arcs = $('arcs').checked;
    if (settings.arcs && settings.scene === 'custom') settings.scene = ARC.medium;
    busy(true);
    try { await refresh(); await solveAndSave(); } finally { busy(false); }
  });

  $('file').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) upload(f); e.target.value = ''; });

  ['titleCard', 'moments'].forEach((k) => $(k).addEventListener('change', () => { settings[k] = $(k).checked; save(); }));
  /* Japanese text: the stamps, the title card, the arc names here and the brand mark */
  const renderJapanese = () => {
    $('japanese').checked = settings.japanese;
    document.documentElement.toggleAttribute('data-no-jp', !settings.japanese);
  };
  $('japanese').addEventListener('change', () => { settings.japanese = $('japanese').checked; renderJapanese(); save(); });

  const renderSound = () => {
    $('sound').checked = settings.sound;
    $('volume').value = Math.round(settings.volume * 100);
    $('volumeOut').textContent = Math.round(settings.volume * 100);
    const soundBlock = $('soundControls');
    if (soundBlock) soundBlock.classList.toggle('off', !settings.sound);
    const vol = document.querySelector('.volume');
    if (vol) vol.classList.toggle('off', !settings.sound);
  };
  $('sound').addEventListener('change', () => { settings.sound = $('sound').checked; renderSound(); save(); });
  $('volume').addEventListener('input', () => { settings.volume = $('volume').value / 100; renderSound(); });
  /* on release, play a short sound at the new level so the choice can be heard */
  $('volume').addEventListener('change', () => {
    save();
    if (settings.sound) globalThis.LCTSSounds.play('run', { volume: settings.volume, theme: 'anime' });
  });

  document.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', async () => {
    const frameBox = document.getElementById('frameBox');
    if (frameBox) {
      const rect = frameBox.getBoundingClientRect();
      const targetTop = 76;
      if (rect.top < targetTop - 5 || rect.bottom < 200) {
        window.scrollTo({
          top: Math.max(0, window.scrollY + rect.top - targetTop),
          behavior: 'smooth'
        });
      }
    }

    await frameReady;
    const w = frame.contentWindow, name = b.dataset.play;
    w.LCTSMoments.setJapanese(settings.japanese);
    if (name === 'title') w.LCTSMoments.titleCard({ number: '1', title: 'Two Sum', difficulty: 'Easy' });
    else if (name === 'wa-submit') w.LCTSMoments.result('wa', { action: 'submit' });
    else w.LCTSMoments.result(name, name === 'ac' ? { beats: '92.4', action: 'submit' } : { action: 'run' });
    if (settings.sound) globalThis.LCTSSounds.play(name, { volume: settings.volume, theme: 'anime' });
  }));

  $('focus').addEventListener('change', async () => {
    const on = $('focus').checked;
    chrome.storage.local.set({ lcFocus: on });
    await frameReady;
    frame.contentWindow.LCTSPreview.focus(on);
  });
  /* Firefox opens its own shortcut page (it refuses chrome:// and about: URLs from tabs.create) */
  $('shortcuts').addEventListener('click', () => {
    if (chrome.commands && chrome.commands.openShortcutSettings) chrome.commands.openShortcutSettings();
    else chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
  });

  /* ---- boot --------------------------------------------------------------------- */
  (async () => {
    const res = await chrome.storage.local.get(['lcAnime', 'lcAnimeArt', 'lcThemeStudio', 'lcFocus', 'lcLastDifficulty']);
    if (SLOTS.some(([d]) => d === res.lcLastDifficulty)) slot = res.lcLastDifficulty;
    const A = res.lcAnime;
    Object.assign(settings, A ? {
      scene: A.scene || DEF,
      sceneMode: A.sceneMode || 'static',
      liveWallpaper: A.liveWallpaper || null,
      /* someone who picked one scene before arcs existed keeps it */
      arcs: A.arcs !== undefined ? !!A.arcs : !A.scene,
      arcScenes: A.arcScenes || {},
      glass: A.glass || 'auto',
      visibility: typeof res.lcAnime.visibility === 'number' ? res.lcAnime.visibility : 0.85,
      titleCard: res.lcAnime.titleCard !== false, moments: res.lcAnime.moments !== false,
      japanese: res.lcAnime.japanese !== false,
      sound: res.lcAnime.sound !== false,
      volume: typeof res.lcAnime.volume === 'number' ? res.lcAnime.volume : 1
    } : { sceneMode: 'static' });
    hasArt = !!res.lcAnimeArt;
    customThumb = hasArt ? res.lcAnimeArt.blur : null;
    if (settings.scene === 'custom' && !hasArt) settings.scene = DEF;

    // Auto-repair any stale blob: URLs that may have been saved by legacy code
    if (settings.liveWallpaper && settings.liveWallpaper.videoUrl && settings.liveWallpaper.videoUrl.startsWith('blob:')) {
      if (settings.liveWallpaper.originalUrl) {
        settings.liveWallpaper.videoUrl = settings.liveWallpaper.originalUrl;
      } else if (settings.liveWallpaper.id && settings.liveWallpaper.id.startsWith('supabase-')) {
        const baseName = settings.liveWallpaper.id.replace('supabase-', '');
        const sbBase = (globalThis.LEETGLOW_CONFIG && globalThis.LEETGLOW_CONFIG.SUPABASE_URL) || '';
        if (sbBase) {
          settings.liveWallpaper.videoUrl = `${sbBase}/storage/v1/object/public/livewallpaper/${baseName}.mov`;
        }
      }
      save();
    }

    vis.value = Math.round(settings.visibility * 100); showVis();
    renderGlass();
    $('titleCard').checked = settings.titleCard;
    $('moments').checked = settings.moments;
    renderJapanese();
    renderSound();
    const sh = (await chrome.storage.local.get('lcShare')).lcShare;
    $('share').checked = !(sh && sh.enabled === false);
    $('share').addEventListener('change', () => chrome.storage.local.set({ lcShare: { enabled: $('share').checked } }));
    $('focus').checked = !!res.lcFocus;
    renderActive(res.lcThemeStudio);

    try {
      const cmds = await chrome.commands.getAll();
      const c = cmds.find((x) => x.name === 'toggle-focus');
      $('shortcut').textContent = c && c.shortcut
        ? c.shortcut.replace('Period', '.').replace('Comma', ',')
        : 'not set';
    } catch (e) {}

    /* the anime recordings (audio/anime/) decode now, so the play buttons
       sound exactly like LeetCode will */
    globalThis.LCTSSounds.warm('anime');

    // Initialize Server-Verified Premium System
    if (typeof initPremiumSystem === 'function') {
      await initPremiumSystem();
    }

    // Static vs Live wallpaper mode toggles
    function updateSceneModeUI(mode) {
      const isLive = mode === 'live';
      if ($('tabStatic')) {
        $('tabStatic').classList.toggle('active', !isLive);
        $('tabStatic').setAttribute('aria-checked', String(!isLive));
      }
      if ($('tabLive')) {
        $('tabLive').classList.toggle('active', isLive);
        $('tabLive').setAttribute('aria-checked', String(isLive));
      }
      if ($('staticScenesWrap')) $('staticScenesWrap').hidden = isLive;
      if ($('liveScenesWrap')) $('liveScenesWrap').hidden = !isLive;
      if (isLive) {
        renderLiveWallpapers();
      }
    }

    if ($('tabStatic')) {
      $('tabStatic').addEventListener('click', () => {
        settings.sceneMode = 'static';
        updateSceneModeUI('static');
        if (frame && frame.contentWindow && frame.contentWindow.LCTSPreview) {
          frame.contentWindow.LCTSPreview.setLiveVideo(null);
        }
        renderCredit();
        save();
      });
    }

    if ($('tabLive')) {
      $('tabLive').addEventListener('click', () => {
        settings.sceneMode = 'live';
        updateSceneModeUI('live');
        if (settings.liveWallpaper && settings.liveWallpaper.videoUrl) {
          if (frame && frame.contentWindow && frame.contentWindow.LCTSPreview) {
            frame.contentWindow.LCTSPreview.setLiveVideo(settings.liveWallpaper.videoUrl);
          }
        }
        renderCredit();
        save();
      });
    }

    const refreshLiveBtn = $('refreshLiveWallpapersBtn');
    if (refreshLiveBtn) {
      refreshLiveBtn.addEventListener('click', async () => {
        refreshLiveBtn.classList.add('spinning');
        liveWallpapersList = [];
        await renderLiveWallpapers();
        setTimeout(() => refreshLiveBtn.classList.remove('spinning'), 600);
      });
    }

    updateSceneModeUI(settings.sceneMode || 'static');

    busy(true, 'Loading scene…');
    try {
      await refresh();
      await solveAll();
      if (res.lcFocus) frame.contentWindow.LCTSPreview.focus(true);
    } finally { busy(false); }
  })();

  /* ---- Premium System Integration -------------------------------------------- */
  async function initPremiumSystem() {
    const Premium = globalThis.LeetGlowPremium;
    if (!Premium) return;

    const badge = $('premiumBadge');
    const getPremiumBtn = $('getPremiumBtn');
    const activateBtn = $('activatePremiumBtn');

    // Modals & Multi-Step Elements
    const purchaseModal = $('purchaseModal');
    const closePurchaseModal = $('closePurchaseModal');

    // Step 1: Credentials
    const credentialsForm = $('credentialsForm');
    const custName = $('custName');
    const custEmail = $('custEmail');
    const custPhone = $('custPhone');
    const credentialsError = $('credentialsError');

    // Step 2: Payment
    const previewName = $('previewName');
    const previewEmail = $('previewEmail');
    const previewPhone = $('previewPhone');
    const editCredentialsBtn = $('editCredentialsBtn');
    const backToStep1Btn = $('backToStep1Btn');
    const payBtn = $('payBtn');
    const paymentError = $('paymentError');

    // Step 3: Confirmation
    const successEmail = $('successEmail');
    const issuedKey = $('issuedKey');
    const copyKeyBtn = $('copyKeyBtn');
    const donePurchaseBtn = $('donePurchaseBtn');

    // Activation Modal
    const activationModal = $('activationModal');
    const closeActivationModal = $('closeActivationModal');
    const activationForm = $('activationForm');
    const licenseKeyInput = $('licenseKeyInput');
    const activationError = $('activationError');
    const activationSuccess = $('activationSuccess');
    const submitKeyBtn = $('submitKeyBtn');

    // Stepper State Controller
    function setCheckoutStep(step) {
      const s1 = $('stepIndicator1');
      const s2 = $('stepIndicator2');
      const s3 = $('stepIndicator3');
      const l1 = $('stepLine1');
      const l2 = $('stepLine2');

      const p1 = $('step1Credentials');
      const p2 = $('step2Payment');
      const p3 = $('step3Confirmation');

      if (step === 1) {
        if (s1) { s1.className = 'step-node active'; const n = s1.querySelector('.step-num'); if (n) n.textContent = '1'; }
        if (s2) { s2.className = 'step-node'; const n = s2.querySelector('.step-num'); if (n) n.textContent = '2'; }
        if (s3) { s3.className = 'step-node'; const n = s3.querySelector('.step-num'); if (n) n.textContent = '3'; }
        if (l1) l1.className = 'step-divider';
        if (l2) l2.className = 'step-divider';

        if (p1) p1.hidden = false;
        if (p2) p2.hidden = true;
        if (p3) p3.hidden = true;
      } else if (step === 2) {
        if (s1) { s1.className = 'step-node completed'; const n = s1.querySelector('.step-num'); if (n) n.textContent = '✓'; }
        if (s2) { s2.className = 'step-node active'; const n = s2.querySelector('.step-num'); if (n) n.textContent = '2'; }
        if (s3) { s3.className = 'step-node'; const n = s3.querySelector('.step-num'); if (n) n.textContent = '3'; }
        if (l1) l1.className = 'step-divider completed';
        if (l2) l2.className = 'step-divider';

        if (p1) p1.hidden = true;
        if (p2) p2.hidden = false;
        if (p3) p3.hidden = true;
      } else if (step === 3) {
        if (s1) { s1.className = 'step-node completed'; const n = s1.querySelector('.step-num'); if (n) n.textContent = '✓'; }
        if (s2) { s2.className = 'step-node completed'; const n = s2.querySelector('.step-num'); if (n) n.textContent = '✓'; }
        if (s3) { s3.className = 'step-node active completed'; const n = s3.querySelector('.step-num'); if (n) n.textContent = '✓'; }
        if (l1) l1.className = 'step-divider completed';
        if (l2) l2.className = 'step-divider completed';

        if (p1) p1.hidden = true;
        if (p2) p2.hidden = true;
        if (p3) p3.hidden = false;
      }
    }

    // Comparison CTA & Pill
    const compUpgradeBtn = $('comparisonUpgradeBtn');
    const compActivePill = $('comparisonActivePill');

    // 1. Initial server-verified entitlement check
    const status = await Premium.checkServerEntitlement();
    isPremium = !!(status && status.active);
    Premium.updateBadge(badge, isPremium, status.key_prefix);
    if (isPremium && getPremiumBtn) {
      getPremiumBtn.hidden = true;
    }

    if (compUpgradeBtn) {
      compUpgradeBtn.hidden = isPremium;
      compUpgradeBtn.onclick = () => {
        if (getPremiumBtn) {
          getPremiumBtn.click();
        } else {
          if (credentialsForm) credentialsForm.reset();
          if (credentialsError) credentialsError.hidden = true;
          if (paymentError) paymentError.hidden = true;
          if (payBtn) {
            payBtn.disabled = false;
            payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
          }
          setCheckoutStep(1);
          purchaseModal.showModal();
          if (custName) custName.focus();
        }
      };
    }
    if (compActivePill) {
      compActivePill.hidden = !isPremium;
    }

    // When premium is inactive, ensure only Golden Hour is active
    if (!isPremium && settings.scene !== 'golden-hour') {
      settings.scene = 'golden-hour';
      if (settings.arcs) {
        settings.arcScenes = { easy: 'golden-hour', medium: 'golden-hour', hard: 'golden-hour' };
      }
    }

    // Allow clicking on Basic Plan badge to open upgrade modal
    if (badge) {
      badge.addEventListener('click', () => {
        if (!isPremium) {
          if (getPremiumBtn) getPremiumBtn.click();
          else purchaseModal.showModal();
        }
      });
    }

    // 2. Open Purchase Modal (Starts at Step 1: Credentials)
    if (getPremiumBtn) {
      getPremiumBtn.addEventListener('click', () => {
        if (credentialsForm) credentialsForm.reset();
        if (credentialsError) credentialsError.hidden = true;
        if (paymentError) paymentError.hidden = true;
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
        }
        setCheckoutStep(1);
        purchaseModal.showModal();
        if (custName) custName.focus();
      });
    }

    if (closePurchaseModal) {
      closePurchaseModal.addEventListener('click', () => purchaseModal.close());
    }

    // Step 1: Validate Credentials & Advance to Step 2
    if (credentialsForm) {
      credentialsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (credentialsError) credentialsError.hidden = true;

        const name = custName ? custName.value.trim() : '';
        const email = custEmail ? custEmail.value.trim() : '';
        const phone = custPhone ? custPhone.value.trim() : '';

        if (!name || !email || !phone) {
          if (credentialsError) {
            credentialsError.textContent = 'Please fill out all fields.';
            credentialsError.hidden = false;
          }
          return;
        }

        if (phone.length < 10) {
          if (credentialsError) {
            credentialsError.textContent = 'Please enter a valid 10-digit phone number.';
            credentialsError.hidden = false;
          }
          return;
        }

        // Populate Step 2 preview
        if (previewName) previewName.textContent = name;
        if (previewEmail) previewEmail.textContent = email;
        if (previewPhone) previewPhone.textContent = '+91 ' + phone;

        // Advance to Step 2 (Payment)
        setCheckoutStep(2);
      });
    }

    // Step 2: Back to Step 1
    if (editCredentialsBtn) {
      editCredentialsBtn.addEventListener('click', () => setCheckoutStep(1));
    }
    if (backToStep1Btn) {
      backToStep1Btn.addEventListener('click', () => setCheckoutStep(1));
    }

    // Step 2: Handle Razorpay Checkout Submission
    if (payBtn) {
      payBtn.addEventListener('click', async () => {
        if (paymentError) {
          paymentError.hidden = true;
          paymentError.textContent = '';
        }

        const name = custName ? custName.value.trim() : '';
        const email = custEmail ? custEmail.value.trim() : '';
        const phone = custPhone ? custPhone.value.trim() : '';

        if (!name || !email || !phone) {
          setCheckoutStep(1);
          return;
        }

        payBtn.disabled = true;
        payBtn.innerHTML = '<span>Opening Razorpay Checkout…</span>';

        const config = Premium.CONFIG;
        const isLiveKey = config.RAZORPAY_KEY_ID && !config.RAZORPAY_KEY_ID.includes('PLACEHOLDER');

        if (window.Razorpay && isLiveKey) {
          try {
            const rzp = new window.Razorpay({
              key: config.RAZORPAY_KEY_ID,
              amount: config.PRODUCT_PRICE_PAISE,
              currency: config.CURRENCY || 'INR',
              name: config.PRODUCT_NAME || 'LeetGlow Premium',
              description: 'Lifetime Access to All Themes & Anime Scenes',
              image: '../icons/icon128.png',
              prefill: { name, email, contact: phone },
              theme: { color: '#0f172a' },
              handler: async function (response) {
                payBtn.innerHTML = '<span>Verifying payment with server…</span>';
                const result = await Premium.recordPaymentAndIssueKey({
                  name, email, phone,
                  orderId: response.razorpay_order_id || ('ord_' + Date.now()),
                  paymentId: response.razorpay_payment_id
                });
                onPaymentSuccess(result, email);
              },
              modal: {
                ondismiss: function () {
                  payBtn.disabled = false;
                  payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
                }
              }
            });
            rzp.on('payment.failed', function (resp) {
              if (paymentError) {
                paymentError.textContent = resp.error ? resp.error.description : 'Payment failed. Please try again.';
                paymentError.hidden = false;
              }
              payBtn.disabled = false;
              payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
            });
            rzp.open();
          } catch (err) {
            if (paymentError) {
              paymentError.textContent = err.message || 'Could not open Razorpay checkout.';
              paymentError.hidden = false;
            }
            payBtn.disabled = false;
            payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
          }
        } else {
          // Seamless server-side fulfillment & key issuance (test/dev mode)
          payBtn.innerHTML = '<span>Processing payment & issuing key…</span>';
          setTimeout(async () => {
            const testOrderId = 'ord_live_' + Math.random().toString(36).slice(2, 10);
            const testPayId = 'pay_live_' + Math.random().toString(36).slice(2, 10);
            const result = await Premium.recordPaymentAndIssueKey({
              name, email, phone,
              orderId: testOrderId,
              paymentId: testPayId
            });
            onPaymentSuccess(result, email);
          }, 800);
        }
      });
    }

    function onPaymentSuccess(result, email) {
      if (result && result.success && result.active) {
        isPremium = true;
        setCheckoutStep(3);
        if (successEmail) successEmail.textContent = result.email || email;
        if (issuedKey) issuedKey.textContent = result.key;
        Premium.updateBadge(badge, true, result.key_prefix);
        if (getPremiumBtn) getPremiumBtn.hidden = true;
        if (compUpgradeBtn) compUpgradeBtn.hidden = true;
        if (compActivePill) compActivePill.hidden = false;
        renderScenes();
        renderArcs();
      } else {
        if (paymentError) {
          paymentError.textContent = result ? (result.error || result.message) : 'Server verification failed.';
          paymentError.hidden = false;
        }
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
        }
      }
    }

    // Step 3: Copy Key & Finish
    if (copyKeyBtn) {
      copyKeyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(issuedKey ? issuedKey.textContent : '').then(() => {
          copyKeyBtn.textContent = 'Copied!';
          setTimeout(() => { copyKeyBtn.textContent = 'Copy Key'; }, 2000);
        });
      });
    }

    if (donePurchaseBtn) {
      donePurchaseBtn.addEventListener('click', () => {
        purchaseModal.close();
      });
    }

    // 4. Open Activation Modal
    if (activateBtn) {
      activateBtn.addEventListener('click', () => {
        activationForm.reset();
        activationError.hidden = true;
        activationSuccess.hidden = true;
        submitKeyBtn.disabled = false;
        submitKeyBtn.innerHTML = '<span>Verify & Activate</span>';
        activationModal.showModal();
        licenseKeyInput.focus();
      });
    }

    if (closeActivationModal) {
      closeActivationModal.addEventListener('click', () => activationModal.close());
    }

    // Auto-hyphenate key: LG-XXXX-XXXX-XXXX
    if (licenseKeyInput) {
      licenseKeyInput.addEventListener('input', (e) => {
        let val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!val.startsWith('LG') && val.length >= 2) val = 'LG' + val;
        let parts = [];
        if (val.length > 0) parts.push(val.slice(0, 2));
        if (val.length > 2) parts.push(val.slice(2, 6));
        if (val.length > 6) parts.push(val.slice(6, 10));
        if (val.length > 10) parts.push(val.slice(10, 14));
        e.target.value = parts.join('-');
      });
    }

    // Handle Activation Submission
    if (activationForm) {
      activationForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        activationError.hidden = true;
        activationSuccess.hidden = true;

        const rawKey = licenseKeyInput.value.trim();
        if (!rawKey) return;

        submitKeyBtn.disabled = true;
        submitKeyBtn.innerHTML = '<span>Verifying key with server…</span>';

        const res = await Premium.activateKey(rawKey);
        if (res.success && res.active) {
          isPremium = true;
          activationSuccess.textContent = res.message || 'Key activated successfully! Premium is now active.';
          activationSuccess.hidden = false;
          submitKeyBtn.innerHTML = '<span>Activated ✓</span>';
          Premium.updateBadge(badge, true, res.key_prefix);
          if (getPremiumBtn) getPremiumBtn.hidden = true;
          if (compUpgradeBtn) compUpgradeBtn.hidden = true;
          if (compActivePill) compActivePill.hidden = false;
          renderScenes();
          renderArcs();
          setTimeout(() => {
            activationModal.close();
          }, 1800);
        } else {
          activationError.textContent = res.error || 'Invalid license key. Please check and try again.';
          activationError.hidden = false;
          submitKeyBtn.disabled = false;
          submitKeyBtn.innerHTML = '<span>Verify & Activate</span>';
        }
      });
    }

    if (window.location.hash === '#upgrade' || window.location.search.includes('upgrade')) {
      if (!isPremium && purchaseModal) purchaseModal.showModal();
    } else if (window.location.hash === '#activate' || window.location.search.includes('activate')) {
      if (!isPremium && activationModal) activationModal.showModal();
    }
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.lcThemeStudio) renderActive(ch.lcThemeStudio.newValue);
    if (ch.lcFocus) $('focus').checked = !!ch.lcFocus.newValue;
    if (ch.lcShare) $('share').checked = !(ch.lcShare.newValue && ch.lcShare.newValue.enabled === false);
    if (ch.leetglowPremium && typeof LeetGlowPremium !== 'undefined') {
      const active = !!ch.leetglowPremium.newValue?.active;
      isPremium = active;
      const badge = $('premiumBadge');
      LeetGlowPremium.updateBadge(badge, active, ch.leetglowPremium.newValue?.key_prefix);
      const getPremiumBtn = $('getPremiumBtn');
      if (getPremiumBtn) {
        getPremiumBtn.hidden = active;
      }
      const compUpgradeBtn = $('comparisonUpgradeBtn');
      if (compUpgradeBtn) compUpgradeBtn.hidden = active;
      const compActivePill = $('comparisonActivePill');
      if (compActivePill) compActivePill.hidden = !active;
      renderScenes();
      renderArcs();
    }
  });
})();
