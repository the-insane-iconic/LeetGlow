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

  async function showPreview() {
    await frameReady;
    if (!theme || !prepared) return;
    if (previewUrls) { URL.revokeObjectURL(previewUrls.wall); URL.revokeObjectURL(previewUrls.blur); }
    previewUrls = { wall: URL.createObjectURL(prepared.wallBlob), blur: URL.createObjectURL(prepared.blurBlob) };
    frame.contentWindow.LCTSPreview.apply(theme, previewUrls);
  }

  /* the studio's own accent follows the scene */
  function tintStudio() {
    if (!theme) return;
    const r = document.documentElement.style;
    r.setProperty('--accent', theme.roles['--lc-accent']);
    r.setProperty('--accent-ink', theme.mode === 'dark' ? theme.scrim : '#ffffff');
  }

  /* ---- solving ---------------------------------------------------------------- */
  function solveNow() {
    if (!prepared) return;
    theme = Solver.analyze(prepared.sharp, prepared.blurSamples, {
      glass: settings.glass, visibility: settings.visibility, cols: prepared.cols
    });
    renderReport();
    tintStudio();
  }

  function renderReport() {
    const r = theme.report;
    const inks = Object.entries(r.ink).filter(([k]) => !['variable', 'regexp', 'comment'].includes(k)).map(([, v]) => v);
    const chip = (label, v) => `<span class="chip">${label} <b>${v.toFixed(1)}:1</b></span>`;
    $('report').innerHTML =
      chip('Text', r.text) + chip('Code', r.editorText) + chip('Syntax colours ≥', Math.min(...inks)) +
      chip('Accent', r.accent) + chip('Submit', r.submit);
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
      b.innerHTML = `<span class="name">${s.name}</span>`;
      b.title = s.desc + (s.credit ? ' · ' + s.credit : '');
      b.addEventListener('click', () => pickScene(id));
      presets.appendChild(b);
    });

    const up = document.createElement('button');
    up.type = 'button';
    up.className = 'scene upload' + (hasArt ? ' has-art' : '');
    up.setAttribute('role', 'radio');
    up.setAttribute('aria-checked', String(settings.scene === 'custom'));
    if (hasArt && customThumb) up.style.backgroundImage = `url("${customThumb}")`;
    up.innerHTML = `<span class="plus" aria-hidden="true">+</span><span class="name">${hasArt ? 'Your picture' : 'Add your picture'}</span>`;
    up.addEventListener('click', () => { if (hasArt && settings.scene !== 'custom') pickScene('custom'); else $('file').click(); });
    ['dragenter', 'dragover'].forEach((t) => up.addEventListener(t, (e) => { e.preventDefault(); up.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach((t) => up.addEventListener(t, () => up.classList.remove('dragging')));
    up.addEventListener('drop', (e) => {
      e.preventDefault();
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
    const s = SCENES[settings.scene];
    const n = $('sceneCredit');
    if (!n) return;
    if (!s || !s.credit || s.credit === 'Original') { n.textContent = ''; return; }
    n.textContent = s.credit.indexOf('Freepik') === 0
      ? `${s.name}: designed by Freepik – Magnific.com`
      : `${s.name}: ${s.credit}`;
  }

  async function pickScene(id) {
    busy(true);
    try {
      justSet = null;
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
    n.classList.toggle('done', !!justSet);
    if (custom) n.textContent = 'Your picture is used for every difficulty.';
    else if (!settings.arcs) n.textContent = '';
    else if (justSet) n.textContent = `✓ ${label} problems now use ${SCENES[justSet].name}. Pick another slot to change it too.`;
    else n.innerHTML = `Choosing the scene for <b>${label}</b> problems. Pick a slot above to change another difficulty.`;
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
    if (!/^image\//.test(file.type)) { note('That file is not an image.', true); return; }
    if (file.size > MAX_INPUT) { note('That image is over 30 MB. Try a smaller copy.', true); return; }
    busy(true, 'Preparing your picture…');
    try {
      const p = await Proc.prepare(file);
      const [wall, blur] = await Promise.all([Proc.blobToDataURL(p.wallBlob), Proc.blobToDataURL(p.blurBlob)]);
      await chrome.storage.local.set({ lcAnimeArt: { wall, blur, name: file.name } });
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
  if (globalThis.LCTSSupportButton) globalThis.LCTSSupportButton($('support'));
  if (globalThis.LCTSBugButton) globalThis.LCTSBugButton($('bug'));
  if (globalThis.LCTSConnectButton) globalThis.LCTSConnectButton($('connect'));

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
    document.querySelector('.volume').classList.toggle('off', !settings.sound);
  };
  $('sound').addEventListener('change', () => { settings.sound = $('sound').checked; renderSound(); save(); });
  $('volume').addEventListener('input', () => { settings.volume = $('volume').value / 100; renderSound(); });
  /* on release, play a short sound at the new level so the choice can be heard */
  $('volume').addEventListener('change', () => {
    save();
    if (settings.sound) globalThis.LCTSSounds.play('run', { volume: settings.volume, theme: 'anime' });
  });

  document.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', async () => {
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
      /* someone who picked one scene before arcs existed keeps it */
      arcs: A.arcs !== undefined ? !!A.arcs : !A.scene,
      arcScenes: A.arcScenes || {},
      glass: A.glass || 'auto',
      visibility: typeof res.lcAnime.visibility === 'number' ? res.lcAnime.visibility : 0.85,
      titleCard: res.lcAnime.titleCard !== false, moments: res.lcAnime.moments !== false,
      japanese: res.lcAnime.japanese !== false,
      sound: res.lcAnime.sound !== false,
      volume: typeof res.lcAnime.volume === 'number' ? res.lcAnime.volume : 1
    } : {});
    hasArt = !!res.lcAnimeArt;
    customThumb = hasArt ? res.lcAnimeArt.blur : null;
    if (settings.scene === 'custom' && !hasArt) settings.scene = DEF;

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

    busy(true, 'Loading scene…');
    try {
      await refresh();
      await solveAll();
      if (res.lcFocus) frame.contentWindow.LCTSPreview.focus(true);
    } finally { busy(false); }
  })();

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.lcThemeStudio) renderActive(ch.lcThemeStudio.newValue);
    if (ch.lcFocus) $('focus').checked = !!ch.lcFocus.newValue;
    if (ch.lcShare) $('share').checked = !(ch.lcShare.newValue && ch.lcShare.newValue.enabled === false);
  });
})();
