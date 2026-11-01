/* =============================================================================
   sounds.js — the moments' sound effects, synthesised live with Web Audio.

   No audio files: every effect is built from oscillators, filtered noise and
   a short generated reverb, so nothing is downloaded, nothing needs a licence,
   and each sound is timed to its moment's choreography in themes/anime.css
   (the Accepted stamp lands at ~0.42s, the Wrong Answer thud at ~0.34s, the
   time-out bar drains from 0.25s to 1.15s).

   COST CONTROL
   The AudioContext is created on the first moment that plays, not on page
   load, and suspended again a few seconds after the last sound, so the audio
   thread is not left running while you code. A sound is a handful of nodes
   that the browser discards when they finish.

   Browsers only allow audio after the user has interacted with the site. A
   verdict always follows a Run or Submit, so it sounds; a title card sounds
   whenever Chrome allows it -- after you clicked on this or an earlier
   leetcode.com page. On a truly cold visit (a bookmark, a new window) Chrome
   would block it, so the card plays silently without touching Web Audio
   (no "AudioContext was not allowed to start" warning). See "WHEN SOUND IS
   ALLOWED".
============================================================================= */
(function (root) {
  'use strict';

  let ctx = null, bus = null, sleepTimer = 0;

  /* ---- the signal chain: voices -> dry + reverb -> compressor -> volume ---- */
  function chain(ac, volume) {
    const out = ac.createGain();
    out.gain.value = volume;
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    comp.connect(out);
    out.connect(ac.destination);

    const dry = ac.createGain(); dry.connect(comp);
    const verb = ac.createConvolver();
    verb.buffer = impulse(ac, 1.8, 2.6);
    const wet = ac.createGain(); wet.gain.value = 0.32;
    verb.connect(wet); wet.connect(comp);

    const noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    return { ac, out, dry, verb, noise };
  }

  /* a stereo room: decaying noise, slightly different per channel */
  function impulse(ac, seconds, decay) {
    const len = Math.floor(ac.sampleRate * seconds);
    const buf = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = buf.getChannelData(c);
      for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  /* ---- voices ----------------------------------------------------------------
     t is seconds from the start of the sound. Every envelope ends at silence,
     so nothing clicks and every node can stop. */
  function tone(b, t, o) {
    const ac = b.ac, at = ac.currentTime + t;
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.freq, at);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, at + (o.glide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    if (o.vibrato) {
      const lfo = ac.createOscillator(), depth = ac.createGain();
      lfo.frequency.value = o.vibrato; depth.gain.value = o.freq * 0.012;
      lfo.connect(depth); depth.connect(osc.frequency);
      lfo.start(at); lfo.stop(at + o.dur + 0.05);
    }
    const g = ac.createGain();
    const peak = o.gain || 0.2, attack = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    let node = osc;
    if (o.lowpass) {
      const f = ac.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = o.lowpass; f.Q.value = o.q || 0.7;
      osc.connect(f); node = f;
    }
    node.connect(g);
    g.connect(b.dry);
    if (o.wet) { const s = ac.createGain(); s.gain.value = o.wet; g.connect(s); s.connect(b.verb); }
    osc.start(at); osc.stop(at + o.dur + 0.05);
  }

  function noise(b, t, o) {
    const ac = b.ac, at = ac.currentTime + t;
    const src = ac.createBufferSource();
    src.buffer = b.noise; src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq, at);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, at + o.dur);
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    const peak = o.gain || 0.2, attack = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
    src.connect(f); f.connect(g); g.connect(b.dry);
    if (o.wet) { const s = ac.createGain(); s.gain.value = o.wet; g.connect(s); s.connect(b.verb); }
    src.start(at); src.stop(at + o.dur + 0.05);
  }

  /* a taiko-like hit: a pitched body dropping fast, plus the stick */
  function drum(b, t, pitch, gain) {
    tone(b, t, { freq: pitch, to: pitch * 0.45, glide: 0.22, dur: 0.55, gain, attack: 0.003, wet: 0.25 });
    tone(b, t, { freq: pitch * 2.02, to: pitch * 0.9, glide: 0.08, dur: 0.12, gain: gain * 0.25, attack: 0.002 });
    noise(b, t, { filter: 'lowpass', freq: 1400, dur: 0.07, gain: gain * 0.35, attack: 0.001 });
  }

  const N = (semis) => 440 * Math.pow(2, semis / 12);   // semitones from A4

  /* ---- the effects -------------------------------------------------------------- */
  const EFFECTS = {
    /* episode title card: a whoosh as the letterbox closes, the "don" of a
       series opening as the episode number lands, a shimmer along the rule */
    title(b) {
      noise(b, 0, { freq: 380, to: 3200, dur: 0.34, gain: 0.16, q: 0.9, attack: 0.2, wet: 0.2 });
      drum(b, 0.2, 96, 0.9);
      drum(b, 0.2, 48, 0.35);
      [N(19), N(26), N(31), N(38)].forEach((f, i) =>
        tone(b, 0.34 + i * 0.055, { freq: f, dur: 1.1, gain: 0.05, attack: 0.004, wet: 0.9 }));
    },

    /* Accepted: a riser into the flash, a hit, the stamp slamming down, then a
       bright major chord that rings out with a sparkle on top */
    ac(b) {
      noise(b, 0, { filter: 'highpass', freq: 600, to: 7000, dur: 0.22, gain: 0.14, attack: 0.18 });
      drum(b, 0.02, 82, 0.8);
      noise(b, 0.02, { freq: 900, to: 180, dur: 0.35, gain: 0.12, q: 0.6 });
      drum(b, 0.41, 120, 0.75);
      const chord = [N(5), N(9), N(12), N(17)];                 // D5 F#5 A5 D6
      chord.forEach((f, i) => {
        tone(b, 0.45 + i * 0.06, { type: 'triangle', freq: f, dur: 1.5, gain: 0.11, attack: 0.006, wet: 0.55 });
        tone(b, 0.45 + i * 0.06, { type: 'sine', freq: f * 2, dur: 0.9, gain: 0.035, attack: 0.004, wet: 0.6 });
      });
      tone(b, 0.72, { freq: N(29), dur: 1.3, gain: 0.05, vibrato: 6, attack: 0.02, wet: 1 });   // D7
      tone(b, 0.45, { type: 'sine', freq: N(-7), dur: 1.2, gain: 0.12, attack: 0.01 });          // D4 floor
    },

    /* tests passed: a light two-note "pi-pin" */
    run(b) {
      tone(b, 0.04, { type: 'triangle', freq: N(14), dur: 0.24, gain: 0.26, wet: 0.35 });   // B5
      tone(b, 0.14, { type: 'triangle', freq: N(19), dur: 0.65, gain: 0.26, wet: 0.45 });   // E6
      tone(b, 0.14, { freq: N(7), dur: 0.5, gain: 0.1, wet: 0.3 });                         // E5 body
      tone(b, 0.14, { freq: N(31), dur: 0.45, gain: 0.05, wet: 0.6 });                      // E7 air
    },

    /* running testcases: a razor-sharp katana draw / unsheathing slice whoosh */
    'run-start'(b) {
      noise(b, 0, { filter: 'bandpass', freq: 2800, to: 7500, dur: 0.22, gain: 0.18, q: 3.5, attack: 0.01, wet: 0.35 });
      tone(b, 0.02, { type: 'triangle', freq: 180, to: 65, glide: 0.08, dur: 0.12, gain: 0.15, attack: 0.002 });
      tone(b, 0.05, { type: 'sine', freq: N(28), to: N(31), dur: 0.38, gain: 0.12, attack: 0.005, wet: 0.55 });
      tone(b, 0.08, { type: 'triangle', freq: N(40), dur: 0.25, gain: 0.04, attack: 0.002, wet: 0.6 });
    },

    /* submitting: an epic sub-bass power swell, aura flare and resonant taiko chime */
    'submit-start'(b) {
      tone(b, 0, { type: 'sine', freq: 55, to: 110, glide: 0.3, dur: 0.5, gain: 0.28, attack: 0.03, wet: 0.2 });
      noise(b, 0.02, { filter: 'bandpass', freq: 450, to: 2800, dur: 0.42, gain: 0.2, q: 1.8, attack: 0.05, wet: 0.4 });
      drum(b, 0.16, 90, 0.65);
      [N(5), N(12), N(17)].forEach((f, i) =>
        tone(b, 0.18 + i * 0.04, { type: 'sine', freq: f, dur: 0.85, gain: 0.08, attack: 0.005, wet: 0.65 }));
    },

    /* Wrong Answer: two drooping notes, the classic "not quite", and a dull
       thud when the stamp lands */
    wa(b) {
      tone(b, 0.02, { type: 'sawtooth', freq: N(-2), to: N(-3), glide: 0.2, dur: 0.26, gain: 0.1, lowpass: 1100, attack: 0.012 });
      tone(b, 0.3, { type: 'sawtooth', freq: N(-5), to: N(-9), glide: 0.45, dur: 0.62, gain: 0.11, lowpass: 900, attack: 0.012, wet: 0.2 });
      drum(b, 0.34, 58, 0.55);
    },

    /* Wrong Answer on Submit synth fallback: dizzy wobbly slide and cartoon stars */
    'wa-submit'(b) {
      tone(b, 0.02, { type: 'sawtooth', freq: N(2), to: N(-8), glide: 0.6, vibrato: 8, dur: 0.7, gain: 0.12, lowpass: 850, attack: 0.01, wet: 0.3 });
      [0.2, 0.35, 0.5, 0.65].forEach((t, i) =>
        tone(b, t, { type: 'sine', freq: N(20 + (i % 3) * 4), dur: 0.15, gain: 0.06, attack: 0.003, wet: 0.4 }));
      drum(b, 0.42, 50, 0.6);
    },

    /* Time Limit Exceeded: a clock ticking faster, then the power running
       out as the timer bar drains */
    tle(b) {
      [0, 0.12, 0.21, 0.27].forEach((t, i) =>
        noise(b, t, { freq: 3200 + i * 300, dur: 0.04, gain: 0.34, q: 6, attack: 0.001 }));
      tone(b, 0.25, { type: 'triangle', freq: 640, to: 110, glide: 0.9, dur: 0.95, gain: 0.22, attack: 0.01, wet: 0.2 });
      tone(b, 0.25, { type: 'sine', freq: 320, to: 55, glide: 0.9, dur: 0.95, gain: 0.16, attack: 0.01 });
    },

    /* Memory Limit Exceeded: something too big deflating */
    mle(b) {
      tone(b, 0.05, { type: 'sawtooth', freq: 220, to: 60, glide: 0.8, dur: 0.9, gain: 0.12, lowpass: 700, attack: 0.02, wet: 0.2 });
      noise(b, 0.05, { filter: 'lowpass', freq: 900, to: 120, dur: 0.8, gain: 0.08, attack: 0.05 });
      drum(b, 0.34, 54, 0.45);
    },

    /* errors: digital glitch bursts and a low buzz, timed with the jitter */
    err(b) {
      for (let i = 0; i < 7; i++) {
        tone(b, 0.1 + i * 0.05, { type: 'square', freq: 700 + ((i * 523) % 1400), dur: 0.035, gain: 0.05, attack: 0.001 });
      }
      noise(b, 0.12, { filter: 'highpass', freq: 2500, dur: 0.3, gain: 0.07, attack: 0.002 });
      tone(b, 0.1, { type: 'sawtooth', freq: 82, dur: 0.5, gain: 0.08, lowpass: 600, attack: 0.01 });
      drum(b, 0.12, 70, 0.45);
    }
  };

  /* ---- Web Crawler: a network/terminal identity ---------------------------------
     Square-wave blips, modem-style sweeps and static bursts instead of taiko hits
     and pentatonic chords. Timed to the same choreography in themes/crawler.css. */
  const EFFECTS_CRAWLER = {
    /* opening a problem: a handshake sweep climbing into two data blips */
    title(b) {
      tone(b, 0, { type: 'square', freq: 220, to: 1800, glide: 0.32, dur: 0.34, gain: 0.22, lowpass: 4000, attack: 0.01, wet: 0.2 });
      noise(b, 0.28, { filter: 'bandpass', freq: 2400, dur: 0.06, gain: 0.24, q: 4, attack: 0.001 });
      tone(b, 0.36, { type: 'square', freq: N(24), dur: 0.1, gain: 0.28, attack: 0.003 });
      tone(b, 0.48, { type: 'square', freq: N(29), dur: 0.16, gain: 0.28, attack: 0.003 });
    },

    /* Accepted: a clean ascending confirm over a low sub landing */
    ac(b) {
      tone(b, 0, { type: 'sine', freq: 70, to: 48, glide: 0.3, dur: 0.4, gain: 0.36, attack: 0.005 });
      noise(b, 0.02, { filter: 'highpass', freq: 1500, dur: 0.08, gain: 0.14, attack: 0.002 });
      [N(12), N(19), N(24)].forEach((f, i) =>
        tone(b, 0.38 + i * 0.09, { type: 'square', freq: f, dur: 0.22, gain: 0.24, attack: 0.004, lowpass: 3200, wet: 0.35 }));
      tone(b, 0.65, { type: 'triangle', freq: N(24), dur: 0.55, gain: 0.17, attack: 0.01, wet: 0.5 });
    },

    /* tests passed: two short pings */
    run(b) {
      tone(b, 0.03, { type: 'square', freq: N(19), dur: 0.09, gain: 0.36, attack: 0.002, lowpass: 3000 });
      tone(b, 0.12, { type: 'square', freq: N(24), dur: 0.14, gain: 0.36, attack: 0.002, lowpass: 3000, wet: 0.3 });
    },

    'run-start'(b) {
      tone(b, 0, { type: 'square', freq: 440, to: 1760, glide: 0.12, dur: 0.15, gain: 0.25, lowpass: 3500, attack: 0.002 });
      noise(b, 0.08, { filter: 'highpass', freq: 3000, dur: 0.05, gain: 0.18, attack: 0.001 });
    },

    'submit-start'(b) {
      tone(b, 0, { type: 'square', freq: 110, to: 220, glide: 0.25, dur: 0.35, gain: 0.26, lowpass: 1800, attack: 0.01 });
      tone(b, 0.15, { type: 'square', freq: N(19), dur: 0.18, gain: 0.22, attack: 0.002 });
      tone(b, 0.28, { type: 'square', freq: N(24), dur: 0.25, gain: 0.25, attack: 0.002, wet: 0.3 });
    },

    /* Wrong Answer: a flat dissonant buzz, then a dull low drop */
    wa(b) {
      tone(b, 0.02, { type: 'square', freq: N(-4), dur: 0.16, gain: 0.2, lowpass: 900, attack: 0.008 });
      tone(b, 0.02, { type: 'square', freq: N(-4) * 1.06, dur: 0.16, gain: 0.16, lowpass: 900, attack: 0.008 });
      tone(b, 0.3, { type: 'sawtooth', freq: N(-9), to: N(-14), glide: 0.4, dur: 0.5, gain: 0.22, lowpass: 700, attack: 0.01 });
    },

    /* timeout: accelerating ticks into a long power-down sweep */
    tle(b) {
      [0, 0.1, 0.18, 0.24, 0.28].forEach((t) =>
        tone(b, t, { type: 'square', freq: 1200, dur: 0.03, gain: 0.32, attack: 0.001 }));
      tone(b, 0.25, { type: 'sawtooth', freq: 500, to: 70, glide: 0.9, dur: 0.95, gain: 0.3, lowpass: 1200, attack: 0.01 });
    },

    /* overflow: a rising tone that clips and cuts out */
    mle(b) {
      tone(b, 0, { type: 'sawtooth', freq: 90, to: 640, glide: 0.5, dur: 0.52, gain: 0.3, lowpass: 1400, attack: 0.02 });
      noise(b, 0.45, { filter: 'highpass', freq: 3000, dur: 0.1, gain: 0.22, attack: 0.001 });
    },

    /* trace failed: glitch bursts and a low buzz, timed with the on-screen jitter */
    err(b) {
      for (let i = 0; i < 6; i++) {
        tone(b, 0.1 + i * 0.05, { type: 'square', freq: 500 + ((i * 613) % 1600), dur: 0.03, gain: 0.14, attack: 0.001 });
      }
      noise(b, 0.1, { filter: 'bandpass', freq: 1800, dur: 0.28, gain: 0.18, q: 2, attack: 0.002 });
      tone(b, 0.1, { type: 'square', freq: 64, dur: 0.45, gain: 0.2, lowpass: 500, attack: 0.01 });
    }
  };

  /* ---- Pixel Art: a chiptune identity -----------------------------------------------
     Square, triangle and noise only, like an 8-bit console, timed to the
     wreck in src/pixel/pixel.js: the jetpack in, rocket at 0.5 s and its
     blast at 0.72 s, the railgun at 0.98 s, rocket two at 1.2 s / 1.42 s, the
     fire crackling, STAGE CLEAR! at 1.75 s, the rewind from 2.75 s. */
  const chip = (b, t, freq, dur, gain, type) =>
    tone(b, t, { type: type || 'square', freq, dur, gain: gain || 0.06, attack: 0.003, lowpass: 3600 });
  /* a gunshot: a hard crack, a chest thump, a short room tail */
  function gunAt(b, t, heavy) {
    noise(b, t, { filter: 'highpass', freq: 1400, dur: 0.07, gain: heavy ? 0.5 : 0.38, attack: 0.0008, wet: 0.35 });
    noise(b, t, { filter: 'lowpass', freq: 900, to: 200, dur: 0.16, gain: 0.34, attack: 0.001 });
    tone(b, t, { freq: 140, to: 42, glide: 0.12, dur: 0.2, gain: 0.45, attack: 0.001 });
  }
  /* an explosion: crack, sub-bass drop, a long rolling rumble in the room,
     a crunchy mid, then debris ticking down */
  function blastAt(b, t, big) {
    const k = big ? 1 : 0.8;
    noise(b, t, { filter: 'highpass', freq: 900, dur: 0.09, gain: 0.5 * k, attack: 0.0008 });
    tone(b, t, { freq: 72, to: 26, glide: 0.9, dur: big ? 1.4 : 1.1, gain: 0.6 * k, attack: 0.002 });
    noise(b, t, { filter: 'lowpass', freq: 1600, to: 70, dur: big ? 1.6 : 1.2, gain: 0.5 * k, attack: 0.003, wet: 0.45 });
    tone(b, t, { type: 'square', freq: 96, to: 30, glide: 0.45, dur: 0.55, gain: 0.16 * k, lowpass: 700, attack: 0.002 });
    drum(b, t, 58, 0.8 * k);
    for (let i = 0; i < 12; i++) noise(b, t + 0.15 + i * 0.07 + Math.random() * 0.05, { filter: 'bandpass', freq: 1500 + Math.random() * 3500, q: 3, dur: 0.035, gain: 0.07 * (1 - i / 14), attack: 0.001 });
  }
  const EFFECTS_PIXEL = {
    ac(b) {
      noise(b, 0, { filter: 'bandpass', freq: 900, to: 400, dur: 0.45, gain: 0.1, q: 0.8, attack: 0.05 });    // jetpack in
      gunAt(b, 0.5, true);                                                                                     // rocket out
      noise(b, 0.5, { filter: 'bandpass', freq: 500, to: 2600, dur: 0.24, gain: 0.16, q: 1.2, attack: 0.01 });
      blastAt(b, 0.72, true);
      tone(b, 0.8, { freq: 500, to: 3200, glide: 0.18, dur: 0.18, gain: 0.05, vibrato: 30, attack: 0.02 });   // railgun charge
      gunAt(b, 0.98, true);
      tone(b, 0.98, { type: 'sawtooth', freq: 2000, to: 80, glide: 0.3, dur: 0.36, gain: 0.1, lowpass: 7000, attack: 0.001, wet: 0.4 }); // zap
      noise(b, 0.98, { filter: 'highpass', freq: 3500, dur: 0.3, gain: 0.14, attack: 0.001 });
      gunAt(b, 1.2, false);
      noise(b, 1.2, { filter: 'bandpass', freq: 500, to: 2600, dur: 0.22, gain: 0.14, q: 1.2, attack: 0.01 });
      blastAt(b, 1.42, false);
      noise(b, 1.5, { filter: 'bandpass', freq: 700, dur: 1.1, gain: 0.05, q: 0.6, attack: 0.2 });           // fire roar
      [N(3), N(7), N(10), N(15)].forEach((f, i) => chip(b, 1.75 + i * 0.075, f, 0.09, 0.06));       // C5 E5 G5 C6
      [N(15), N(19), N(22)].forEach((f) => chip(b, 2.06, f, 0.7, 0.04, 'triangle'));
      chip(b, 2.06, N(15), 0.6, 0.035);
      tone(b, 2.75, { type: 'square', freq: 220, to: 1760, glide: 0.7, dur: 0.72, gain: 0.035, lowpass: 3000, attack: 0.05 }); // rewind
      noise(b, 2.75, { filter: 'bandpass', freq: 300, to: 3000, dur: 0.72, gain: 0.07, q: 1, attack: 0.1 });
      chip(b, 3.62, N(22), 0.3, 0.05); chip(b, 3.68, N(27), 0.45, 0.05);
    },
    /* the coin */
    run(b) { chip(b, 0.02, N(14), 0.08, 0.18); chip(b, 0.1, N(19), 0.5, 0.18); },
    'run-start'(b) { chip(b, 0.02, N(7), 0.06, 0.18); chip(b, 0.07, N(12), 0.12, 0.18); },
    'submit-start'(b) { chip(b, 0.02, N(3), 0.1, 0.2); chip(b, 0.12, N(8), 0.1, 0.2); chip(b, 0.22, N(15), 0.25, 0.22); },
    /* game over: a dud shot, then four falling notes */
    wa(b) {
      noise(b, 0, { filter: 'lowpass', freq: 600, to: 150, dur: 0.25, gain: 0.3, attack: 0.002 });
      [N(-2), N(-3), N(-4), N(-5)].forEach((f, i) => chip(b, 0.12 + i * 0.16, f, i === 3 ? 0.5 : 0.15, 0.2));
    },
    tle(b) {
      [0, 0.1, 0.2].forEach((t) => chip(b, t, N(7), 0.05, 0.16));
      tone(b, 0.32, { type: 'square', freq: 880, to: 110, glide: 0.7, dur: 0.75, gain: 0.16, lowpass: 3000, attack: 0.004 });
    },
    mle(b) { tone(b, 0.02, { type: 'square', freq: 330, to: 55, glide: 0.8, dur: 0.85, gain: 0.2, lowpass: 2400, attack: 0.004 }); },
    err(b) {
      for (let i = 0; i < 6; i++) chip(b, 0.02 + i * 0.045, 300 + ((i * 587) % 1300), 0.035, 0.15);
      chip(b, 0.3, 98, 0.35, 0.2);
    }
  };
  const PACKS = { crawler: EFFECTS_CRAWLER, pixel: EFFECTS_PIXEL };

  /* ---- Web Crawler: your own recordings -------------------------------------------
     A moment can play a recorded file instead of its synthesised effect. List
     the file under the moment's name and drop it in audio/crawler/ -- see the
     README there for length, format and level. A moment with no entry (or
     whose file fails to load) keeps its synthesised sound, so this can be
     filled in one moment at a time.

       kinds:  title | ac | run | wa | tle | mle | err
       e.g.    ac: 'ac.mp3'

     The files are fetched and decoded once, lazily, when the theme is on
     (warm(), called from moments.js). They are decoded through an
     OfflineAudioContext, not the live one, so nothing touches the audio
     hardware -- and no autoplay warning -- until a moment actually plays. */
  const CRAWLER_FILES = {
    wa: 'wa.mp3',
    run: 'run.mp3',
    mle: 'mle.mp3'
  };

  /* Anime Studio uses the same mechanism, from audio/anime/. Wrong Answer is a
     recorded cartoon "dizzy" spin, for a Wrong Answer on SUBMIT (the hidden
     tests); themes/anime.css times the dizzy moment to it. */
  const ANIME_FILES = {
    'wa-submit': 'wrong_answer.mp3'     // Wrong Answer on Submit only; Run keeps the synth
  };

  const FILES = { anime: ANIME_FILES, crawler: CRAWLER_FILES, grid: ANIME_FILES };

  /* A recording is never allowed to outlast its moment: it is cut at the
     moment's own length (the --dur values in themes/crawler.css, i.e. how long
     the overlay is on screen) with a short fade so the cut doesn't click. A
     shorter file simply plays out. Keep these in step with those durations. */
  const MOMENT_SECONDS = { title: 2.3, ac: 1.7, run: 1.15, wa: 1.35, tle: 1.35, mle: 1.35, err: 1.35, 'run-start': 1.0, 'submit-start': 1.2 };
  /* the anime dizzy Wrong Answer runs longer than the crawler's (anime.css) */
  const MOMENT_SECONDS_ANIME = { 'wa-submit': 1.75 };
  const FADE = 0.25;

  let playing = null;       // the recording sounding now: { ac, gain, src }

  /* fade out whatever recording is playing (a new moment starting, or the
     title card being dismissed) */
  function stop(fade) {
    const p = playing;
    if (!p) return;
    playing = null;
    fade = fade === undefined ? 0.15 : fade;
    const g = p.gain.gain, t = p.ac.currentTime;
    try {
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + fade);
      p.src.stop(t + fade + 0.02);
    } catch (e) { /* already stopped */ }
  }

  const recorded = { anime: {}, crawler: {}, grid: {} };   // theme -> kind -> AudioBuffer
  const warmed = {};
  /* fetch and decode one theme's recordings, once */
  function warm(themeId) {
    try {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !chrome.runtime.getURL) return;
      themeId = themeId || currentTheme();
      const files = FILES[themeId];
      if (!files || warmed[themeId]) return;
      warmed[themeId] = true;
      const kinds = Object.keys(files);
      if (!kinds.length) return;
      const dec = new OfflineAudioContext(2, 1, 44100);
      kinds.forEach((kind) => {
        try {
          if (!chrome.runtime?.id) return;
          const url = chrome.runtime.getURL('audio/' + themeId + '/' + files[kind]);
          fetch(url)
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
            .then((data) => dec.decodeAudioData(data))
            .then((buf) => { recorded[themeId][kind] = buf; })
            .catch(() => {});
        } catch (e) {}
      });
    } catch (e) {}
  }

  function sample(b, buf, kind, themeId) {
    const ac = b.ac, t0 = ac.currentTime;
    const limit = (themeId === 'anime' && MOMENT_SECONDS_ANIME[kind]) || MOMENT_SECONDS[kind] || 2;
    const cut = buf.duration > limit;
    stop(0.06);                       // a moment right after another one replaces it
    const src = ac.createBufferSource();
    src.buffer = buf;
    const gain = ac.createGain();
    gain.gain.setValueAtTime(1, t0);
    if (cut) {
      const fade = Math.min(FADE, limit / 3);
      gain.gain.setValueAtTime(1, t0 + limit - fade);
      gain.gain.linearRampToValueAtTime(0, t0 + limit);
    }
    src.connect(gain);
    gain.connect(b.dry);
    src.start(t0);
    if (cut) src.stop(t0 + limit + 0.02);
    const me = { ac, gain, src };
    playing = me;
    src.onended = () => { if (playing === me) playing = null; };
  }

  /* ---- playing ------------------------------------------------------------------
     WHEN SOUND IS ALLOWED
     Chrome lets a page start audio once the user has interacted with the SITE,
     not only with this page: after a click on the problem list or another
     problem, the next leetcode.com page may play sound too. That page's own
     navigator.userActivation.hasBeenActive is still false, so gating on it (as
     this file used to) silenced title cards exactly when you browsed from one
     problem to the next, while a refresh sometimes sounded.
     So the page plays only once it has been clicked itself (hasBeenActive,
     which Chrome never gets wrong). Before that -- a problem opened from the
     address bar, a reload, a new tab -- the sound goes to the extension's
     offscreen page (src/offscreen.js), which Chrome's autoplay rule does not
     bind. Guessing from sessionStorage/referrer whether Chrome carried an
     earlier click over was tried and failed on reloads.
     Never create or resume a page AudioContext Chrome will refuse: that logs
     "The AudioContext was not allowed to start", which lands in
     chrome://extensions' Errors list, attributed to us.
     Even when allowed we still play only if the context is actually running:
     nothing is ever scheduled on a blocked context, because those nodes
     would all fire late, at your first click.
     The first pointer or key press on the page also unlocks audio silently, so
     every moment after it is sure to sound. */
  /* send a sound to the offscreen page; true if sent. The message reaches
     src/offscreen.js directly when it is open (no hop), and background.js
     opens it and forwards the message when it is not. */
  function handOff(msg) {
    try {
      if (!(typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id)) return false;
      if (!/^https?:/.test(location.protocol)) return false;       // extension pages play themselves
      msg = Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2) }, msg);
      chrome.runtime.sendMessage({ type: 'lcts-sound', msg }).catch(() => {});
      return true;
    } catch (e) { return false; }
  }
  /* open the offscreen page early and start its audio, so a title card on a
     cold tab sounds on its beat, not after the audio device has opened */
  let primed = '';
  function prime(themeId) {
    if (primed === themeId || mayStart()) return;
    if (handOff({ op: 'warm', theme: themeId })) primed = themeId;
  }
  function mayStart() {
    if (ctx && ctx.state === 'running') return true;
    const ua = navigator.userActivation;
    if (ua) return Boolean(ua.hasBeenActive);
    return false;
  }
  /* offscreen page: open the audio device now and keep it running for `ms`,
     so the next sound starts at once */
  let holdUntil = 0;
  function wake(ms) {
    try {
      if (!mayStart()) return;
      ensureContext(0.6);
      holdUntil = Math.max(holdUntil, performance.now() + ms);
      running().then(sleepSoon);
    } catch (e) {}
  }
  function currentTheme() {
    return document.documentElement.getAttribute('data-lc-theme')
      || document.documentElement.getAttribute('data-lct-theme')
      || '';
  }

  function ensureContext(volume) {
    if (!ctx) {
      if (!mayStart() && typeof location !== 'undefined' && /^https?:/.test(location.protocol)) {
        return null;
      }
      ctx = new AudioContext({ latencyHint: 'interactive' });
      bus = chain(ctx, volume);
    }
    return ctx;
  }

  /* resolves true when the context is running, false if the browser blocks it */
  function running() {
    if (!ctx) return Promise.resolve(false);
    if (ctx.state === 'running') return Promise.resolve(true);
    if (!mayStart()) return Promise.resolve(false);
    return Promise.race([
      ctx.resume().then(() => ctx.state === 'running', () => false),
      new Promise((r) => setTimeout(() => r(ctx.state === 'running'), 250))
    ]).catch(() => false);
  }

  function sleepSoon() {
    clearTimeout(sleepTimer);
    const wait = Math.max(4000, holdUntil - performance.now());
    sleepTimer = setTimeout(() => { if (ctx && ctx.state === 'running') ctx.suspend(); }, wait);
  }

  /* opts.volume: 0..1; opts.theme overrides the page's theme (Anime Studio's
     page has none). Returns a promise of whether it sounded. */
  function play(kind, opts) {
    const themeId = (opts && opts.theme) || currentTheme();
    const rec = recorded[themeId] && recorded[themeId][kind];
    /* 'wa-submit' etc.: a variant with no synth of its own uses its base kind's */
    const pack = PACKS[themeId] || EFFECTS;
    const fx = pack[kind] || pack[kind.split('-')[0]];
    const offscreen = !!(opts && opts.offscreen);
    if (!(rec || fx) || (!offscreen && document.visibilityState !== 'visible')) return Promise.resolve(false);
    const volume = Math.max(0, Math.min(1, opts && typeof opts.volume === 'number' ? opts.volume : 1));
    if (volume === 0) return Promise.resolve(false);
    /* this tab may not start audio yet: the offscreen page plays it instead */
    if (!offscreen && !mayStart()) {
      return Promise.resolve(handOff({ op: 'synth', kind, theme: themeId, volume }));
    }
    try { ensureContext(volume); } catch (e) { return Promise.resolve(false); }
    const asked = performance.now();
    return running().then((ok) => {
      /* blocked, or so late the overlay has moved on: stay silent */
      if (!ok || performance.now() - asked > 350) { sleepSoon(); return false; }
      try {
        bus.out.gain.setValueAtTime(volume, ctx.currentTime);
        if (rec) sample(bus, rec, kind, themeId); else { stop(0.06); fx(bus); }
        sleepSoon();
        return true;
      } catch (e) { return false; }
    });
  }

  /* the first real interaction unlocks audio for the rest of the page's life */
  function unlock() {
    if (currentTheme() === 'game') return;
    try {
      if (mayStart()) {
        ensureContext(0.6);
        running().then(sleepSoon);
      }
    } catch (e) {}
    removeEventListener('pointerdown', unlock, true);
    removeEventListener('keydown', unlock, true);
  }
  if (typeof addEventListener === 'function' && typeof document !== 'undefined' && document.documentElement) {
    addEventListener('pointerdown', unlock, true);
    addEventListener('keydown', unlock, true);
  }

  /* for tests and tools: render an effect into any context, e.g. offline.
     theme: 'anime' (default), 'crawler' or 'pixel', picking which pack to render. */
  function renderInto(ac, kind, volume, theme) {
    const fx = (PACKS[theme] || EFFECTS)[kind];
    fx(chain(ac, volume === undefined ? 0.6 : volume));
  }

  root.LCTSSounds = { play, stop, warm, wake, prime, mayStart, handOff, renderInto, kinds: Object.keys(EFFECTS) };
})(globalThis);
