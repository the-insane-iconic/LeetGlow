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
                     containerTransparency: 30,
                     titleCard: true, moments: true, japanese: true, sound: true, volume: 1 };
  const getCustomAlpha = () => {
    const ct = typeof settings.containerTransparency === 'number' ? settings.containerTransparency : 30;
    return {
      panel: Math.max(0, Math.min(1, 1 - ct / 100))
    };
  };
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
  let isPremium = true;
  let isFreeBeta = true;

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
    frame.contentWindow.LCTSPreview.apply(theme, previewUrls, getCustomAlpha());
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
      lcAnime: Object.assign({}, settings, { themes, theme, themeFor: viewId() }),
      lcContainerTrans: settings.containerTransparency
    });
    if (immediate) write(); else saveTimer = setTimeout(write, 220);
  }

  /* ---- scene tiles ---------------------------------------------------------------- */
  /* ---- Hero Card, Upload Card & Difficulty Mapping ----------------------------- */
  let lastRenderedState = null;

  function updateHeroCard() {
    const heroCard = $('heroSceneCard');
    const heroTitle = $('heroSceneTitle');
    const heroSlotTag = $('heroSlotTag');
    const heroDescTag = $('heroDescTag');
    if (!heroCard || !heroTitle) return;

    const currentViewId = viewId();
    const slotItem = SLOTS.find(([d]) => d === slot) || ['medium', 'Medium'];
    const slotLabel = slotItem[1];

    if (settings.sceneMode === 'live' && settings.liveWallpaper) {
      heroTitle.textContent = settings.liveWallpaper.name || 'Dynamic Wallpaper';
      if (heroSlotTag) heroSlotTag.textContent = 'Dynamic';
      if (heroDescTag) heroDescTag.textContent = settings.liveWallpaper.desc ? settings.liveWallpaper.desc.split('·')[0].trim() : 'Looping Video';
      const thumb = settings.liveWallpaper.thumbUrl || settings.liveWallpaper.imageUrl || '';
      if (thumb) heroCard.style.backgroundImage = `url("${thumb}")`;
      return;
    }

    if (currentViewId === 'custom') {
      heroTitle.textContent = hasArt ? 'Your Picture' : 'Custom Image';
      if (heroSlotTag) heroSlotTag.textContent = slotLabel;
      if (heroDescTag) heroDescTag.textContent = 'Custom Wallpaper';
      if (customThumb) heroCard.style.backgroundImage = `url("${customThumb}")`;
      return;
    }

    const s = SCENES[currentViewId] || SCENES[DEF];
    if (s) {
      heroTitle.textContent = s.name;
      if (heroSlotTag) heroSlotTag.textContent = slotLabel;
      if (heroDescTag) {
        const parts = s.desc ? s.desc.split(',') : [];
        heroDescTag.textContent = parts.length > 0 ? parts[0].trim() : 'Anime Scene';
      }
      heroCard.style.backgroundImage = `url("${chrome.runtime.getURL(s.thumb || s.wall)}")`;
    }
  }

  function updateUploadButton() {
    const btn = $('uploadCustomBtn');
    if (!btn) return;
    const isCustomActive = settings.sceneMode !== 'live' && settings.scene === 'custom';
    btn.classList.toggle('is-active', isCustomActive);

    const titleEl = $('uploadCustomTitle');
    const subEl = $('uploadCustomSub');
    const removeBtn = $('customRemoveBtn');
    const proBadge = $('uploadProBadge');

    if (proBadge) proBadge.hidden = isPremium || isFreeBeta;

    if (hasArt) {
      if (titleEl) titleEl.textContent = 'Your picture';
      if (subEl) subEl.textContent = isCustomActive ? 'Currently active' : 'Click to use your picture';
      if (removeBtn) removeBtn.hidden = false;
      if (customThumb) {
        btn.style.backgroundImage = `linear-gradient(to right, rgba(255,255,255,0.92) 30%, rgba(255,255,255,0.65) 100%), url("${customThumb}")`;
        btn.style.backgroundSize = 'cover';
        btn.style.backgroundPosition = 'center';
      }
    } else {
      if (titleEl) titleEl.textContent = 'Upload custom image';
      if (subEl) subEl.textContent = 'JPG, PNG, WebP · up to 30 MB';
      if (removeBtn) removeBtn.hidden = true;
      btn.style.backgroundImage = '';
    }
  }

  function renderDifficultyTabs() {
    const tabs = document.querySelectorAll('.diff-tab');
    const indicator = $('diffTabIndicator');
    let activeTabEl = null;

    tabs.forEach(tab => {
      const isCurrent = tab.dataset.slot === slot;
      tab.classList.toggle('active', isCurrent);
      tab.setAttribute('aria-selected', String(isCurrent));
      if (isCurrent) activeTabEl = tab;
    });

    if (indicator && activeTabEl) {
      indicator.style.left = `${activeTabEl.offsetLeft}px`;
      indicator.style.width = `${activeTabEl.offsetWidth}px`;
    }
  }

  function updateSceneSelection() {
    const box = $('scenes');
    if (!box) return;
    const isLive = settings.sceneMode === 'live';
    const currentId = viewId();
    const isCustom = !isLive && settings.scene === 'custom';
    box.querySelectorAll('.scene').forEach((btn) => {
      if (isLive) {
        btn.setAttribute('aria-checked', 'false');
      } else if (btn.dataset.sceneId) {
        btn.setAttribute('aria-checked', String(!isCustom && btn.dataset.sceneId === currentId));
      }
    });
    updateHeroCard();
    updateUploadButton();
    renderCredit();
  }

  function renderScenes(force = false) {
    const box = $('scenes');
    if (!box) return;

    const stateMatches = lastRenderedState &&
      lastRenderedState.isPremium === isPremium &&
      lastRenderedState.isFreeBeta === isFreeBeta;

    if (!force && box.children.length > 0 && stateMatches) {
      updateSceneSelection();
      return;
    }

    const prevScrollTop = box.scrollTop;
    box.innerHTML = '';
    const presets = document.createDocumentFragment();
    Object.entries(SCENES).forEach(([id, s]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene';
      b.dataset.sceneId = id;
      b.setAttribute('role', 'radio');
      const isSelected = settings.sceneMode !== 'live' && settings.scene !== 'custom' && viewId() === id;
      b.setAttribute('aria-checked', String(isSelected));
      b.style.backgroundImage = `url("${chrome.runtime.getURL(s.thumb || s.wall)}")`;

      // Basic free tier scenes vs full unlock in free beta
      const BASIC_SCENES = new Set(['golden-hour', 'moon-field', 'harvest-moon']);
      const isLocked = !isPremium && !isFreeBeta && !BASIC_SCENES.has(id);
      if (isLocked) {
        b.classList.add('is-locked');
      }

      const proBadgeHTML = isLocked
        ? `<span class="pro-pill on-tile" aria-label="PRO wallpaper">PRO</span>`
        : '';
      const checkedBadgeHTML = `<span class="scene-checked-badge" aria-hidden="true"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3.5 8.5l3 3 6-6"/></svg></span>`;

      b.innerHTML = `${checkedBadgeHTML}${proBadgeHTML}<span class="name">${s.name}</span>`;
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

    // Render static wallpapers from Supabase bucket (e.g. static_... files or uploaded static images)
    const bucketStaticWallpapers = (liveWallpapersList || []).filter(w => !w.isLive);
    bucketStaticWallpapers.forEach(w => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene bucket-static';
      b.dataset.sceneId = w.id;
      b.setAttribute('role', 'radio');
      const isSelected = settings.sceneMode === 'static' && (settings.scene === w.id || (settings.staticWallpaper && settings.staticWallpaper.id === w.id));
      b.setAttribute('aria-checked', String(isSelected));
      const thumbUrl = w.thumbUrl || w.imageUrl;
      if (thumbUrl) b.style.backgroundImage = `url("${thumbUrl}")`;

      const isLocked = !isPremium && !isFreeBeta && w.isPro;
      if (isLocked) b.classList.add('is-locked');

      const proBadgeHTML = isLocked ? `<span class="pro-pill on-tile" aria-label="PRO wallpaper">PRO</span>` : '';
      const checkedBadgeHTML = `<span class="scene-checked-badge" aria-hidden="true"><svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3.5 8.5l3 3 6-6"/></svg></span>`;

      b.innerHTML = `${checkedBadgeHTML}${proBadgeHTML}<span class="name">${w.name}</span>`;
      b.title = isLocked ? `${w.name} (PRO Wallpaper — Click to unlock)` : `${w.name}: Static Wallpaper`;

      b.addEventListener('click', async () => {
        if (isLocked) {
          $('purchaseModal').showModal();
        } else {
          await pickBucketStaticWallpaper(w, b);
        }
      });
      presets.appendChild(b);
    });

    box.appendChild(presets);

    // Keep scroll position stable when re-rendering
    if (prevScrollTop > 0) {
      box.scrollTop = prevScrollTop;
    }

    lastRenderedState = {
      isPremium,
      isFreeBeta
    };

    updateHeroCard();
    updateUploadButton();
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
    box.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 24px; font-size: 13px; color: var(--muted);"><span class="scene-spinner" style="display:inline-block; position:relative; top:3px; margin-right:8px;"></span>Syncing dynamic wallpapers from Supabase…</div>';

    if (!liveWallpapersList.length && globalThis.LCTSLiveWallpapers) {
      liveWallpapersList = await globalThis.LCTSLiveWallpapers.getAll();
      // Ensure static container is updated with any static bucket wallpapers
      renderScenes(true);
    }

    box.innerHTML = '';
    const activeLiveId = settings.liveWallpaper ? settings.liveWallpaper.id : null;

    // Filter to dynamic wallpapers only
    const dynamicList = (liveWallpapersList || []).filter(w => w.isLive);

    if (!dynamicList.length) {
      box.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 24px; font-size: 13px; color: var(--muted);">No dynamic wallpapers found in bucket. Upload MP4/WebM videos or images with <code>dynamic_</code> prefix to Supabase to see them here!</div>';
      return;
    }

    dynamicList.forEach(w => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scene live-item';
      b.setAttribute('role', 'radio');
      const isSelected = (settings.sceneMode === 'live' && activeLiveId === w.id);
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

      // Lock status (pro in filename = PRO for premium users only; bypassed in free beta)
      const isLocked = !isPremium && !isFreeBeta && w.isPro;
      if (isLocked) {
        b.classList.add('is-locked');
      }

      const proBadgeHTML = isLocked
        ? `<span class="pro-pill on-tile" aria-label="PRO wallpaper">PRO</span>`
        : '';
      const liveBadgeHTML = `<span class="live-badge"><span class="live-pulse-dot"></span> LIVE</span>`;
      const spinnerHTML = `<span class="scene-spinner" title="Loading video..."></span>`;

      b.innerHTML = `
        ${liveBadgeHTML}
        ${proBadgeHTML}
        ${spinnerHTML}
        <span class="name">${w.name}</span>
      `;
      b.title = isLocked
        ? `${w.name} (PRO Wallpaper — Click to unlock)`
        : `${w.name}: Dynamic Wallpaper`;

      b.addEventListener('click', async () => {
        if (isLocked) {
          $('purchaseModal').showModal();
          return;
        }
        await pickLiveWallpaper(w, b);
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
      frame.contentWindow.LCTSPreview.apply(settings.theme || SCENES[DEF].theme, urls, getCustomAlpha());
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
    if (id === 'custom' && !isPremium && !isFreeBeta) {
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
    if (!liveWallpapersList.length && globalThis.LCTSLiveWallpapers && globalThis.LCTSLiveWallpapers.getAll) {
      globalThis.LCTSLiveWallpapers.getAll().then(list => {
        liveWallpapersList = list || [];
        renderScenes(true);
      }).catch(() => {});
    }
    renderScenes();
    renderArcs();
    await showPreview();
  }

  /* ---- scenes by difficulty ------------------------------------------------------ */
  function renderArcs() {
    if ($('arcs')) $('arcs').checked = settings.arcs;
    const custom = settings.scene === 'custom';
    const label = (SLOTS.find(([d]) => d === slot) || [])[1] || '';
    const n = $('arcNote');
    if (n) {
      n.classList.toggle('done', !!justSet);
      if (custom) n.textContent = 'Your picture is used for every difficulty.';
      else if (!settings.arcs) n.textContent = 'Single scene mode: chosen scene is used for all problems.';
      else if (justSet) n.textContent = `✓ ${label} problems now use ${SCENES[justSet] ? SCENES[justSet].name : justSet}.`;
      else n.innerHTML = `Choosing the scene for <b>${label}</b> problems. Pick a tab above to switch difficulty.`;
    }
    renderDifficultyTabs();
    updateHeroCard();
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
    if (!isPremium && !isFreeBeta) {
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

  const cTrans = $('containerTrans');
  const showCTrans = () => {
    const out = $('containerTransOut');
    if (out) out.textContent = Math.round(settings.containerTransparency) + '%';
  };
  if (cTrans) {
    cTrans.addEventListener('input', () => {
      settings.containerTransparency = Number(cTrans.value);
      showCTrans();
      showPreview();
      save();
    });
  }

  if ($('arcs')) {
    $('arcs').addEventListener('change', async () => {
      settings.arcs = $('arcs').checked;
      if (settings.arcs && settings.scene === 'custom') settings.scene = ARC.medium;
      busy(true);
      try { await refresh(); await solveAndSave(); } finally { busy(false); }
    });
  }

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
    const res = await chrome.storage.local.get(['lcAnime', 'lcAnimeArt', 'lcThemeStudio', 'lcFocus', 'lcLastDifficulty', 'lcContainerTrans']);
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
      containerTransparency: typeof res.lcContainerTrans === 'number' ? res.lcContainerTrans
        : (typeof res.lcAnime.containerTransparency === 'number' ? res.lcAnime.containerTransparency : 30),
      titleCard: res.lcAnime.titleCard !== false, moments: res.lcAnime.moments !== false,
      japanese: res.lcAnime.japanese !== false,
      sound: res.lcAnime.sound !== false,
      volume: typeof res.lcAnime.volume === 'number' ? res.lcAnime.volume : 1
    } : { sceneMode: 'static', containerTransparency: typeof res.lcContainerTrans === 'number' ? res.lcContainerTrans : 30 });
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
    if (cTrans) { cTrans.value = Math.round(settings.containerTransparency); showCTrans(); }
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

    // Static vs Dynamic wallpaper mode toggles (replaces search bar & old header toggle)
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
      if ($('difficultyTabsWrap')) $('difficultyTabsWrap').hidden = isLive;
      if (isLive) {
        renderLiveWallpapers();
      }
      updateHeroCard();
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
      refreshLiveBtn.addEventListener('click', async (e) => {
        if (e) e.stopPropagation();
        refreshLiveBtn.classList.add('spinning');
        liveWallpapersList = [];
        if (settings.sceneMode !== 'live') {
          updateSceneModeUI('live');
        }
        await renderLiveWallpapers();
        setTimeout(() => refreshLiveBtn.classList.remove('spinning'), 600);
      });
    }

    // Difficulty Tabs: Easy | Medium | Hard (Image 2)
    document.querySelectorAll('.diff-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        const newSlot = tab.dataset.slot;
        if (newSlot === slot) return;
        slot = newSlot;
        justSet = null;
        busy(true);
        try {
          await refresh();
        } finally {
          busy(false);
        }
      });
    });
    window.addEventListener('resize', renderDifficultyTabs);

    // Dedicated Upload Custom Image Button
    const upBtn = $('uploadCustomBtn');
    if (upBtn) {
      upBtn.addEventListener('click', () => {
        if (!isPremium && !isFreeBeta) {
          $('purchaseModal').showModal();
          return;
        }
        if (hasArt && settings.scene !== 'custom') {
          pickScene('custom');
        } else {
          $('file').click();
        }
      });

      ['dragenter', 'dragover'].forEach((t) => upBtn.addEventListener(t, (e) => {
        e.preventDefault();
        upBtn.classList.add('dragging');
      }));
      ['dragleave', 'drop'].forEach((t) => upBtn.addEventListener(t, () => upBtn.classList.remove('dragging')));
      upBtn.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!isPremium && !isFreeBeta) {
          $('purchaseModal').showModal();
          return;
        }
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) upload(f);
      });
    }

    const removeArtBtn = $('customRemoveBtn');
    if (removeArtBtn) {
      removeArtBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeArt();
      });
    }

    // Accordion expand / collapse
    document.querySelectorAll('.accordion-header').forEach(header => {
      header.addEventListener('click', () => {
        const item = header.closest('.accordion-item');
        const isOpen = item.classList.contains('open');
        item.classList.toggle('open', !isOpen);
        header.setAttribute('aria-expanded', String(!isOpen));
      });
    });

    // Bottom Action Buttons: Apply Theme & Reset
    const applyBtn = $('applyThemeBtn');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        activate();
        applyBtn.classList.add('success');
        applyBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3.5 8.5l3 3 6-6"/></svg><span>Applied to LeetCode!</span>`;
        setTimeout(() => {
          applyBtn.classList.remove('success');
          applyBtn.innerHTML = `<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M3.5 8.5l3 3 6-6"/></svg><span>Apply Theme</span>`;
        }, 1800);
      });
    }

    const resetBtn = $('resetThemeBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        settings.scene = DEF;
        settings.sceneMode = 'static';
        settings.arcScenes = { easy: 'golden-hour', medium: 'moon-field', hard: 'harvest-moon' };
        justSet = null;
        busy(true);
        try {
          await refresh();
          await solveAndSave();
          activate();
        } finally {
          busy(false);
        }
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
    isFreeBeta = status.is_free_beta !== false;
    Premium.updateBadge(badge, isPremium, status.key_prefix, isFreeBeta);
    Premium.syncUIElements(document, status);
    if ((isPremium || isFreeBeta) && getPremiumBtn) {
      getPremiumBtn.hidden = true;
    }

    if (compUpgradeBtn) {
      compUpgradeBtn.hidden = isPremium || isFreeBeta;
      compUpgradeBtn.onclick = () => {
        if (getPremiumBtn) {
          getPremiumBtn.click();
        } else {
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
      compActivePill.hidden = !isPremium || isFreeBeta;
    }

    // When premium is inactive, ensure only Basic tier scenes can be active
    const BASIC_SCENES = new Set(['golden-hour', 'moon-field', 'harvest-moon']);
    if (!isPremium && !isFreeBeta && !BASIC_SCENES.has(settings.scene)) {
      settings.scene = 'golden-hour';
      if (settings.arcs) {
        settings.arcScenes = { easy: 'golden-hour', medium: 'moon-field', hard: 'harvest-moon' };
      }
    }

    // Allow clicking on Basic Plan badge to open upgrade modal (only when monetized)
    if (badge) {
      badge.addEventListener('click', () => {
        if (!isPremium && !isFreeBeta) {
          if (getPremiumBtn) getPremiumBtn.click();
          else purchaseModal.showModal();
        }
      });
    }

    // 2. Open Purchase Modal (Starts at Step 1: Credentials)
    if (getPremiumBtn) {
      getPremiumBtn.addEventListener('click', () => {
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

    // Phone Sanitizer: strictly extracts digits, handles +91 / leading 0, and restricts to max 10 digits
    function sanitizePhoneNumber(val) {
      if (!val) return '';
      let digits = String(val).replace(/\D/g, '');
      if (digits.length === 12 && digits.startsWith('91')) {
        digits = digits.slice(2);
      } else if (digits.length === 11 && digits.startsWith('0')) {
        digits = digits.slice(1);
      }
      return digits.slice(0, 10);
    }

    // Real-time phone sanitizer for typing, paste, and browser autofill events
    if (custPhone) {
      const onPhoneChange = () => {
        const cleaned = sanitizePhoneNumber(custPhone.value);
        if (custPhone.value !== cleaned) {
          custPhone.value = cleaned;
        }
      };
      custPhone.addEventListener('input', onPhoneChange);
      custPhone.addEventListener('change', onPhoneChange);
      custPhone.addEventListener('paste', () => setTimeout(onPhoneChange, 10));
    }

    // Clear validation error when user begins editing any field
    [custName, custEmail, custPhone].forEach((inp) => {
      if (inp) {
        inp.addEventListener('input', () => {
          if (credentialsError) credentialsError.hidden = true;
        });
      }
    });

    // Step 1: Validate Credentials & Advance to Step 2
    if (credentialsForm) {
      credentialsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (credentialsError) credentialsError.hidden = true;

        const name = custName ? custName.value.trim() : '';
        const email = custEmail ? custEmail.value.trim() : '';
        const phone = custPhone ? sanitizePhoneNumber(custPhone.value) : '';

        if (custPhone && custPhone.value !== phone) {
          custPhone.value = phone;
        }

        if (!name || !email || !phone) {
          if (credentialsError) {
            credentialsError.textContent = 'Please fill out all fields.';
            credentialsError.hidden = false;
          }
          return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          if (credentialsError) {
            credentialsError.textContent = 'Please enter a valid email address.';
            credentialsError.hidden = false;
          }
          if (custEmail) custEmail.focus();
          return;
        }

        if (phone.length !== 10 || !/^\d{10}$/.test(phone)) {
          if (credentialsError) {
            credentialsError.textContent = 'Please enter a valid 10-digit mobile number.';
            credentialsError.hidden = false;
          }
          if (custPhone) custPhone.focus();
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
        const phone = custPhone ? sanitizePhoneNumber(custPhone.value) : '';

        if (!name || !email || !phone || phone.length !== 10) {
          setCheckoutStep(1);
          return;
        }

        payBtn.disabled = true;
        payBtn.innerHTML = '<span>Opening Razorpay Checkout…</span>';

        const config = Premium.CONFIG;
        const isLiveKey = config.RAZORPAY_KEY_ID && !config.RAZORPAY_KEY_ID.includes('PLACEHOLDER');

        if (window.Razorpay && isLiveKey) {
          try {
            // Optional: Pre-create order via Edge Function if configured
            let serverOrderId = null;
            try {
              const ordRes = await fetch(`${config.SUPABASE_URL}/functions/v1/create-order`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': config.SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${config.SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({ name, email, phone })
              });
              if (ordRes.ok) {
                const ordData = await ordRes.json();
                if (ordData && ordData.order_id) {
                  serverOrderId = ordData.order_id;
                }
              }
            } catch (e) {
              // Proceed with standard direct checkout
            }

            const iconUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
              ? chrome.runtime.getURL('icons/icon128.png')
              : 'https://raw.githubusercontent.com/the-insane-iconic/LeetGlow/main/icons/icon128.png';

            const rzpOptions = {
              key: config.RAZORPAY_KEY_ID,
              amount: config.PRODUCT_PRICE_PAISE,
              currency: config.CURRENCY || 'INR',
              name: config.PRODUCT_NAME || 'LeetGlow Premium',
              description: 'Lifetime Access to All Themes & Anime Scenes',
              image: iconUrl,
              prefill: { name, email, contact: phone },
              theme: { color: '#0f172a' },
              handler: async function (response) {
                if (purchaseModal && !purchaseModal.open) {
                  purchaseModal.showModal();
                }
                setCheckoutStep(2);
                payBtn.disabled = true;
                payBtn.innerHTML = '<span>Verifying payment with server…</span>';
                const result = await Premium.recordPaymentAndIssueKey({
                  name, email, phone,
                  orderId: response.razorpay_order_id || serverOrderId || ('ord_' + Date.now()),
                  paymentId: response.razorpay_payment_id,
                  signature: response.razorpay_signature || ''
                });
                onPaymentSuccess(result, email);
              },
              modal: {
                ondismiss: function () {
                  // User dismissed Razorpay: bring back the checkout modal at Step 2
                  if (purchaseModal && !purchaseModal.open) {
                    purchaseModal.showModal();
                  }
                  setCheckoutStep(2);
                  payBtn.disabled = false;
                  payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
                }
              }
            };

            if (serverOrderId) {
              rzpOptions.order_id = serverOrderId;
            }

            const rzp = new window.Razorpay(rzpOptions);
            rzp.on('payment.failed', function (resp) {
              if (purchaseModal && !purchaseModal.open) {
                purchaseModal.showModal();
              }
              setCheckoutStep(2);
              if (paymentError) {
                paymentError.textContent = resp.error ? resp.error.description : 'Payment failed. Please try again.';
                paymentError.hidden = false;
              }
              payBtn.disabled = false;
              payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
            });

            // CRITICAL FIX: Close purchaseModal so it leaves the browser's Top Layer!
            // Razorpay iframe is appended to document.body. When an element is in the Top Layer via
            // showModal(), the browser strictly renders all document.body elements behind it.
            // Closing purchaseModal ensures Razorpay appears in front, fully interactive.
            if (purchaseModal && purchaseModal.open) {
              purchaseModal.close();
            }
            rzp.open();
          } catch (err) {
            if (purchaseModal && !purchaseModal.open) {
              purchaseModal.showModal();
            }
            setCheckoutStep(2);
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

    function openUpgradeModalDirectly() {
      if (isPremium || isFreeBeta || !purchaseModal) return;
      if (getPremiumBtn) {
        getPremiumBtn.click();
      } else {
        if (credentialsError) credentialsError.hidden = true;
        if (paymentError) paymentError.hidden = true;
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.innerHTML = '<span>Pay ₹29 via Razorpay</span>';
        }
        setCheckoutStep(1);
        if (!purchaseModal.open) purchaseModal.showModal();
        if (custName) custName.focus();
      }
    }

    if (window.location.hash === '#upgrade' || window.location.search.includes('upgrade')) {
      openUpgradeModalDirectly();
    } else if (window.location.hash === '#activate' || window.location.search.includes('activate')) {
      if (!isPremium && !isFreeBeta && activationModal && !activationModal.open) activationModal.showModal();
    }

    window.addEventListener('hashchange', () => {
      if (window.location.hash === '#upgrade' || window.location.search.includes('upgrade')) {
        openUpgradeModalDirectly();
      } else if (window.location.hash === '#activate' || window.location.search.includes('activate')) {
        if (!isPremium && !isFreeBeta && activationModal && !activationModal.open) activationModal.showModal();
      }
    });
  }

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.lcThemeStudio) renderActive(ch.lcThemeStudio.newValue);
    if (ch.lcFocus) $('focus').checked = !!ch.lcFocus.newValue;
    if (ch.lcShare) $('share').checked = !(ch.lcShare.newValue && ch.lcShare.newValue.enabled === false);
    if (ch.leetglowPremium && typeof LeetGlowPremium !== 'undefined') {
      const active = !!ch.leetglowPremium.newValue?.active;
      const isFreeBetaVal = ch.leetglowPremium.newValue?.is_free_beta !== false;
      isPremium = active;
      isFreeBeta = isFreeBetaVal;
      const badge = $('premiumBadge');
      LeetGlowPremium.updateBadge(badge, active, ch.leetglowPremium.newValue?.key_prefix, isFreeBeta);
      LeetGlowPremium.syncUIElements(document, ch.leetglowPremium.newValue);
      const getPremiumBtn = $('getPremiumBtn');
      if (getPremiumBtn) {
        getPremiumBtn.hidden = active || isFreeBeta;
      }
      const compUpgradeBtn = $('comparisonUpgradeBtn');
      if (compUpgradeBtn) compUpgradeBtn.hidden = active || isFreeBeta;
      const compActivePill = $('comparisonActivePill');
      if (compActivePill) compActivePill.hidden = !active || isFreeBeta;
      renderScenes();
      renderArcs();
    }
  });
})();
