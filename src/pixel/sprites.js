/* =============================================================================
   sprites.js  (isolated world, LeetCode; also the popup) — Pixel Art sprites

   An original 8-bit gunner, drawn here as palette strings (one character per
   pixel, '.' = transparent) so there is no image to load or license:
     hero-a / hero-b   hovering on a jetpack, the scarf in two frames
     gun               the railgun, pointing right; the stage rotates it to aim
     rocket            pointing right
   Colours are the Sweetie-16 palette themes/pixel.css is built on.

   LCTSPixelSprites.frame(name) returns a canvas at 1 px per pixel, rendered
   once and cached; draw it with imageSmoothingEnabled = false.
============================================================================= */
(() => {
  if (globalThis.LCTSPixelSprites) return;

  const PAL = {
    k: '#0d0e17', d: '#333c57', s: '#566c86', g: '#94b0c2', w: '#f4f4f4',
    y: '#ffcd75', o: '#ef7d57', r: '#b13e53', b: '#29366f', c: '#41a6f6',
    t: '#73eff7', p: '#5d275d'
  };

  const BODY = [
    '...kkkkkk...',
    '..kddddddk..',
    '.kdddddddk..',
    '.kddkyyyyk..',
    '.kddkytyyk..',
    '..kddddddk..'
  ];
  const LEGS = [
    '..kbbcbbbbk.',
    '.skbbbbbbk..',
    'sskbbbbbbk..',
    'sskkbbbbk...',
    '.kokbkkbk...',
    '..y.kbk.kbk.',
    '....kbk.kbk.',
    '...kkk..kkk.'
  ];
  const FRAMES = {
    'hero-a': BODY.concat([
      'o.kkdddkk...',
      'ooookbbbbk..',
      '.oo.kbbbbbk.'
    ], LEGS),
    'hero-b': BODY.concat([
      '..okdddkk...',
      '.oookbbbbk..',
      'oo..kbbbbbk.'
    ], LEGS),
    gun: [
      '...kkkkkkkk....',
      'kkkssssssssskkk',
      'kggtttttttttttw',
      'kkkssssssssskkk',
      '..kk...........'
    ],
    rocket: [
      '.kk....',
      'kgggrok',
      'kwggroy',
      '.kk....'
    ]
  };

  const cache = {};
  function frame(name) {
    if (cache[name]) return cache[name];
    const rows = FRAMES[name];
    if (!rows) return null;
    const w = Math.max.apply(null, rows.map((r) => r.length)), h = rows.length;
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        const col = PAL[row[x]];
        if (col) { c.fillStyle = col; c.fillRect(x, y, 1, 1); }
      }
    });
    return (cache[name] = cv);
  }

  /* the same frame with a 1 px outline around its silhouette, so a dark
     sprite still reads on a dark page */
  function outlined(name, color) {
    const key = name + '|' + color;
    if (cache[key]) return cache[key];
    const f = frame(name);
    if (!f) return null;
    const cv = document.createElement('canvas');
    cv.width = f.width + 2; cv.height = f.height + 2;
    const c = cv.getContext('2d');
    [[0, 1], [2, 1], [1, 0], [1, 2]].forEach(([x, y]) => c.drawImage(f, x, y));
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color; c.fillRect(0, 0, cv.width, cv.height);
    c.globalCompositeOperation = 'source-over';
    c.drawImage(f, 1, 1);
    return (cache[key] = cv);
  }

  /* where the gun sits on the hero (its shoulder), in sprite pixels */
  const SHOULDER = { x: 7, y: 9 };
  const GUN_GRIP = { x: 3, y: 2 };

  globalThis.LCTSPixelSprites = { frame, outlined, PAL, SHOULDER, GUN_GRIP, names: Object.keys(FRAMES) };
})();
