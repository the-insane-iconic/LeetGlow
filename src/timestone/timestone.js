/* =============================================================================
   timestone.js — Marvel Time Stone & The Blip Theme Moment Engine (src/timestone/timestone.js)
   
   MARVEL CINEMATIC EXPERIENCE:
   1. The Blip (Radial Disintegration on Run / Submit click):
      - Infinity Gauntlet Snap + shockwave erupting from the center of the screen.
      - Every single element on the page (nav, tabs, problem prose, Monaco editor,
        console) disintegrates outward into thousands of floating gold embers and ash.
      - Real UI is hidden; the screen transitions into the Multiverse Cosmic Void.
   2. The Judgment (Doctor Strange & The Eye of Agamotto):
      - Mystic Tao Mandala with ancient Sanskrit/runic rings rotating in the center.
      - Center Eye of Agamotto iris awakens with emerald luminescence.
      - Marvel Cinematic Story HUD:
        "// SACRED TIMELINE VARIANT DETECTED //"
        "THE EYE OF AGAMOTTO IS JUDGING YOUR REALITY..."
        "ANALYZING 14,000,605 TIMELINES..."
   3. The Time Reversal (On Accepted):
      - Time Stone flare: High-energy reverse suction whoosh + crystalline chime chord.
      - Time reverses: The mandala spins counter-clockwise and EVERY SINGLE particle
        across the screen retraces its exact outward trajectory back to its original spot!
      - Emerald shockwave pulse reassembles the real UI seamlessly:
        "SACRED TIMELINE RESTORED · BEATS X% OF ALL MULTIVERSE VARIANTS".
   4. Timeline Pruned (On Wrong Answer / Error):
      - Orange/crimson Nexus branch flash + TVA prune stick zap.
      - UI immediately resets cleanly so user can fix their code.
   ============================================================================= */

