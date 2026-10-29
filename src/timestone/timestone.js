/* =============================================================================
   timestone.js — Time Stone & The Blip Theme Moment Engine (src/timestone/timestone.js)
   
   ACCEPTED (Submit):
   1. The Snap: Golden gauntlet silhouette snaps in the corner with a crisp click.
   2. The Blip: Run button, Submit button, and Problem Title dissolve into floating
      golden/ash particles drifting into the air.
   3. Doctor Strange Time Mandala: Concentric glowing emerald runic rings spin open.
   4. Time Rewind: The green time spiral pulls particles backward in a vortex,
      reassembling the buttons and title with an electric pulse: TIME RESTORED · BEATS x%.
   5. Resolution: Glyph dissolves cleanly, leaving the page pristine.
   ============================================================================= */

(() => {
  'use strict';
  if (globalThis.LCTSTimeStone) return;

  const root = document.documentElement;
  const SFX = globalThis.LCTSTimeStoneSounds;

  function isThemeActive() {
    return root.getAttribute('data-lc-theme') === 'timestone';
  }

  function playSound(name) {
    if (SFX && SFX.play) SFX.play(name);
  }

  let activeAnimation = null;

  function clearActiveAnimation() {
    if (activeAnimation) {
      activeAnimation.cleanup();
      activeAnimation = null;
    }
  }

  /* ---- Geometry & Helpers -------------------------------------------------- */
  const rnd = (min, max) => min + Math.random() * (max - min);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);

  function getTargetElements() {
    const submit = document.querySelector('[data-e2e-locator="console-submit-button"], [data-e2e-locator="submit-button"], button[data-cypress="SubmitCode"]');
    const run = document.querySelector('[data-e2e-locator="console-run-button"], [data-e2e-locator="run-code-btn"], button[data-cypress="RunCode"]');
    const title = document.querySelector('.text-title-large, [data-track-load="description_content"] h4, a[href*="/problems/"]');

    const targets = [];
    [submit, run, title].forEach((el) => {
      if (el && el.isConnected) {
        const r = el.getBoundingClientRect();
        if (r.width > 10 && r.height > 10 && r.top < window.innerHeight && r.bottom > 0) {
          targets.push({ el, r });
        }
      }
    });
    return targets;
  }

  /* ---- Draw Doctor Strange Mystic Time Mandala ---------------------------- */
  function drawMandala(ctx, cx, cy, radius, alpha, angle) {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;

    // Glowing Emerald Aura
    const aura = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius * 1.3);
    aura.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    aura.addColorStop(0.6, 'rgba(52, 211, 153, 0.15)');
    aura.addColorStop(1, 'rgba(5, 150, 105, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Concentric Runic Rings
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.2;
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 14;

    // Outer Circle
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Inner Concentric Circle
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
    ctx.stroke();

    // Core Ring
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    // Intersecting Sacred Geometry (Two Rotated Squares)
    ctx.lineWidth = 1.6;
    for (let k = 0; k < 2; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 4);
      const side = radius * 0.72;
      ctx.strokeRect(-side / 2, -side / 2, side, side);
      ctx.restore();
    }

    // Outer Cog / Runic Spoke Teeth
    ctx.lineWidth = 2;
    const teeth = 16;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const x1 = Math.cos(a) * (radius * 0.88);
      const y1 = Math.sin(a) * (radius * 0.88);
      const x2 = Math.cos(a) * (radius * 1.06);
      const y2 = Math.sin(a) * (radius * 1.06);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Center Time Stone Core
    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.28);
    core.addColorStop(0, '#ffffff');
    core.addColorStop(0.3, '#34d399');
    core.addColorStop(0.8, '#10b981');
    core.addColorStop(1, 'rgba(5, 150, 105, 0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.28, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  /* ---- Draw Golden Infinity Gauntlet Snap Silhouette ----------------------- */
  function drawGauntletSnap(ctx, progress) {
    if (progress <= 0 || progress >= 1) return;
    const alpha = Math.sin(progress * Math.PI);
    const scale = 0.95 + 0.05 * Math.sin(progress * Math.PI);
    const x = window.innerWidth - 90;
    const y = window.innerHeight - 80;

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;

    // Radial Golden Snap Flash
    const flash = ctx.createRadialGradient(0, 0, 5, 0, 0, 95);
    flash.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
    flash.addColorStop(0.35, 'rgba(245, 158, 11, 0.6)');
    flash.addColorStop(0.7, 'rgba(16, 185, 129, 0.35)');
    flash.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = flash;
    ctx.beginPath();
    ctx.arc(0, 0, 95, 0, Math.PI * 2);
    ctx.fill();

    // Stylized Golden Gauntlet Hand Silhouette with 6 Glowing Stones
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 12;

    // Palm & Thumb
    ctx.beginPath();
    ctx.ellipse(0, 10, 24, 30, -0.2, 0, Math.PI * 2);
    ctx.fill();

    // Fingers Snapping
    ctx.beginPath();
    ctx.ellipse(-10, -18, 7, 18, -0.3, 0, Math.PI * 2);
    ctx.ellipse(5, -22, 7, 20, 0.1, 0, Math.PI * 2);
    ctx.fill();

    // The 6 Glowing Infinity Stones (Time Stone prominent in green)
    const stones = [
      { x: -7, y: 4, c: '#3b82f6' },  // Space (Blue)
      { x: 3, y: 3, c: '#ef4444' },   // Reality (Red)
      { x: -12, y: -4, c: '#a855f7' }, // Power (Purple)
      { x: 10, y: -2, c: '#f59e0b' },  // Soul (Amber)
      { x: 0, y: -8, c: '#eab308' },  // Mind (Yellow)
      { x: 0, y: 14, c: '#10b981', r: 5 } // TIME STONE (Emerald)
    ];

    stones.forEach((s) => {
      ctx.fillStyle = s.c;
      ctx.shadowColor = s.c;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r || 3.5, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.restore();
  }

  /* ---- The Main Accepted Moment: The Snap & Time Rewind -------------------- */
  function playAcceptedMoment(info) {
    clearActiveAnimation();
    const targets = getTargetElements();
    if (!targets.length) return;

    // Create full-screen canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'lcts-timestone-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:2147482600;display:block;';
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Generate dust particles from target bounds
    const particles = [];
    targets.forEach(({ r }) => {
      const count = Math.min(220, Math.max(70, Math.round((r.width * r.height) / 80)));
      for (let i = 0; i < count; i++) {
        const ox = r.left + Math.random() * r.width;
        const oy = r.top + Math.random() * r.height;
        particles.push({
          ox, oy,
          x: ox, y: oy,
          // Upward dust drift with subtle horizontal dispersion
          driftVx: rnd(-25, 25),
          driftVy: rnd(-85, -220),
          size: rnd(1.4, 3.2),
          // Ember colors cooling to charcoal ash
          gold: rnd(0.7, 1.0),
          phase: rnd(0, Math.PI * 2),
          speed: rnd(1.8, 3.6)
        });
      }
    });

    // Audio cue: Snap
    playSound('snap');

    let startTime = performance.now();
    let hiddenApplied = false;
    let mandalaAngle = 0;
    let restoredBannerShown = false;

    // Timeline phases (seconds)
    const T_SNAP_DUR = 0.32;
    const T_BLIP_START = 0.28;
    const T_MANDALA_START = 1.35;
    const T_REWIND_START = 2.25;
    const T_RESTORE = 3.15;
    const T_TOTAL = 3.75;

    let animFrame = 0;
    let isTerminated = false;

    function cleanup() {
      if (isTerminated) return;
      isTerminated = true;
      cancelAnimationFrame(animFrame);
      targets.forEach(({ el }) => el.classList.remove('lcts-blip-hidden'));
      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('click', skip);
    }

    function skip() {
      cleanup();
    }

    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('click', skip, { once: true });

    activeAnimation = { cleanup };

    function frame(now) {
      if (isTerminated) return;
      const elapsed = (now - startTime) / 1000;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Phase 0: Gauntlet Snap
      if (elapsed < T_SNAP_DUR) {
        drawGauntletSnap(ctx, elapsed / T_SNAP_DUR);
      }

      // Phase 1: Hide real DOM elements and trigger vacuum whoosh
      if (elapsed >= T_BLIP_START && !hiddenApplied) {
        hiddenApplied = true;
        targets.forEach(({ el }) => el.classList.add('lcts-blip-hidden'));
        playSound('whoosh');
      }

      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      // Phase 2: Doctor Strange Mystic Time Mandala
      if (elapsed >= T_MANDALA_START && elapsed < T_TOTAL) {
        const mProgress = (elapsed - T_MANDALA_START) / (T_TOTAL - T_MANDALA_START);
        let mAlpha = 0;
        if (elapsed < T_REWIND_START) {
          mAlpha = Math.min(1, (elapsed - T_MANDALA_START) / 0.45);
        } else if (elapsed >= T_RESTORE) {
          mAlpha = Math.max(0, 1 - (elapsed - T_RESTORE) / (T_TOTAL - T_RESTORE));
        } else {
          mAlpha = 1;
        }

        mandalaAngle -= 0.025; // Counter-clockwise time rotation
        if (elapsed >= T_MANDALA_START && elapsed < T_MANDALA_START + 0.1) {
          playSound('timestone');
        }

        const radius = Math.min(window.innerWidth, window.innerHeight) * 0.22;
        drawMandala(ctx, centerX, centerY, radius, mAlpha, mandalaAngle);
      }

      // Ash & Golden Ember Particle Physics
      if (elapsed >= T_BLIP_START) {
        const isRewinding = elapsed >= T_REWIND_START;
        const rewindProgress = isRewinding ? Math.min(1, (elapsed - T_REWIND_START) / (T_RESTORE - T_REWIND_START)) : 0;
        const easedRewind = easeInOutCubic(rewindProgress);

        particles.forEach((p) => {
          if (!isRewinding) {
            // Forward: Disintegration into drifting ash
            const dt = elapsed - T_BLIP_START;
            p.x = p.ox + p.driftVx * dt + Math.sin(p.phase + dt * p.speed) * 14;
            p.y = p.oy + p.driftVy * dt;
          } else {
            // Backward: Time spiral vortex pulls particles back into exact starting positions
            const currentDriftX = p.ox + p.driftVx * (T_REWIND_START - T_BLIP_START) + Math.sin(p.phase) * 14;
            const currentDriftY = p.oy + p.driftVy * (T_REWIND_START - T_BLIP_START);

            // Spiral vortex effect towards center then snapping to ox, oy
            const spiralAngle = (1 - easedRewind) * Math.PI * 3;
            const radiusOffset = Math.sin(easedRewind * Math.PI) * 35;
            const vx = Math.cos(spiralAngle) * radiusOffset;
            const vy = Math.sin(spiralAngle) * radiusOffset;

            p.x = lerp(currentDriftX + vx, p.ox, easedRewind);
            p.y = lerp(currentDriftY + vy, p.oy, easedRewind);
          }

          // Particle color transition: Gold embers -> charcoal ash -> reigniting gold
          let color;
          if (!isRewinding) {
            const age = Math.min(1, (elapsed - T_BLIP_START) / 1.5);
            color = age < 0.35 ? '#fbbf24' : (age < 0.65 ? '#f59e0b' : '#64748b');
          } else {
            color = rewindProgress > 0.6 ? '#34d399' : '#fbbf24';
          }

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Phase 3: Time Restored Banner & Reassembly Shockwave
      if (elapsed >= T_RESTORE && !restoredBannerShown) {
        restoredBannerShown = true;
        targets.forEach(({ el }) => el.classList.remove('lcts-blip-hidden'));
      }

      if (elapsed >= T_RESTORE) {
        const bProgress = (elapsed - T_RESTORE) / (T_TOTAL - T_RESTORE);
        const bAlpha = Math.sin(bProgress * Math.PI);

        // Elegant Time Restored Banner
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.globalAlpha = bAlpha;

        ctx.font = '600 13px "Inter", "Segoe UI", system-ui, sans-serif';
        ctx.fillStyle = '#34d399';
        ctx.shadowColor = '#10b981';
        ctx.shadowBlur = 10;
        const beatsText = info && info.beats ? ` · BEATS ${info.beats}%` : '';
        ctx.fillText(`TIME RESTORED${beatsText}`, centerX, centerY + 135);
        ctx.restore();
      }

      if (elapsed < T_TOTAL) {
        animFrame = requestAnimationFrame(frame);
      } else {
        cleanup();
      }
    }

    animFrame = requestAnimationFrame(frame);
  }

  /* ---- Run Checkpoint Moment ----------------------------------------------- */
  function playRunMoment() {
    playSound('run');
    // Swift emerald pulse on console tab
    const consoleTab = document.querySelector('[data-e2e-locator="console-result"], .flexlayout__tab:has([data-e2e-locator*="console"])');
    if (consoleTab) {
      consoleTab.style.transition = 'box-shadow 0.25s ease';
      consoleTab.style.boxShadow = 'inset 0 0 18px rgba(16, 185, 129, 0.4)';
      setTimeout(() => {
        if (consoleTab) consoleTab.style.boxShadow = '';
      }, 550);
    }
  }

  /* ---- Verdict Dispatcher -------------------------------------------------- */
  function playVerdict(v) {
    if (!isThemeActive()) return;
    if (v.kind === 'ac') {
      playAcceptedMoment(v);
    } else if (v.kind === 'run') {
      playRunMoment();
    } else {
      playSound('error');
    }
  }

  if (globalThis.LCTSVerdict) {
    globalThis.LCTSVerdict.subscribe(playVerdict);
  }

  root.LCTSTimeStone = {
    play: playVerdict,
    simulate: () => playAcceptedMoment({ beats: '98.5' })
  };
})();

