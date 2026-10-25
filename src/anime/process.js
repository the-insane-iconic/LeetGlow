/* =============================================================================
   process.js — prepares a picture for the anime theme, once.

   Runs only on extension pages (the Anime Studio and the preset build), never
   on LeetCode: decoding, resizing, blurring and solving all happen here when a
   scene is chosen, so a problem page only ever loads two finished images.

   Output:
     wall   the picture, WebP, at most 2560 px wide
     blur   a small pre-blurred copy with the same aspect. The editor sits on
            it as frosted glass; blurring once here is what lets us avoid
            backdrop-filter, which re-blurs on every frame the code scrolls.
     sharp / blurSamples   160x90 RGBA samples, cover-cropped the way the
            viewport crops the picture, for the solver
============================================================================= */
(function (root) {
  'use strict';

  const SAMPLE_W = 160, SAMPLE_H = 90;
  const MAX_WALL_BYTES = 2.4 * 1024 * 1024;   // well inside storage.local's 10 MB

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  const toBlob = (c, type, q) => new Promise((res) => c.toBlob(res, type, q));

  function blobToDataURL(blob) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
  }

  /* draw `img` to cover a w x h box, centred, as background-size:cover does */
  function drawCover(ctx, img, w, h, bleed) {
    const iw = img.width, ih = img.height;
    const s = Math.max(w / iw, h / ih);
    const dw = iw * s + bleed * 2, dh = ih * s + bleed * 2;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  async function prepare(source, opts) {
    opts = opts || {};
    const img = source instanceof ImageBitmap ? source : await createImageBitmap(source);

    /* the wall: keep the aspect, cap the size, re-encode until it fits */
    let scale = Math.min(1, 2560 / img.width, 1600 / img.height);
    let wallBlob = null;
    /* bundled scenes pass a tighter budget (scripts/build-scenes.mjs) */
    const MAX = opts.maxBytes || MAX_WALL_BYTES;
    for (const q of (opts.qualities || [0.88, 0.8, 0.72])) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const c = canvas(Math.round(img.width * scale), Math.round(img.height * scale));
        const ctx = c.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, c.width, c.height);
        wallBlob = await toBlob(c, 'image/webp', q);
        if (wallBlob.size <= MAX) break;
        scale *= 0.8;
      }
      if (wallBlob.size <= MAX) break;
    }

    /* the blur: small, same aspect, drawn with a bleed so the edges do not
       fade toward transparent */
    const bw = 480, bh = Math.max(1, Math.round(480 * img.height / img.width));
    const bc = canvas(bw, bh), bctx = bc.getContext('2d');
    bctx.filter = 'blur(9px) saturate(1.15)';
    bctx.drawImage(img, -24, -24, bw + 48, bh + 48);
    const blurBlob = await toBlob(bc, 'image/webp', 0.82);

    /* samples, cropped to the viewport's aspect */
    const vw = opts.viewW || 16, vh = opts.viewH || 9;
    const sh = Math.round(SAMPLE_W * vh / vw);
    const sc = canvas(SAMPLE_W, sh), sctx = sc.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingQuality = 'high';
    drawCover(sctx, img, SAMPLE_W, sh, 0);
    const sharp = sctx.getImageData(0, 0, SAMPLE_W, sh).data;
    sctx.clearRect(0, 0, SAMPLE_W, sh);
    const blurImg = await createImageBitmap(blurBlob);
    drawCover(sctx, blurImg, SAMPLE_W, sh, 0);
    const blurSamples = sctx.getImageData(0, 0, SAMPLE_W, sh).data;

    return { wallBlob, blurBlob, sharp, blurSamples, cols: SAMPLE_W, width: img.width, height: img.height };
  }

  /* samples only, for a scene whose wall and blur already exist (a preset,
     or a picture prepared earlier and kept in storage) */
  async function samplesFrom(wallBlob, blurBlob, opts) {
    opts = opts || {};
    const vw = opts.viewW || 16, vh = opts.viewH || 9;
    const sh = Math.round(SAMPLE_W * vh / vw);
    const sc = canvas(SAMPLE_W, sh), sctx = sc.getContext('2d', { willReadFrequently: true });
    sctx.imageSmoothingQuality = 'high';
    const wall = await createImageBitmap(wallBlob);
    drawCover(sctx, wall, SAMPLE_W, sh, 0);
    const sharp = sctx.getImageData(0, 0, SAMPLE_W, sh).data;
    sctx.clearRect(0, 0, SAMPLE_W, sh);
    drawCover(sctx, await createImageBitmap(blurBlob), SAMPLE_W, sh, 0);
    const blurSamples = sctx.getImageData(0, 0, SAMPLE_W, sh).data;
    return { wallBlob, blurBlob, sharp, blurSamples, cols: SAMPLE_W, width: wall.width, height: wall.height };
  }

  async function dataURLToBlob(url) {
    const comma = url.indexOf(',');
    const type = url.slice(5, comma).split(';')[0] || 'image/webp';
    const bin = atob(url.slice(comma + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  async function solve(prepared, settings) {
    return root.LCTSAnimeSolver.analyze(prepared.sharp, prepared.blurSamples, {
      glass: settings.glass, visibility: settings.visibility, cols: prepared.cols
    });
  }

  root.LCTSAnimeProcess = { prepare, samplesFrom, solve, blobToDataURL, dataURLToBlob };
})(globalThis);
