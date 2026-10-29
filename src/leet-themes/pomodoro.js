/* LeetThemes — pomodoro timer with persistence, badge + on-page widget. */
(function () {
  'use strict';

  const MODES = {
    work: { label: 'Focus session', short: 'Focus' },
    break: { label: 'Short break', short: 'Break' },
    long: { label: 'Long break', short: 'Long break' }
  };

  class Pomodoro {
    constructor() {
      this.settings = null;
      this.widgets = null;
      this.audio = null;
      this.toast = null;
      this.onDisable = null;
      this.openSettings = null;
      this.mode = 'work';
      this.running = false;
      this.endAt = 0;
      this.remaining = 25 * 60 * 1000;
      this.cycles = 0;
      this.enabled = false;
      this.interval = null;
      this.lastBadgeMinute = null;
      this.lastSave = 0;
      this.initialised = false;
      this._restoring = false;
      this.instanceId = Math.random().toString(36).slice(2);
      this.lastAlarmEnd = null;
    }

    _watchOtherTabs() {
      try {
        const key = globalThis.LCT.KEYS.pomodoro;
        chrome.storage.onChanged.addListener(function (changes, area) {
          if (area !== 'local' || !changes[key]) return;
          const saved = changes[key].newValue;
          if (saved && saved.source === this.instanceId) return;
          this._adopt(saved);
        }.bind(this));
      } catch (error) { /* extension context unavailable */ }
    }

    // Mirror timer state written by another LeetCode tab.
    _adopt(saved) {
      if (!saved) {
        this.mode = 'work';
        this.cycles = 0;
        this.running = false;
        this.endAt = 0;
        this.remaining = this._durationFor('work');
      } else {
        this.mode = saved.mode || 'work';
        this.cycles = Number(saved.cycles) || 0;
        this.running = Boolean(saved.running && saved.endAt);
        this.endAt = this.running ? Number(saved.endAt) : 0;
        this.remaining = this.running ? this.endAt - Date.now() : (Number(saved.remaining) || this._durationFor(this.mode));
      }
      this.lastAlarmEnd = this.running ? this.endAt : 0; // the writing tab already scheduled it
      if (!this.enabled) return;
      this.render();
      if (this.running) this._startInterval();
      else this._stopInterval();
    }

    async init(options) {
      this.widgets = options.widgets;
      this.audio = options.audio;
      this.toast = options.toast;
      this.onDisable = options.onDisable || function () {};
      this.openSettings = options.openSettings || function () {};
      this.setSettings(options.settings || {});
      this.widgets.configure({
        timerToggle: this.toggle.bind(this),
        timerSkip: this.skip.bind(this),
        timerReset: this.reset.bind(this),
        timerClose: this.requestDisable.bind(this),
        openSettings: this.openSettings
      });
      await this.restore();
      this._watchOtherTabs();
      this._watchAlarmCompletion();
      this.initialised = true;
      this.render();
    }

    _watchAlarmCompletion() {
      try {
        chrome.runtime.onMessage.addListener(function (message) {
          if (!message || message.type !== 'lct:pomodoro-ended') return;
          if (!this.enabled || !this.running) return;
          if (!message.end || Math.abs(this.endAt - Number(message.end)) > 1500) return;
          this.complete();
        }.bind(this));
      } catch (error) { /* extension context unavailable */ }
    }

    setSettings(settings) {
      const previous = this.settings;
      this.settings = settings;
      this.enabled = Boolean(settings && settings.pomodoro && settings.pomodoro.enabled);
      if (!this.enabled) {
        this._stopInterval();
        this.clearBadge();
        // Another tab may have scheduled the alarm, so clear unconditionally.
        this.lastAlarmEnd = null;
        this._syncAlarm();
        if (this.widgets && this.initialised) {
          this.widgets.updateTimer({ visible: false });
        }
        return;
      }
      const duration = this._durationFor(this.mode);
      if (!this.running) {
        const previousDuration = previous ? this._durationForFrom(previous, this.mode) : duration;
        const wasIdleFull = Math.abs(this.remaining - previousDuration) < 1200;
        if (!previous || !this.initialised || this.remaining > duration || wasIdleFull) {
          this.remaining = duration;
        }
      }
      if (this.initialised) {
        this.render();
        if (this.running) this._startInterval();
        else this._stopInterval();
      }
    }

    _durationForFrom(settings, mode) {
      const config = (settings && settings.pomodoro) || {};
      if (mode === 'break') return Math.max(1, Number(config.break) || 5) * 60 * 1000;
      if (mode === 'long') return Math.max(1, Number(config.longBreak) || 15) * 60 * 1000;
      return Math.max(1, Number(config.work) || 25) * 60 * 1000;
    }

    _durationFor(mode) {
      const config = (this.settings && this.settings.pomodoro) || {};
      if (mode === 'break') return Math.max(1, Number(config.break) || 5) * 60 * 1000;
      if (mode === 'long') return Math.max(1, Number(config.longBreak) || 15) * 60 * 1000;
      return Math.max(1, Number(config.work) || 25) * 60 * 1000;
    }

    _modeAfter(current, cycles) {
      if (current !== 'work') return 'work';
      const config = (this.settings && this.settings.pomodoro) || {};
      const every = Math.max(2, Number(config.longEvery) || 4);
      const count = cycles == null ? this.cycles : cycles;
      return count > 0 && count % every === 0 ? 'long' : 'break';
    }

    _completionText(finishedMode, nextMode) {
      return {
        title: finishedMode === 'work' ? 'Focus session complete' : 'Break over',
        body: finishedMode === 'work'
          ? (nextMode === 'long' ? 'Long break unlocked. You earned it.' : 'Short break. Stretch, hydrate, reset.')
          : 'Back to the grind — you got this.'
      };
    }

    // Ask the service worker to alert at endAt: page timers are throttled in background tabs.
    _syncAlarm() {
      const want = this.enabled && this.running ? this.endAt : 0;
      if (want === this.lastAlarmEnd) return;
      this.lastAlarmEnd = want;
      const message = { type: 'lct:pomodoro-alarm', when: want };
      if (want) {
        const cyclesAfter = this.mode === 'work' ? this.cycles + 1 : this.cycles;
        const text = this._completionText(this.mode, this._modeAfter(this.mode, cyclesAfter));
        message.key = 'lct-pomo-' + want;
        message.title = text.title;
        message.message = text.body;
      }
      try { chrome.runtime.sendMessage(message); } catch (error) { /* extension context unavailable */ }
    }

    _startInterval() {
      this._stopInterval();
      this.interval = setInterval(this.tick.bind(this), 500);
    }

    _stopInterval() {
      if (this.interval) clearInterval(this.interval);
      this.interval = null;
    }

    async restore() {
      let saved = null;
      try { saved = await globalThis.LCT.getPomodoroRuntime(); } catch (error) { /* ignore */ }
      if (!saved) {
        this.remaining = this._durationFor('work');
        this.render();
        return;
      }
      this.mode = saved.mode || 'work';
      this.cycles = Number(saved.cycles) || 0;
      this.remaining = Number(saved.remaining) || this._durationFor(this.mode);
      this.running = Boolean(saved.running);
      this.endAt = Number(saved.endAt) || 0;
      if (this.running && this.endAt) {
        this.remaining = this.endAt - Date.now();
        if (this.remaining <= 0) {
          if (!this.enabled) {
            // Expired while the timer was hidden: reset quietly instead of announcing it.
            this.running = false;
            this.endAt = 0;
            this.remaining = this._durationFor(this.mode);
            this.persist();
            return;
          }
          this._restoring = true;
          this.complete();
          this._restoring = false;
          return;
        }
        // A restored session should not depend on an alarm that may have been lost.
        if (this.enabled) this._syncAlarm();
      }
      if (this.enabled && this.running) this._startInterval();
      else this._stopInterval();
    }

    persist() {
      const state = {
        mode: this.mode,
        cycles: this.cycles,
        remaining: this._currentRemaining(),
        running: this.running,
        endAt: this.running ? this.endAt : 0,
        updatedAt: Date.now(),
        source: this.instanceId
      };
      try { globalThis.LCT.setPomodoroRuntime(state); } catch (error) { /* ignore */ }
      this._syncAlarm();
    }

    _currentRemaining() {
      if (!this.running) return Math.max(0, this.remaining);
      return Math.max(0, this.endAt - Date.now());
    }

    tick() {
      if (!this.enabled) return;
      if (!this.running) {
        this._stopInterval();
        return;
      }
      const remaining = this._currentRemaining();
      if (remaining <= 0) {
        this.complete();
        return;
      }
      this.render();
      const now = Date.now();
      if (now - this.lastSave > 12000) {
        this.lastSave = now;
        this.persist();
      }
    }

    render() {
      if (!this.widgets || !this.enabled) return;
      const total = this._durationFor(this.mode);
      const remaining = this._currentRemaining();
      const progress = total ? remaining / total : 0;
      const label = MODES[this.mode] || MODES.work;
      const sub = this.running
        ? (this.mode === 'work' ? 'stay in the zone' : 'breathe & stretch')
        : (this.remaining < total ? 'paused' : 'ready when you are');
      this.widgets.updateTimer({
        visible: true,
        time: globalThis.LCT.utils.formatTime(remaining),
        label: label.short,
        sub: sub,
        progress: progress,
        running: this.running,
        cycles: this.cycles,
        warn: this.mode !== 'work' || remaining < 60000
      });
      this._updateBadge(remaining);
    }

    _updateBadge(remaining) {
      const minutes = this.running ? Math.max(1, Math.ceil(remaining / 60000)) : 0;
      if (minutes === this.lastBadgeMinute) return;
      this.lastBadgeMinute = minutes;
      try {
        chrome.runtime.sendMessage({ type: 'lct:badge', text: minutes ? String(minutes) : '', color: '#e46b9e' });
      } catch (error) { /* extension context may be unavailable */ }
    }

    clearBadge() {
      this.lastBadgeMinute = 0;
      try { chrome.runtime.sendMessage({ type: 'lct:badge', text: '' }); } catch (error) { /* ignore */ }
    }

    start() {
      if (!this.enabled || this.running) return;
      if (this.remaining <= 0) this.remaining = this._durationFor(this.mode);
      this.endAt = Date.now() + this.remaining;
      this.running = true;
      this.render();
      this._startInterval();
      this.persist();
    }

    pause() {
      if (!this.running) return;
      this.remaining = this._currentRemaining();
      this.running = false;
      this.endAt = 0;
      this._stopInterval();
      this.render();
      this.persist();
    }

    toggle() {
      if (this.running) this.pause();
      else this.start();
    }

    reset() {
      this.running = false;
      this.endAt = 0;
      this.remaining = this._durationFor(this.mode);
      this._stopInterval();
      this.render();
      this.persist();
    }

    skip() {
      this.running = false;
      this.endAt = 0;
      this._stopInterval();
      this.mode = this._modeAfter(this.mode);
      this.remaining = this._durationFor(this.mode);
      if (this.settings && this.settings.pomodoro.autoStart) this.start();
      else this.render();
      this.persist();
    }

    complete() {
      const finishedMode = this.mode;
      const finishedAt = this.endAt;
      this.running = false;
      this.endAt = 0;
      if (finishedMode === 'work') this.cycles += 1;
      this.mode = this._modeAfter(finishedMode);
      this.remaining = this._durationFor(this.mode);

      // Several tabs may finish the same session; only the visible one chimes.
      if (this.settings && this.settings.pomodoro.sound && !document.hidden) {
        try { this.audio.chime(); } catch (error) { /* ignore */ }
      }
      const text = this._completionText(finishedMode, this.mode);
      if (this.toast) this.toast('<strong>' + text.title + '</strong> — ' + text.body);
      try {
        // Same key as the service-worker alarm, so the session is announced only once.
        chrome.runtime.sendMessage({ type: 'lct:notify', key: finishedAt ? 'lct-pomo-' + finishedAt : '', title: text.title, message: text.body });
      } catch (error) { /* ignore */ }

      if (!this._restoring && this.settings && this.settings.pomodoro.autoStart) {
        this.start();
      } else {
        this._stopInterval();
        this.render();
      }
      this.persist();
    }

    requestDisable() {
      this.remaining = this._currentRemaining();
      this.running = false;
      this.endAt = 0;
      this.persist();
      this._stopInterval();
      this.enabled = false;
      this.clearBadge();
      if (this.widgets) this.widgets.updateTimer({ visible: false });
      this.onDisable();
    }
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.pomodoro = new Pomodoro();
})();
