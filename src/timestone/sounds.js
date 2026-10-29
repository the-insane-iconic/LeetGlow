/* =============================================================================
   sounds.js — Time Stone Theme Audio Engine (src/timestone/sounds.js)
   
   Supports:
   1. Real MP3 audio files if dropped in `sounds/timestone/`:
      - snap.mp3, whoosh.mp3, timestone.mp3, run.mp3, error.mp3
   2. Real-time Web Audio Synthesizer fallback if files are not present:
      - Crisp metallic Infinity Gauntlet snap click
      - Cinematic vacuum whoosh / ash dissolution
      - Glowing mystical Doctor Strange time rune harmonic chord (E-G#-B-D#)
   ============================================================================= */

(function (root) {
  'use strict';

  const DIR = 'sounds/timestone/';

  const CUES = {
    snap:      { file: 'snap.mp3',      volume: 0.70, delay: 0   },
    whoosh:    { file: 'whoosh.mp3',    volume: 0.60, delay: 280 },
    timestone: { file: 'timestone.mp3', volume: 0.75, delay: 1750 },
    run:       { file: 'run.mp3',       volume: 0.55, delay: 80  },
    error:     { file: 'error.mp3',     volume: 0.50, delay: 100 }
  };

  const audioCache = {};
  const missingFiles = {};
  let audioCtx = null;
  let masterVolume = 1.0;
  let isMuted = false;

  try {
    chrome.storage.local.get(['lcVolume', 'lcGameSound'], (res) => {
      if (res && res.lcGameSound === false) isMuted = true;
      if (res && typeof res.lcVolume === 'number') masterVolume = res.lcVolume / 100;
    });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.lcGameSound) isMuted = ch.lcGameSound.newValue === false;
      if (ch.lcVolume && typeof ch.lcVolume.newValue === 'number') masterVolume = ch.lcVolume.newValue / 100;
    });
  } catch (e) {}

  function getAudioUrl(file) {
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL(DIR + file)
      : DIR + file;
  }

  function getContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC({ latencyHint: 'interactive' });
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  }

  /* ---- Web Audio Procedural Synthesizer Fallbacks ------------------------- */

  // 1. Metallic Gauntlet Snap Click
  function synthSnap(ac, vol) {
    const t = ac.currentTime;
    // Fast high-pitch metallic click
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(3200, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.045);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(2800, t);
    filter.Q.value = 4.5;

    gain.gain.setValueAtTime(vol * 0.9, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    osc.start(t);
    osc.stop(t + 0.07);

    // Deep sub-thump of fingers snapping
    const subOsc = ac.createOscillator();
    const subGain = ac.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, t);
    subOsc.frequency.exponentialRampToValueAtTime(35, t + 0.09);

    subGain.gain.setValueAtTime(vol * 0.7, t);
    subGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

    subOsc.connect(subGain);
    subGain.connect(ac.destination);

    subOsc.start(t);
    subOsc.stop(t + 0.11);
  }

  // 2. Cinematic Vacuum Whoosh (Air suction / Ash drift)
  function synthWhoosh(ac, vol) {
    const t = ac.currentTime;
    const dur = 0.95;
    const bufferSize = ac.sampleRate * dur;
    const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ac.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + dur);

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol * 0.5, t + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    noise.start(t);
    noise.stop(t + dur + 0.05);
  }

  // 3. Glowing Mystical Doctor Strange Time Rune Chime Chord (E-G#-B-D#)
  function synthTimeStone(ac, vol) {
    const t = ac.currentTime;
    const freqs = [329.63, 415.30, 493.88, 622.25, 987.77]; // E4, G#4, B4, D#5, B5

    freqs.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();

      osc.type = i % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.06);

      // Subtle vibrato shimmer
      const lfo = ac.createOscillator();
      const lfoGain = ac.createGain();
      lfo.frequency.value = 5.5;
      lfoGain.gain.value = freq * 0.012;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(t + i * 0.06);
      lfo.stop(t + 2.2);

      const delayStart = t + i * 0.06;
      gain.gain.setValueAtTime(0.0001, delayStart);
      gain.gain.linearRampToValueAtTime(vol * 0.35, delayStart + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, delayStart + 2.1);

      osc.connect(gain);
      gain.connect(ac.destination);

      osc.start(delayStart);
      osc.stop(delayStart + 2.2);
    });
  }

  // 4. Emerald Pass Chime (Run)
  function synthRun(ac, vol) {
    const t = ac.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.08);

      const at = t + i * 0.08;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.linearRampToValueAtTime(vol * 0.3, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);

      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(at);
      osc.stop(at + 0.65);
    });
  }

  // 5. Temporal Divergence Ping (Error / WA)
  function synthError(ac, vol) {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.35);

    gain.gain.setValueAtTime(vol * 0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  function playSynth(name, vol) {
    const ac = getContext();
    if (!ac) return;
    if (name === 'snap') synthSnap(ac, vol);
    else if (name === 'whoosh') synthWhoosh(ac, vol);
    else if (name === 'timestone') synthTimeStone(ac, vol);
    else if (name === 'run') synthRun(ac, vol);
    else if (name === 'error') synthError(ac, vol);
  }

  function play(name, opts) {
    const cue = CUES[name];
    if (!cue || isMuted) return 0;

    opts = opts || {};
    const delay = typeof opts.delay === 'number' ? opts.delay : cue.delay;
    const vol = Math.max(0, Math.min(1, cue.volume * masterVolume));

    return setTimeout(() => {
      if (isMuted) return;

      // If missing MP3 was already confirmed, trigger procedural Web Audio synth immediately
      if (missingFiles[name]) {
        playSynth(name, vol);
        return;
      }

      // Try playing cached audio element
      let audio = audioCache[name];
      if (!audio) {
        audio = new Audio(getAudioUrl(cue.file));
        audio.preload = 'auto';
        audio.addEventListener('error', () => {
          missingFiles[name] = true;
          // Gracefully fallback to Web Audio synthesizer
          playSynth(name, vol);
        }, { once: true });
        audioCache[name] = audio;
      }

      try {
        if (audio.readyState > 0) audio.currentTime = 0;
        audio.volume = vol;
        const p = audio.play();
        if (p && p.catch) {
          p.catch(() => {
            playSynth(name, vol);
          });
        }
      } catch (e) {
        playSynth(name, vol);
      }
    }, Math.max(0, delay));
  }

  root.LCTSTimeStoneSounds = { play, CUES, DIR };
})(globalThis);