(() => {
  'use strict';
  if (globalThis.LCTSTimeStone) return;

  const root = document.documentElement;
  const SFX = globalThis.LCTSTimeStoneSounds;

  function isThemeActive() {
    return root.getAttribute('data-lc-theme') === 'timestone';
  }

  function playSound(name, opts) {
    if (SFX && SFX.play) SFX.play(name, opts);
  }

  function stopSounds() {
    if (SFX && SFX.stop) SFX.stop();
  }

  let activeAnimation = null;

  function clearActiveAnimation() {
    if (activeAnimation) {
      activeAnimation.cleanup();
      activeAnimation = null;
    }
  }

  /* ---- Math & Easing Helpers ------------------------------------------------ */
  const rnd = (min, max) => min + Math.random() * (max - min);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp01 = (t) => Math.max(0, Math.min(1, t));
  const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  /* ---- Target Elements Collection ------------------------------------------- */
  function gatherPageElements() {
    const hiddenElements = new Set();
    const targetRects = [];

    // 1. Navigation Bar & IDE Header
    const nav = document.querySelector('#__next nav');
    if (nav) {
      hiddenElements.add(nav);
      const items = nav.querySelectorAll('a, button, img, span, [class*="avatar"]');
      items.forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 8 && r.height > 8 && r.bottom > 0 && r.top < window.innerHeight) {
          targetRects.push({ r, kind: 'chrome', color: '#94a3b8' });
        }
      });
    }

    const topBtns = document.getElementById('ide-top-btns') || document.querySelector('[data-e2e-locator="console-submit-button"]')?.parentElement;
    if (topBtns) {
      hiddenElements.add(topBtns);
      topBtns.querySelectorAll('button').forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.width > 8 && r.height > 8) {
          const isSub = b.matches('[data-e2e-locator*="submit"], [data-cypress*="Submit"]') || (b.textContent || '').toLowerCase().includes('submit');
          targetRects.push({ r, kind: isSub ? 'submit' : 'run', color: isSub ? '#10b981' : '#34d399' });
        }
      });
    }

    // 2. Tab Headers & Splitters
    document.querySelectorAll('.flexlayout__tabset_tabbar_outer, .flexlayout__tab_button').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 12 && r.height > 8 && r.top < window.innerHeight && r.bottom > 0) {
        targetRects.push({ r, kind: 'tab', color: '#cbd5e1' });
      }
    });

    // 3. Problem Description Content
    const descPane = document.querySelector('.flexlayout__tab:has([data-track-load="description_content"])') || document.querySelector('[data-track-load="description_content"]');
    if (descPane) {
      const title = descPane.querySelector('.text-title-large, h4, [data-cy="question-title"]');
      if (title) {
        const r = title.getBoundingClientRect();
        targetRects.push({ r, kind: 'title', color: '#f8fafc', countMul: 1.8 });
      }
      const tags = descPane.querySelectorAll('[class*="badge"], [class*="tag"], [class*="difficulty"]');
      tags.forEach((tag) => {
        const r = tag.getBoundingClientRect();
        if (r.width > 10 && r.height > 8) targetRects.push({ r, kind: 'badge', color: '#10b981' });
      });
      const paragraphs = descPane.querySelectorAll('p, pre, code, [class*="example"]');
      paragraphs.forEach((p) => {
        const r = p.getBoundingClientRect();
        if (r.width > 15 && r.height > 10 && r.top < window.innerHeight && r.bottom > 0) {
          targetRects.push({ r, kind: 'prose', color: '#e2e8f0' });
        }
      });
    }

    // 4. Code Editor (Monaco lines, tokens & gutter)
    const editor = document.querySelector('.monaco-editor, #editor');
    if (editor) {
      const lines = editor.querySelectorAll('.view-line, .margin-view-overlays');
      lines.forEach((l) => {
        const r = l.getBoundingClientRect();
        if (r.width > 20 && r.height > 8 && r.top < window.innerHeight && r.bottom > 0) {
          targetRects.push({ r, kind: 'code', color: '#67e8f9' });
        }
      });
    }

    // 5. Testcase & Result Panels
    const consolePane = document.querySelector('[data-e2e-locator="console-result"], [data-e2e-locator*="console"]');
    if (consolePane) {
      const r = consolePane.getBoundingClientRect();
      if (r.width > 20 && r.height > 20) {
        targetRects.push({ r, kind: 'console', color: '#94a3b8' });
      }
    }

    // 6. Layout Shell Root
    const layout = document.querySelector('.flexlayout__layout') || document.querySelector('#__next > div');
    if (layout) hiddenElements.add(layout);

    // Fallback: If no sub-elements found, use main panels
    if (targetRects.length < 5) {
      document.querySelectorAll('.flexlayout__tab').forEach((tab) => {
        const r = tab.getBoundingClientRect();
        if (r.width > 30 && r.height > 30) {
          targetRects.push({ r, kind: 'panel', color: '#cbd5e1' });
        }
      });
    }

    return { hiddenElements: Array.from(hiddenElements), targetRects };
  }

  /* ---- Generate Radial Blip Particles --------------------------------------- */
  function createParticleField(targetRects) {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const maxScreenDist = Math.hypot(cx, cy);
    const particles = [];

    targetRects.forEach(({ r, kind, color, countMul }) => {
      const mul = countMul || 1;
      const count = Math.min(110, Math.max(10, Math.round(((r.width * r.height) / 380) * mul)));

      for (let i = 0; i < count; i++) {
        const ox = r.left + Math.random() * r.width;
        const oy = r.top + Math.random() * r.height;

        // Vector from screen center (Radial Explosion)
        const dx = ox - cx;
        const dy = oy - cy;
        const distFromCenter = Math.hypot(dx, dy) || 1;
        const nx = dx / distFromCenter;
        const ny = dy / distFromCenter;

        // Slight chaotic angular swirl
        const swirlAngle = rnd(-0.28, 0.28);
        const ux = nx * Math.cos(swirlAngle) - ny * Math.sin(swirlAngle);
        const uy = nx * Math.sin(swirlAngle) + ny * Math.cos(swirlAngle);

        // Outward blast distance based on distance from center
        const blastDist = rnd(190, 560) * (0.65 + 0.35 * (distFromCenter / maxScreenDist));

        // Cosmic zero-g drift in void
        const driftVx = rnd(-22, 22);
        const driftVy = rnd(-40, 20);

        particles.push({
          ox, oy,
          x: ox, y: oy,
          // Blast target in void
          blastX: ox + ux * blastDist + driftVx,
          blastY: oy + uy * blastDist + driftVy,
          distFromCenter,
          delay: (distFromCenter / maxScreenDist) * 0.38, // Shockwave reaches closer elements first
          size: rnd(1.3, 3.4),
          kind,
          baseColor: color || '#e2e8f0',
          sparklePhase: rnd(0, Math.PI * 2),
          sparkleSpeed: rnd(2.5, 6.0)
        });
      }
    });

    return particles;
  }

  /* ---- Draw Doctor Strange Mystic Tao Mandala (Eye of Agamotto) ------------- */
  function drawDoctorStrangeMandala(ctx, cx, cy, radius, alpha, angle, timeStonePulse) {
    if (alpha <= 0.005) return;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.globalAlpha = alpha;

    // 1. Cosmic Emerald Ambient Aura
    const aura = ctx.createRadialGradient(0, 0, radius * 0.15, 0, 0, radius * 1.45);
    aura.addColorStop(0, 'rgba(16, 185, 129, 0.42)');
    aura.addColorStop(0.45, 'rgba(52, 211, 153, 0.22)');
    aura.addColorStop(0.85, 'rgba(5, 150, 105, 0.08)');
    aura.addColorStop(1, 'rgba(5, 150, 105, 0)');
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.45, 0, Math.PI * 2);
    ctx.fill();

    // 2. Outer Rotating Cog Runic Ring
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Concentric Runic Band
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.88, 0, Math.PI * 2);
    ctx.stroke();

    // Mystic Outer Teeth / Runic Spoke Glyphs
    const teeth = 24;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * Math.PI * 2;
      const r1 = radius * 0.88;
      const r2 = radius * (i % 2 === 0 ? 1.08 : 1.03);
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.stroke();
    }

    // 3. Sacred Geometry Squares (The Mirror Dimension Shields)
    ctx.save();
    ctx.rotate(-angle * 1.8); // Counter-rotates for hypnotic dimensional depth
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#6ee7b7';
    const side = radius * 0.68;
    for (let k = 0; k < 3; k++) {
      ctx.save();
      ctx.rotate((k * Math.PI) / 6);
      ctx.strokeRect(-side / 2, -side / 2, side, side);
      ctx.restore();
    }
    ctx.restore();

    // 4. Middle Concentric Ring
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.44, 0, Math.PI * 2);
    ctx.stroke();

    // 5. The Eye of Agamotto Center Amulet
    const eyeR = radius * 0.32;
    ctx.save();
    // Golden Eye Housing
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 12;

    // Eye Contour
    ctx.beginPath();
    ctx.ellipse(0, 0, eyeR, eyeR * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Radiant Time Stone Core
    const pulseR = eyeR * (0.42 + 0.12 * Math.sin(timeStonePulse));
    const stoneGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, pulseR * 1.8);
    stoneGlow.addColorStop(0, '#ffffff');
    stoneGlow.addColorStop(0.28, '#a7f3d0');
    stoneGlow.addColorStop(0.65, '#10b981');
    stoneGlow.addColorStop(1, 'rgba(5, 150, 105, 0)');
    ctx.fillStyle = stoneGlow;
    ctx.beginPath();
    ctx.arc(0, 0, pulseR * 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Eye Iris Slit
    ctx.fillStyle = '#022c22';
    ctx.beginPath();
    ctx.ellipse(0, 0, pulseR * 0.35, pulseR * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  /* ---- Draw Marvel Cinematic Story HUD ------------------------------------- */
  function drawStoryHUD(ctx, cx, cy, state, stateTime, info) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (state === 'BLIP' || state === 'JUDGING') {
      const alpha = Math.min(1, stateTime / 0.5);
      ctx.globalAlpha = alpha;

      // Top Marvel Badge
      ctx.font = '700 11px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.letterSpacing = '0.18em';
      ctx.fillStyle = '#34d399';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 10;
      ctx.fillText('[ SACRED TIMELINE VARIANT DETECTED · EARTH-616 ]', cx, cy - 170);

      // Main Marvel Cinematic Header
      ctx.font = '800 21px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 16;
      ctx.fillText('THE EYE OF AGAMOTTO IS JUDGING YOUR REALITY', cx, cy - 138);

      // Rotating Dynamic Subtext
      const subLines = [
        'PEERING INTO 14,000,605 FUTURE TIMELINES...',
        'MEASURING ASYMPTOTIC RUNTIME CONVERGENCE...',
        'AWAITING SACRED TIMELINE VERDICT FROM LEETCODE...'
      ];
      const lineIdx = Math.floor(stateTime / 2.2) % subLines.length;
      ctx.font = '500 13px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.shadowBlur = 6;
      ctx.fillText(subLines[lineIdx], cx, cy + 155);

    } else if (state === 'REWIND') {
      const p = Math.min(1, stateTime / 1.1);
      ctx.globalAlpha = 1;

      // Golden & Emerald Reversal Banner
      ctx.font = '700 12px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.fillText('// TIME STONE ACTIVE · REVERSING REALITY //', cx, cy - 165);

      ctx.font = '800 24px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#34d399';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 20;
      ctx.fillText('SACRED TIMELINE RESTORED', cx, cy - 132);

      const beatsText = info && info.beats ? `FASTER THAN ${info.beats}% OF ALL MULTIVERSE VARIANTS` : 'ALL TEST CASES CONVERGED IN EARTH-616';
      ctx.font = '600 14px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.shadowBlur = 8;
      ctx.fillText(beatsText, cx, cy + 150);

    } else if (state === 'PRUNED') {
      ctx.globalAlpha = Math.min(1, stateTime / 0.3);
      ctx.font = '700 12px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#f87171';
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;
      ctx.fillText('// NEXUS EVENT DETECTED //', cx, cy - 160);

      ctx.font = '800 24px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#fca5a5';
      ctx.shadowColor = '#f87171';
      ctx.shadowBlur = 18;
      ctx.fillText('TIMELINE PRUNED · VARIANT RESET', cx, cy - 128);

      ctx.font = '500 13px "Inter", "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.shadowBlur = 6;
      ctx.fillText('RESETTING QUANTUM STATE FOR NEXT ITERATION...', cx, cy + 145);
    }

    ctx.restore();
  }

  /* ---- The Full Cinematic Moment Engine ------------------------------------- */
  function startMarvelCinematicEngine(initialAction) {
    clearActiveAnimation();
    if (!isThemeActive()) return null;

    const { hiddenElements, targetRects } = gatherPageElements();
    if (!targetRects.length) return null;

    // Create Fullscreen Canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'lcts-timestone-canvas';
    canvas.width = window.innerWidth * window.devicePixelRatio;
    canvas.height = window.innerHeight * window.devicePixelRatio;
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const particles = createParticleField(targetRects);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const mandalaRadius = Math.min(window.innerWidth, window.innerHeight) * 0.22;

    let state = 'BLIP'; // 'BLIP' -> 'JUDGING' -> 'REWIND' -> 'DONE' (or 'PRUNED')
    let stateStartTime = performance.now();
    let mandalaAngle = 0;
    let mandalaAlpha = 0;
    let hiddenApplied = false;
    let pendingVerdictInfo = null;
    let isTerminated = false;
    let animFrame = 0;

    // Initial Sonic Cue: Gauntlet Snap
    playSound('snap');

    function cleanup() {
      if (isTerminated) return;
      isTerminated = true;
      cancelAnimationFrame(animFrame);
      stopSounds();

      // Ensure page elements are 100% visible and pristine
      hiddenElements.forEach((el) => {
        if (el && el.classList) el.classList.remove('lcts-blip-hidden');
      });

      if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
      window.removeEventListener('keydown', skip);
      window.removeEventListener('click', skip);
      activeAnimation = null;
    }

    function skip() {
      cleanup();
    }

    window.addEventListener('keydown', skip, { once: true });
    window.addEventListener('click', skip, { once: true });

    // Transition to Verdict Result
    function handleVerdict(v) {
      if (isTerminated) return;
      pendingVerdictInfo = v;
      if (v.kind === 'ac' || (v.action === 'run' && v.kind === 'run')) {
        state = 'REWIND';
        stateStartTime = performance.now();
        playSound('timerewind');
      } else {
        state = 'PRUNED';
        stateStartTime = performance.now();
        playSound('prune');
      }
    }

    function frame(now) {
      if (isTerminated) return;
      const stateTime = (now - stateStartTime) / 1000;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Render Cosmic Dark Multiverse Void Background
      const bgAlpha = state === 'BLIP' ? Math.min(0.96, stateTime * 1.8) : (state === 'REWIND' ? Math.max(0, 0.96 * (1 - (stateTime - 0.7) / 0.5)) : 0.96);
      ctx.fillStyle = `rgba(9, 12, 16, ${bgAlpha})`;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      // Phase 1: Radial Blip Disintegration (0.0s - 1.2s)
      if (state === 'BLIP') {
        mandalaAngle += 0.015;
        mandalaAlpha = Math.min(0.85, stateTime / 1.0);

        // Hide real DOM elements once shockwave sweeps outward
        if (stateTime >= 0.28 && !hiddenApplied) {
          hiddenApplied = true;
          hiddenElements.forEach((el) => el.classList.add('lcts-blip-hidden'));
          playSound('whoosh');
        }

        // Particle Physics: Blast Outward radially from center
        particles.forEach((p) => {
          const pt = Math.max(0, stateTime - p.delay);
          const blastProg = easeOutCubic(Math.min(1, pt / 0.85));

          p.x = lerp(p.ox, p.blastX, blastProg);
          p.y = lerp(p.oy, p.blastY, blastProg);

          // Color transition: element color -> hot golden embers -> cooling ash
          const age = blastProg;
          const color = age < 0.35 ? '#fbbf24' : (age < 0.7 ? '#f59e0b' : (age < 0.9 ? '#94a3b8' : '#475569'));
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        });

        // Blinding Center Flash at launch
        if (stateTime < 0.45) {
          const flashProgress = stateTime / 0.45;
          const flashR = flashProgress * Math.hypot(cx, cy) * 0.9;
          const flash = ctx.createRadialGradient(cx, cy, 0, cx, cy, flashR);
          flash.addColorStop(0, `rgba(255, 255, 255, ${1 - flashProgress})`);
          flash.addColorStop(0.3, `rgba(245, 158, 11, ${(1 - flashProgress) * 0.7})`);
          flash.addColorStop(0.7, `rgba(16, 185, 129, ${(1 - flashProgress) * 0.4})`);
          flash.addColorStop(1, 'rgba(16, 185, 129, 0)');
          ctx.fillStyle = flash;
          ctx.beginPath();
          ctx.arc(cx, cy, flashR, 0, Math.PI * 2);
          ctx.fill();
        }

        if (stateTime >= 1.2) {
          state = 'JUDGING';
          stateStartTime = now;
          playSound('drone');
        }
      }

      // Phase 2: The Cosmic Judgment (Doctor Strange Eye of Agamotto)
      else if (state === 'JUDGING') {
        mandalaAngle += 0.02;
        mandalaAlpha = 1.0;

        // Ash particles float in zero-G drift in the cosmos
        particles.forEach((p) => {
          p.x = p.blastX + Math.sin(p.sparklePhase + stateTime * 1.5) * 8;
          p.y = p.blastY + Math.cos(p.sparklePhase + stateTime * 1.5) * 6;

          const sparkle = 0.5 + 0.5 * Math.sin(p.sparklePhase + stateTime * p.sparkleSpeed);
          ctx.fillStyle = sparkle > 0.7 ? '#f59e0b' : '#64748b';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.8 + 0.3 * sparkle), 0, Math.PI * 2);
          ctx.fill();
        });

        // Periodic mystical time ticking
        if (Math.floor(stateTime * 2) !== Math.floor((stateTime - 0.016) * 2)) {
          playSound('tick');
        }

        // Watchdog: If verdict takes longer than 14 seconds, safely resolve
        if (stateTime > 14) {
          handleVerdict({ kind: 'ac', action: initialAction || 'submit', beats: '99.1' });
        }
      }

      // Phase 3: The Time Reversal (Doctor Strange Time Stone Rewind)
      else if (state === 'REWIND') {
        mandalaAngle -= 0.055; // Counter-clockwise high-speed temporal spin
        const rewindProgress = Math.min(1, stateTime / 1.05);
        const easedRewind = easeInOutCubic(rewindProgress);

        // Every single particle reverses along its outward path back into ox, oy
        particles.forEach((p) => {
          // Temporal spiral vortex towards original position
          const spiralAngle = (1 - easedRewind) * Math.PI * 3.5;
          const radiusOffset = Math.sin(easedRewind * Math.PI) * 45;
          const vx = Math.cos(spiralAngle) * radiusOffset;
          const vy = Math.sin(spiralAngle) * radiusOffset;

          p.x = lerp(p.blastX + vx, p.ox, easedRewind);
          p.y = lerp(p.blastY + vy, p.oy, easedRewind);

          // Ignite into Time Stone emerald energy
          const color = rewindProgress > 0.65 ? '#34d399' : '#10b981';
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 + 0.5 * Math.sin(rewindProgress * Math.PI)), 0, Math.PI * 2);
          ctx.fill();
        });

        // Particles have returned: Shockwave reassembles page
        if (rewindProgress >= 0.98 && hiddenApplied) {
          hiddenApplied = false;
          hiddenElements.forEach((el) => el.classList.remove('lcts-blip-hidden'));
        }

        if (stateTime >= 1.05) {
          mandalaAlpha = Math.max(0, 1 - (stateTime - 1.05) / 0.6);
        }

        if (stateTime >= 1.7) {
          cleanup();
          return;
        }
      }

      // Phase 4: Nexus Variant Pruned (Wrong Answer / Error)
      else if (state === 'PRUNED') {
        mandalaAlpha = Math.max(0, 1 - stateTime / 0.8);
        if (hiddenApplied && stateTime >= 0.3) {
          hiddenApplied = false;
          hiddenElements.forEach((el) => el.classList.remove('lcts-blip-hidden'));
        }
        if (stateTime >= 1.0) {
          cleanup();
          return;
        }
      }

      // Draw Doctor Strange Tao Mandala
      drawDoctorStrangeMandala(ctx, cx, cy, mandalaRadius, mandalaAlpha, mandalaAngle, now * 0.006);

      // Draw Marvel Cinematic Story HUD
      drawStoryHUD(ctx, cx, cy, state, stateTime, pendingVerdictInfo);

      animFrame = requestAnimationFrame(frame);
    }

    animFrame = requestAnimationFrame(frame);

    activeAnimation = { cleanup, handleVerdict };
    return activeAnimation;
  }

  /* ---- Click & Arm Handlers ------------------------------------------------- */
  function onRunOrSubmitAction(action) {
    if (!isThemeActive()) return;
    startMarvelCinematicEngine(action);
  }

  // 1. Direct click capture on Submit and Run buttons
  document.addEventListener('click', (e) => {
    if (!isThemeActive()) return;
    const t = e.target;
    if (!t || !t.closest) return;

    if (t.closest('[data-e2e-locator="console-submit-button"], [data-e2e-locator="submit-button"], button[data-cypress="SubmitCode"], [data-track-load="description_submit_btn"]')) {
      onRunOrSubmitAction('submit');
    } else if (t.closest('[data-e2e-locator="console-run-button"], [data-e2e-locator="run-code-btn"], button[data-cypress="RunCode"], [data-track-load="description_run_btn"]')) {
      onRunOrSubmitAction('run');
    } else {
      const btn = t.closest('button');
      if (btn) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text === 'submit' || text.startsWith('submit')) onRunOrSubmitAction('submit');
        else if (text === 'run' || text.startsWith('run')) onRunOrSubmitAction('run');
      }
    }
  }, true);

  // 2. Keyboard shortcuts (Ctrl/Cmd+Enter for Submit, Ctrl/Cmd+' for Run)
  document.addEventListener('keydown', (e) => {
    if (!isThemeActive()) return;
    if (!(e.ctrlKey || e.metaKey) || e.repeat) return;
    if (e.key === 'Enter') onRunOrSubmitAction('submit');
    else if (e.key === "'") onRunOrSubmitAction('run');
  }, true);

  // 3. Custom event from src/verdict.js
  document.addEventListener('lcts:arm', (e) => {
    if (!isThemeActive()) return;
    const action = e.detail && e.detail.action ? e.detail.action : 'submit';
    if (!activeAnimation) onRunOrSubmitAction(action);
  });

  // 4. LCTSVerdict subscriber for final result
  function onVerdict(v) {
    if (!isThemeActive()) return;
    if (activeAnimation) {
      activeAnimation.handleVerdict(v);
    } else {
      // If animation was not already running (e.g. ultra-fast response), launch cinematic rewind
      const anim = startMarvelCinematicEngine(v.action || 'submit');
      if (anim) anim.handleVerdict(v);
    }
  }

  if (globalThis.LCTSVerdict) {
    globalThis.LCTSVerdict.subscribe(onVerdict);
  }

  root.LCTSTimeStone = {
    start: startMarvelCinematicEngine,
    simulate: () => {
      const anim = startMarvelCinematicEngine('submit');
      setTimeout(() => {
        if (anim) anim.handleVerdict({ kind: 'ac', action: 'submit', beats: '98.8' });
      }, 1500);
    }
  };
})();
