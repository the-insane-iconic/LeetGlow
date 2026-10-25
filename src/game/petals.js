/* =============================================================================
   petals.js — Gaming Theme petal field: one canvas, one Image, ~16 recycled
   particles. Used by title-card.js for the "First Realm" (Easy) title card.

   Kept deliberately generic (not sakura-specific in name/API) since Medium's
   falling leaves and Hard's rain will reuse the same wind/entrance/recycle
   machinery with a different sprite and per-particle ranges.
============================================================================= */
(function (root) {
  'use strict';

  var DEFAULT_IMAGE_URL = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
    ? chrome.runtime.getURL('textures/game/sakura.png')
    : 'textures/game/sakura.png';

  var imgCache = {};
  function loadImage(src) {
    if (imgCache[src]) return imgCache[src];
    imgCache[src] = new Promise(function (resolve) {
      var i = new Image();
      i.onload = function () { resolve(i); };
      i.onerror = function () { resolve(null); };
      i.src = src;
    });
    return imgCache[src];
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  /* subtle: a small pool, not a shower -- and every petal drifts the SAME
     way (a light rightward base drift, matching the shared gust direction
     below) rather than each wandering its own independent line. Individual
     petals still differ in speed/rotation/size for a natural, non-uniform
     feel, just not in overall direction. */
  var DEG = Math.PI / 180;

  function makeParticle(width, height, delayMs, opac) {
    /* particles that are already "entering" (no delay) start partway into
       the scene rather than stacked at the very top edge, so the card's
       first frame doesn't read as empty while the rest drift in from top. */
    var startY = delayMs > 0 ? rand(-height * 0.3, -height * 0.05) : rand(-height * 0.12, height * 0.4);
    return {
      x: rand(0, width),
      y: startY,
      sizeMul: rand(0.5, 1.1),
      rotation: rand(0, 360) * DEG,
      rotationSpeed: rand(-12, 12) * DEG,
      opacity: rand(opac[0], opac[1]),
      fallSpeed: rand(24, 42),
      baseDrift: rand(0.8, 2.2),
      windAmp: rand(2, 6),
      windFreq: rand(0.15, 0.4),
      windInfluence: rand(0.7, 1.3),
      rotationInfluence: rand(0.06, 0.2) * DEG,
      flip: Math.random() < 0.5,
      phase: rand(0, Math.PI * 2),
      delay: delayMs,
      ageMs: 0,
      born: false,
      fadeT: 0
    };
  }

  function respawn(p, width, height, opac) {
    var fresh = makeParticle(width, height, rand(0, 1200), opac);
    fresh.y = rand(-height * 0.25, -20);
    for (var k in fresh) p[k] = fresh[k];
  }

  /* a lightweight global breeze: a gentle constant sway plus rare gusts that
     ramp up, hold briefly, then fade -- never an instant sideways jump. */
  function createWind() {
    return {
      current: 0,
      breezePhase: rand(0, Math.PI * 2),
      gustActive: false,
      gustT: 0,
      gustDur: 0,
      gustStrength: 0,
      gustDir: 1,
      nextGustAt: performance.now() + rand(4000, 8000)
    };
  }

  function updateWind(w, now, dtSec) {
    w.breezePhase += dtSec * 0.35;
    var breeze = Math.sin(w.breezePhase) * 2.4;

    if (!w.gustActive && now >= w.nextGustAt) {
      w.gustActive = true;
      w.gustT = 0;
      w.gustDur = rand(1000, 2000);
      w.gustStrength = rand(9, 22);
      w.gustDir = 1;   // always the same direction as the base drift -- one wind, not gusts from anywhere
    }

    var gust = 0;
    if (w.gustActive) {
      w.gustT += dtSec * 1000;
      var p = w.gustT / w.gustDur;
      if (p >= 1) {
        w.gustActive = false;
        w.nextGustAt = now + rand(4000, 8000);
      } else if (p < 0.25) {
        gust = (p / 0.25) * w.gustStrength * w.gustDir;
      } else if (p < 0.7) {
        gust = w.gustStrength * w.gustDir;
      } else {
        gust = (1 - (p - 0.7) / 0.3) * w.gustStrength * w.gustDir;
      }
    }

    w.current = breeze + gust;
    return w.current;
  }

  function draw(ctx, particles, image, width, height, baseSize) {
    ctx.clearRect(0, 0, width, height);
    if (!image) return;
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      if (!p.born) continue;
      var alpha = p.opacity * p.fadeT;
      if (alpha <= 0.01) continue;
      var size = p.sizeMul * baseSize;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.scale(p.flip ? -1 : 1, 1);
      ctx.drawImage(image, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  /* container: the element the canvas should fill (e.g. the title card).
     opts: { imageUrl, count, opacity: [min, max], className } -- count/
     opacity/className let the ambient (always-on, behind the description
     panel) field run far sparser and dimmer than the title card's burst,
     without duplicating the whole wind/recycle machinery. */
  function mount(container, opts) {
    opts = opts || {};
    var count = opts.count || 10;
    var opac = opts.opacity || [0.2, 0.4];
    var reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

    var canvas = document.createElement('canvas');
    canvas.className = 'lctg-petals' + (opts.className ? ' ' + opts.className : '');
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);
    var ctx = canvas.getContext('2d');

    var width = 0, height = 0, baseSize = 32;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var particles = [];
    var wind = createWind();
    var raf = null, last = 0, destroyed = false, ro = null;

    function resize() {
      var rect = container.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      baseSize = Math.max(20, Math.min(42, width * 0.032));
    }

    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(resize);
      ro.observe(container);
    } else {
      window.addEventListener('resize', resize);
    }
    resize();

    loadImage(opts.imageUrl || DEFAULT_IMAGE_URL).then(function (image) {
      if (destroyed || !image) return;

      if (reduced) {
        for (var i = 0; i < Math.min(8, count); i++) {
          var p = makeParticle(width, height, 0, opac);
          p.y = rand(height * 0.08, height * 0.85);
          p.born = true;
          p.fadeT = 1;
          p.opacity = rand(opac[0], Math.max(opac[0], opac[1] * 0.85));
          particles.push(p);
        }
        draw(ctx, particles, image, width, height, baseSize);
        return;
      }

      var initialCount = Math.floor(rand(count * 0.5, count * 0.9));
      for (var j = 0; j < count; j++) {
        particles.push(makeParticle(width, height, j < initialCount ? 0 : rand(400, 2600), opac));
      }

      last = performance.now();
      function frame(now) {
        if (destroyed) return;
        var dt = Math.min(now - last, 50);
        last = now;
        var dtSec = dt / 1000;
        updateWind(wind, now, dtSec);

        for (var k = 0; k < particles.length; k++) {
          var q = particles[k];
          if (!q.born) {
            q.ageMs += dt;
            if (q.ageMs >= q.delay) q.born = true;
            continue;
          }
          q.fadeT = Math.min(1, q.fadeT + dtSec / 0.5);
          var windPush = wind.current * q.windInfluence;
          q.x += q.baseDrift * dtSec + windPush * dtSec;
          q.x += Math.sin(now * 0.001 * q.windFreq * 6.283 + q.phase) * q.windAmp * dtSec * 0.6;
          q.y += q.fallSpeed * dtSec;
          q.rotation += q.rotationSpeed * dtSec + wind.current * q.rotationInfluence * dtSec;
          if (q.y - baseSize > height + 30) respawn(q, width, height, opac);
        }

        draw(ctx, particles, image, width, height, baseSize);
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);
    });

    return {
      destroy: function () {
        destroyed = true;
        if (raf) cancelAnimationFrame(raf);
        if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
        canvas.remove();
      }
    };
  }

  root.LCTSGamePetals = { mount: mount };
})(globalThis);
