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
    snap:        { file: 'snap.mp3',        volume: 0.75, delay: 0 },
    whoosh:      { file: 'whoosh.mp3',      volume: 0.65, delay: 0 },
    timerewind:  { file: 'timerewind.mp3',  volume: 0.85, delay: 0 },
    timestone:   { file: 'timestone.mp3',   volume: 0.75, delay: 0 },
    drone:       { file: 'drone.mp3',       volume: 0.35, delay: 0 },
    tick:        { file: 'tick.mp3',        volume: 0.30, delay: 0 },
    run:         { file: 'run.mp3',         volume: 0.55, delay: 0 },
    prune:       { file: 'prune.mp3',       volume: 0.60, delay: 0 },
    error:       { file: 'error.mp3',       volume: 0.50, delay: 0 }
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

  // 4. Reverse Time Vortex (Reverse Suction Whoosh + Time Stone Harmonic Chord)
  function synthTimeRewind(ac, vol) {
    const t = ac.currentTime;
    const dur = 0.85;

    // Reverse suction: noise swept upwards in pitch and volume
    const bufferSize = Math.floor(ac.sampleRate * dur);
    const noiseBuffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    const noise = ac.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(180, t);
    filter.frequency.exponentialRampToValueAtTime(2600, t + dur);
    filter.Q.value = 3.5;

    const gain = ac.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol * 0.65, t + dur * 0.85);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ac.destination);

    noise.start(t);
    noise.stop(t + dur + 0.02);

    // Followed immediately by the mystical crystalline Time Stone chord
    setTimeout(() => {
      synthTimeStone(ac, vol);
    }, Math.floor(dur * 700));
  }

  // 5. Cosmic Ambient Judgment Drone
  let activeDrone = null;
  function synthDrone(ac, vol) {
    if (activeDrone) return;
    const t = ac.currentTime;
    const osc1 = ac.createOscillator();
    const osc2 = ac.createOscillator();
    const gain = ac.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(55, t); // A1 sub-bass
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(110, t); // A2 harmonic

    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol * 0.28, t + 0.4);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ac.destination);

    osc1.start(t);
    osc2.start(t);
    activeDrone = { osc1, osc2, gain, ac };
  }

  function stopDrone() {
    if (!activeDrone) return;
    try {
      const { osc1, osc2, gain, ac } = activeDrone;
      const t = ac.currentTime;
      gain.gain.linearRampToValueAtTime(0.0001, t + 0.2);
      osc1.stop(t + 0.25);
      osc2.stop(t + 0.25);
    } catch (e) {}
    activeDrone = null;
  }

  // 6. Time Stone / TVA Loom Ticking Pulse
  function synthTick(ac, vol) {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(300, t + 0.025);

    gain.gain.setValueAtTime(vol * 0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.035);
  }

  // 7. Nexus Event Prune Zap (Wrong Answer / Error)
  function synthPrune(ac, vol) {
    const t = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.35);

    gain.gain.setValueAtTime(vol * 0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);

    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  // 8. Emerald Pass Chime (Run)
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

  // 9. Temporal Divergence Ping (Error / WA)
  function synthError(ac, vol) {
    synthPrune(ac, vol);
  }

  function playSynth(name, vol) {
    const ac = getContext();
    if (!ac) return;
    if (name === 'snap') synthSnap(ac, vol);
    else if (name === 'whoosh') synthWhoosh(ac, vol);
    else if (name === 'timerewind') synthTimeRewind(ac, vol);
    else if (name === 'timestone') synthTimeStone(ac, vol);
    else if (name === 'drone') synthDrone(ac, vol);
    else if (name === 'tick') synthTick(ac, vol);
    else if (name === 'prune') synthPrune(ac, vol);
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

  function stop() {
    stopDrone();
    Object.values(audioCache).forEach((a) => {
      try { a.pause(); a.currentTime = 0; } catch (e) {}
    });
  }

  root.LCTSTimeStoneSounds = { play, stop, stopDrone, CUES, DIR };
})(globalThis);

