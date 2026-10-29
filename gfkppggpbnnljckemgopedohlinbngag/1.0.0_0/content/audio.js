/* LeetThemes — generative lofi audio engine. Original synthesis, no bundled tracks. */
(function () {
  'use strict';

  const PRESETS = {
    cafe: {
      name: 'Café',
      bar: 7.2,
      cutoff: 1500,
      padGain: 0.9,
      bell: true,
      rain: 0.02,
      vinyl: 0.55,
      chords: [
        [53, 57, 60, 64],
        [50, 53, 57, 60],
        [55, 59, 62, 65],
        [48, 52, 55, 59]
      ]
    },
    rain: {
      name: 'Rain',
      bar: 9,
      cutoff: 1150,
      padGain: 0.85,
      bell: false,
      rain: 1,
      vinyl: 0.28,
      chords: [
        [45, 48, 52, 55],
        [41, 45, 48, 52],
        [48, 52, 55, 59],
        [43, 47, 50, 55]
      ]
    },
    night: {
      name: 'Night',
      bar: 10,
      cutoff: 900,
      padGain: 1,
      bell: true,
      rain: 0.1,
      vinyl: 0.38,
      chords: [
        [48, 52, 55, 59],
        [45, 48, 52, 55],
        [41, 45, 48, 52],
        [43, 47, 50, 53]
      ]
    }
  };

  const PENTATONIC = [72, 74, 77, 79, 81, 84, 86, 89];

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  class LofiAudio {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.padBus = null;
      this.reverb = null;
      this.reverbGain = null;
      this.preset = 'cafe';
      this.volume = 0.32;
      this.playing = false;
      this.pending = false;
      this.schedulerTimer = null;
      this.bellTimer = null;
      this.nextChordAt = 0;
      this.chordIndex = 0;
      this.active = [];
      this.noiseSources = [];
      this.pauseOnHide = true;
      this.hidden = document.hidden;
      this.stopTimer = null;
      this.stateListeners = new Set();
      this._onVisibility = this._onVisibility.bind(this);
      document.addEventListener('visibilitychange', this._onVisibility);

      // Only one tab plays at a time: whoever starts tells the others to stop.
      this.instanceId = Math.random().toString(36).slice(2);
      this.claimedAt = 0;
      this.channel = null;
      try {
        this.channel = new BroadcastChannel('lct-lofi');
        this.channel.onmessage = function (event) {
          const data = event.data || {};
          if (data.type !== 'claim' || data.id === this.instanceId || !this.playing) return;
          // Newest claim wins; ties broken by id so two simultaneous starts never both stop.
          const newer = data.at > this.claimedAt || (data.at === this.claimedAt && data.id > this.instanceId);
          if (newer) this.stop();
        }.bind(this);
      } catch (error) { /* BroadcastChannel unavailable */ }
    }

    _emit() {
      this.stateListeners.forEach(function (listener) {
        try { listener({ playing: this.playing, pending: this.pending, preset: this.preset }); } catch (error) { /* ignore */ }
      }.bind(this));
    }

    onChange(listener) {
      this.stateListeners.add(listener);
      return function () { this.stateListeners.delete(listener); }.bind(this);
    }

    _onVisibility() {
      this.hidden = document.hidden;
      if (!this.pauseOnHide || !this.playing || !this.ctx) return;
      if (this.hidden) {
        this._stopScheduling();
        this.ctx.suspend().catch(function () {});
      } else {
        this.ctx.resume().then(function () {
          this.nextChordAt = this.ctx.currentTime + 0.1;
          this._startScheduling();
        }.bind(this)).catch(function () {});
      }
    }

    _ensureContext() {
      if (this.ctx) return true;
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return false;
      const ctx = new AudioContextClass();
      this.ctx = ctx;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 24;
      compressor.ratio.value = 3;
      compressor.attack.value = 0.01;
      compressor.release.value = 0.4;

      this.master = ctx.createGain();
      this.master.gain.value = 0;
      this.master.connect(compressor);
      compressor.connect(ctx.destination);

      this.padBus = ctx.createGain();
      this.padBus.gain.value = 0.9;
      this.padBus.connect(this.master);

      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._makeImpulse(2.6, 2.4);
      this.reverbGain = ctx.createGain();
      this.reverbGain.gain.value = 0.42;
      this.padBus.connect(this.reverb);
      this.reverb.connect(this.reverbGain);
      this.reverbGain.connect(this.master);

      this.ambience = ctx.createGain();
      this.ambience.gain.value = 0.55;
      this.ambience.connect(this.master);
      return true;
    }

    _makeImpulse(seconds, decay) {
      const ctx = this.ctx;
      const rate = ctx.sampleRate;
      const length = Math.floor(rate * seconds);
      const buffer = ctx.createBuffer(2, length, rate);
      for (let channel = 0; channel < 2; channel += 1) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < length; i += 1) {
          const envelope = Math.pow(1 - i / length, decay);
          data[i] = (Math.random() * 2 - 1) * envelope;
        }
      }
      return buffer;
    }

    _makeNoiseBuffer(seconds) {
      const ctx = this.ctx;
      const length = Math.floor(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
      return buffer;
    }

    _makeVinylBuffer(seconds) {
      const ctx = this.ctx;
      const length = Math.floor(ctx.sampleRate * seconds);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let pop = 0;
      for (let i = 0; i < length; i += 1) {
        if (Math.random() < 0.00022) pop = (Math.random() * 2 - 1) * (0.35 + Math.random() * 0.6);
        pop *= 0.986;
        data[i] = (Math.random() * 2 - 1) * 0.012 + pop;
      }
      return buffer;
    }

    _loopNoise(buffer, filters, gainValue) {
      const ctx = this.ctx;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      let node = source;
      filters.forEach(function (options) {
        const filter = ctx.createBiquadFilter();
        filter.type = options.type;
        filter.frequency.value = options.frequency;
        if (options.Q != null) filter.Q.value = options.Q;
        node.connect(filter);
        node = filter;
      });
      const gain = ctx.createGain();
      gain.gain.value = gainValue;
      node.connect(gain);
      gain.connect(this.ambience);
      source.start();
      this.noiseSources.push({ source: source, gain: gain });
      return source;
    }

    _buildAmbience(preset) {
      const spec = PRESETS[preset];
      const ctx = this.ctx;
      const vinyl = this._makeVinylBuffer(3.4);
      this._loopNoise(vinyl, [
        { type: 'highpass', frequency: 900 },
        { type: 'lowpass', frequency: 7800 }
      ], 0.11 * spec.vinyl);

      if (spec.rain > 0) {
        const rain = this._makeNoiseBuffer(4);
        this._loopNoise(rain, [
          { type: 'bandpass', frequency: 2300, Q: 0.6 },
          { type: 'highpass', frequency: 700 }
        ], 0.055 * spec.rain);
        this._loopNoise(rain, [
          { type: 'lowpass', frequency: 320 }
        ], 0.12 * spec.rain);
      }

      if (preset === 'night') {
        const wind = this._makeNoiseBuffer(5);
        this._loopNoise(wind, [
          { type: 'lowpass', frequency: 420 },
          { type: 'highpass', frequency: 80 }
        ], 0.045);
      }

      if (preset === 'cafe') {
        const room = this._makeNoiseBuffer(4);
        this._loopNoise(room, [
          { type: 'lowpass', frequency: 900 },
          { type: 'highpass', frequency: 120 }
        ], 0.026);
      }

      const hum = ctx.createOscillator();
      hum.type = 'sine';
      hum.frequency.value = 55;
      const humGain = ctx.createGain();
      humGain.gain.value = 0.008;
      hum.connect(humGain);
      humGain.connect(this.ambience);
      hum.start();
      this.noiseSources.push({ source: hum, gain: humGain });
    }

    _scheduleChord(time, preset) {
      const spec = PRESETS[preset];
      const chord = spec.chords[this.chordIndex % spec.chords.length];
      this.chordIndex += 1;
      const ctx = this.ctx;
      const attack = Math.min(2.4, spec.bar * 0.24);
      const release = spec.bar * 0.55;

      chord.forEach(function (midi, index) {
        const voiceGain = ctx.createGain();
        const peak = 0.026 * (index === 0 ? 1.15 : index === 3 ? 0.7 : 0.9);
        voiceGain.gain.setValueAtTime(0.0001, time);
        voiceGain.gain.exponentialRampToValueAtTime(peak, time + attack);
        voiceGain.gain.setValueAtTime(peak, time + spec.bar * 0.55);
        voiceGain.gain.exponentialRampToValueAtTime(0.0001, time + spec.bar + release);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(spec.cutoff * 0.7, time);
        filter.frequency.linearRampToValueAtTime(spec.cutoff, time + attack);
        filter.frequency.exponentialRampToValueAtTime(spec.cutoff * 0.45, time + spec.bar + release);
        filter.Q.value = 0.6;

        const frequency = midiToFreq(midi);
        [0, 6].forEach(function (detune, voiceIndex) {
          const osc = ctx.createOscillator();
          osc.type = voiceIndex === 0 ? 'triangle' : 'sine';
          osc.frequency.value = frequency;
          osc.detune.value = voiceIndex === 0 ? -4 : 5;
          const oscGain = ctx.createGain();
          oscGain.gain.value = voiceIndex === 0 ? 0.62 : 0.34;
          osc.connect(oscGain);
          oscGain.connect(filter);
          osc.start(time);
          osc.stop(time + spec.bar + release + 0.2);
          this.active.push({ node: osc, until: time + spec.bar + release + 0.4 });
        }.bind(this));

        filter.connect(voiceGain);
        voiceGain.connect(this.padBus);
        voiceGain.connect(this.reverb);
      }.bind(this));

      const root = ctx.createOscillator();
      root.type = 'sine';
      root.frequency.value = midiToFreq(chord[0] - 12);
      const rootGain = ctx.createGain();
      rootGain.gain.setValueAtTime(0.0001, time);
      rootGain.gain.exponentialRampToValueAtTime(0.022, time + attack * 0.7);
      rootGain.gain.setValueAtTime(0.018, time + spec.bar * 0.6);
      rootGain.gain.exponentialRampToValueAtTime(0.0001, time + spec.bar + release);
      root.connect(rootGain);
      rootGain.connect(this.padBus);
      root.start(time);
      root.stop(time + spec.bar + release + 0.2);
      this.active.push({ node: root, until: time + spec.bar + release + 0.4 });
    }

    _scheduleBell() {
      if (!this.playing || !this.ctx || this.hidden) return;
      const spec = PRESETS[this.preset];
      if (!spec.bell) return;
      const ctx = this.ctx;
      const time = ctx.currentTime + 0.05;
      const note = PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)];
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(note);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.025, time + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 3.4);
      osc.connect(gain);
      gain.connect(this.reverb);
      gain.connect(this.master);
      osc.start(time);
      osc.stop(time + 3.6);
      this.active.push({ node: osc, until: time + 3.8 });
    }

    _startScheduling() {
      this._stopScheduling();
      this.nextChordAt = this.ctx.currentTime + 0.15;
      this.schedulerTimer = setInterval(function () {
        if (!this.playing || !this.ctx) return;
        while (this.nextChordAt < this.ctx.currentTime + 2.5) {
          this._scheduleChord(this.nextChordAt, this.preset);
          this.nextChordAt += PRESETS[this.preset].bar;
        }
        this.active = this.active.filter(function (item) {
          return item.until > this.ctx.currentTime - 1;
        }.bind(this));
      }.bind(this), 300);

      this.bellTimer = setInterval(this._scheduleBell.bind(this), 8000);
      setTimeout(this._scheduleBell.bind(this), 2400);
    }

    _stopScheduling() {
      if (this.schedulerTimer) clearInterval(this.schedulerTimer);
      if (this.bellTimer) clearInterval(this.bellTimer);
      this.schedulerTimer = null;
      this.bellTimer = null;
    }

    _stopSources() {
      this.noiseSources.forEach(function (item) {
        try { item.source.stop(); } catch (error) { /* already stopped */ }
      });
      this.noiseSources = [];
      this.active.forEach(function (item) {
        try { item.node.stop(); } catch (error) { /* ignore */ }
      });
      this.active = [];
    }

    async start(preset) {
      if (preset && PRESETS[preset]) this.preset = preset;
      // Never start in a background tab; the visible tab owns playback.
      if (document.hidden) return false;
      if (!this._ensureContext()) return false;
      if (this.ctx.state === 'suspended') {
        try { await this.ctx.resume(); } catch (error) { /* gesture required */ }
      }
      if (this.ctx.state !== 'running') {
        this.pending = true;
        this._emit();
        return false;
      }
      this.pending = false;
      if (this.stopTimer) {
        clearTimeout(this.stopTimer);
        this.stopTimer = null;
      }
      this._stopScheduling();
      this._stopSources();
      this.playing = true;
      this.chordIndex = 0;
      this._buildAmbience(this.preset);
      this._startScheduling();
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(Math.max(0.0002, this.volume * 0.72), now + 1.8);
      this.claimedAt = Date.now();
      if (this.channel) {
        try { this.channel.postMessage({ type: 'claim', id: this.instanceId, at: this.claimedAt }); } catch (error) { /* ignore */ }
      }
      this._emit();
      return true;
    }

    stop() {
      this.pending = false;
      if (!this.ctx || !this.playing) {
        this.playing = false;
        this._emit();
        return;
      }
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      this._stopScheduling();
      const self = this;
      if (this.stopTimer) clearTimeout(this.stopTimer);
      this.stopTimer = setTimeout(function () {
        self._stopSources();
        self.stopTimer = null;
        if (self.ctx && !self.playing) self.ctx.suspend().catch(function () {});
      }, 800);
      this.playing = false;
      this._emit();
    }

    toggle() {
      if (this.playing) {
        this.stop();
        return Promise.resolve(false);
      }
      return this.start(this.preset);
    }

    setPreset(preset) {
      if (!PRESETS[preset]) return;
      const wasPlaying = this.playing;
      this.preset = preset;
      if (wasPlaying) {
        this.stop();
        const self = this;
        setTimeout(function () { self.start(preset); }, 300);
      } else {
        this._emit();
      }
    }

    nextPreset() {
      const keys = Object.keys(PRESETS);
      const index = keys.indexOf(this.preset);
      this.setPreset(keys[(index + 1) % keys.length]);
      return this.preset;
    }

    setVolume(volume) {
      this.volume = Math.max(0, Math.min(1, Number(volume) || 0));
      this.pauseOnHide = this.pauseOnHide !== false;
      if (this.ctx && this.master) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setTargetAtTime(this.volume * 0.72, now, 0.15);
      }
      this._emit();
    }

    setPauseOnHide(value) {
      this.pauseOnHide = Boolean(value);
    }

    chime() {
      if (!this._ensureContext()) return;
      const ctx = this.ctx;
      // The context is suspended whenever lofi is stopped or the tab was hidden; wake it for the chime.
      if (ctx.state !== 'running') {
        ctx.resume().then(this._playChime.bind(this)).catch(function () {});
        return;
      }
      this._playChime();
    }

    _playChime() {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime + 0.02;
      [880, 1174.66].forEach(function (freq, index) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        const start = now + index * 0.18;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.06, start + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.6);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 1.8);
      });
      const self = this;
      setTimeout(function () {
        if (self.ctx && !self.playing) self.ctx.suspend().catch(function () {});
      }, 2400);
    }

    static presets() {
      return PRESETS;
    }
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.audio = new LofiAudio();
  globalThis.LCT.AUDIO_PRESETS = PRESETS;
})();
