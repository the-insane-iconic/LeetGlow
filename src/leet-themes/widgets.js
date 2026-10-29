/* LeetThemes — on-page widgets (shadow DOM): pomodoro, music player, focus chip, toasts. */
(function () {
  'use strict';

  const ICONS = {
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
    skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5v13l8.5-6.5L5 5.5Zm9 0v13l8.5-6.5L14 5.5Z" fill="currentColor"/></svg>',
    reset: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.7 9h2.1A5 5 0 1 0 8 8.4L11 11H4V4l3 3.1A7 7 0 0 1 12 5Z" fill="currentColor"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2Zm9 4.8-2.1.5a7.2 7.2 0 0 1-.7 1.7l1.1 1.9-1.7 1.7-1.9-1.1a7.2 7.2 0 0 1-1.7.7L14.5 21h-5l-.5-2.1a7.2 7.2 0 0 1-1.7-.7L5.4 19.3l-1.7-1.7 1.1-1.9a7.2 7.2 0 0 1-.7-1.7L2 13.5v-3l2.1-.5a7.2 7.2 0 0 1 .7-1.7L3.7 6.4l1.7-1.7 1.9 1.1a7.2 7.2 0 0 1 1.7-.7L9.5 3h5l.5 2.1a7.2 7.2 0 0 1 1.7.7l1.9-1.1 1.7 1.7-1.1 1.9a7.2 7.2 0 0 1 .7 1.7l2.1.5v3Z" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 12.6 12.6-1.4 1.4L5 6.4 6.4 5Z" fill="currentColor"/><path d="M19 6.4 6.4 19 5 17.6 17.6 5 19 6.4Z" fill="currentColor"/></svg>',
    volume: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.5-1.6a6.3 6.3 0 0 1 0 9.2l1.4 1.4a8.3 8.3 0 0 0 0-12l-1.4 1.4Z" fill="currentColor"/></svg>',
    focus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5v2H6v3H4Zm11-5h5v5h-2V6h-3V4ZM4 15h2v3h3v2H4v-5Zm14 0h2v5h-5v-2h3v-3Z" fill="currentColor"/></svg>',
    timer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2h6v2H9V2Zm3 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16Zm1 3h-2v6l4.2 2.5 1-1.7-3.2-1.9V9Z" fill="currentColor"/></svg>'
  };

  const STYLE = `
    :host {
      --w-surface: var(--lct-surface, #17171f);
      --w-surface-2: var(--lct-surface-2, #20202b);
      --w-elevated: var(--lct-elevated, #2a2a38);
      --w-text: var(--lct-text, #f4f4fa);
      --w-muted: var(--lct-muted, #9a9aae);
      --w-border: var(--lct-border, rgba(255,255,255,.12));
      --w-accent: var(--lct-accent, #a78bfa);
      --w-accent-text: var(--lct-accent-text, var(--lct-accent, #a78bfa));
      --w-on-accent: var(--lct-on-accent, #0b0b10);
      --w-accent-2: var(--lct-accent-2, #22d3ee);
      --w-font: var(--lct-font-ui, 'Inter'), system-ui, sans-serif;
      --w-mono: var(--lct-font-mono, 'JetBrains Mono'), monospace;
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483000;
      pointer-events: none;
      font-family: var(--w-font);
      color: var(--w-text);
    }
    * { box-sizing: border-box; }
    button, input { font: inherit; }
    .layer { position: fixed; inset: 0; pointer-events: none; }
    .stack {
      position: fixed;
      right: 18px;
      bottom: 18px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 10px;
      pointer-events: none;
    }
    .card, .pill, .focus-chip {
      pointer-events: auto;
      border: 1px solid var(--w-border);
      background: color-mix(in srgb, var(--w-surface) 88%, transparent);
      color: var(--w-text);
      box-shadow: 0 18px 48px -16px rgba(0,0,0,.65), 0 0 0 1px color-mix(in srgb, var(--w-accent) 10%, transparent) inset;
      backdrop-filter: blur(22px) saturate(140%);
      -webkit-backdrop-filter: blur(22px) saturate(140%);
      animation: w-in .28s cubic-bezier(.2,.9,.3,1.2) both;
    }
    @keyframes w-in { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }
    .hidden { display: none !important; }

    .timer {
      width: 232px;
      border-radius: 20px;
      padding: 14px 14px 20px;
      position: relative;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      container-type: inline-size;
    }
    .timer::before {
      content: '';
      position: absolute;
      inset: -40% -20% auto;
      height: 80%;
      background: radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--w-accent) 22%, transparent), transparent 70%);
      pointer-events: none;
    }
    .timer-head { display: flex; align-items: center; justify-content: space-between; position: relative; cursor: grab; touch-action: none; user-select: none; }
    .timer.dragging .timer-head { cursor: grabbing; }
    .timer.dragging { transition: none; box-shadow: 0 24px 60px -16px rgba(0,0,0,.8), 0 0 0 1px color-mix(in srgb, var(--w-accent) 38%, transparent); }
    .drag-grip {
      width: 10px; height: 12px; flex: none; margin-right: 1px;
      background-image: radial-gradient(currentColor 1px, transparent 1.3px);
      background-size: 4px 4px; background-position: 0 0;
      opacity: .45; border-radius: 2px;
    }
    .timer-label {
      display: inline-flex; align-items: center; gap: 7px;
      font-size: 10px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase;
      color: var(--w-accent-text);
    }
    .timer-label svg { width: 13px; height: 13px; }
    .timer-controls-top { display: flex; gap: 2px; }
    .icon-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 27px; height: 27px; padding: 0;
      border: 0; border-radius: 9px; background: transparent; color: var(--w-muted);
      cursor: pointer; transition: background .15s ease, color .15s ease;
    }
    .icon-btn:hover { background: color-mix(in srgb, var(--w-text) 8%, transparent); color: var(--w-text); }
    .icon-btn:focus-visible { outline: 2px solid var(--w-accent); outline-offset: 1px; }
    .icon-btn svg { width: 15px; height: 15px; }
    .timer-body { display: flex; align-items: center; gap: clamp(10px, 3.8cqw, 18px); margin-top: 10px; position: relative; flex: 1; }
    .ring { width: clamp(62px, 22cqw, 92px); height: clamp(62px, 22cqw, 92px); transform: rotate(-90deg); flex: none; }
    .ring circle { fill: none; stroke-width: 4; }
    .ring .track { stroke: color-mix(in srgb, var(--w-text) 10%, transparent); }
    .ring .progress { stroke: var(--w-accent); stroke-linecap: round; transition: stroke-dashoffset .35s linear; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--w-accent) 50%, transparent)); }
    .timer-readout { min-width: 0; flex: 1; }
    .timer-time { font-family: var(--w-mono); font-size: clamp(27px, 11.5cqw, 44px); font-weight: 600; letter-spacing: -.04em; line-height: 1; }
    .timer-sub { margin-top: 5px; font-size: clamp(11px, 3.1cqw, 13px); color: var(--w-muted); display: flex; align-items: center; gap: 5px; min-width: 0; }
    .timer-sub .dot { width: 5px; height: 5px; border-radius: 50%; background: var(--w-accent); flex: none; }
    .timer-sub [data-el="timerSub"] { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .timer-actions { display: flex; align-items: center; gap: 6px; margin-top: auto; padding-top: 11px; position: relative; }
    .timer-resize {
      position: absolute; right: 2px; bottom: 2px; z-index: 4;
      width: 22px; height: 22px; padding: 0; border: 0; background: transparent;
      appearance: none; -webkit-appearance: none; font: inherit;
      color: var(--w-muted); cursor: nwse-resize; touch-action: none;
    }
    .timer-resize::before {
      content: ''; position: absolute; right: 5px; bottom: 5px;
      width: 8px; height: 8px;
      border-right: 2px solid currentColor; border-bottom: 2px solid currentColor;
      border-bottom-right-radius: 2px; opacity: .55;
    }
    .timer-resize:hover::before, .timer-resize:focus-visible::before { opacity: 1; color: var(--w-text); }
    .timer-resize:focus-visible { outline: 1px solid var(--w-accent); outline-offset: -2px; border-radius: 6px; }
    .timer.resizing { transition: none; }
    .timer.resizing .timer-resize::before { opacity: 1; color: var(--w-accent); }
    .timer.compact { padding: 10px 10px 18px; border-radius: 16px; }
    .timer.compact .timer-head .icon-btn { width: 22px; height: 22px; }
    .timer.compact .timer-label { font-size: 9px; gap: 5px; letter-spacing: .1em; }
    .timer.compact .timer-label svg { width: 11px; height: 11px; }
    .timer.compact .drag-grip { display: none; }
    .timer.compact .timer-sub, .timer.compact .timer-dots { display: none; }
    .timer.compact .timer-body { margin-top: 6px; gap: 8px; }
    .timer.compact .ring { width: 46px; height: 46px; }
    .timer.compact .timer-time { font-size: 21px; }
    .timer.compact .timer-actions { gap: 4px; padding-top: 6px; }
    .timer.compact .primary-btn, .timer.compact .ghost-btn { height: 27px; font-size: 10px; border-radius: 8px; padding: 0 8px; }
    .timer.compact .primary-btn svg { width: 12px; height: 12px; }
    .timer.compact .timer-resize { width: 18px; height: 18px; }
    .primary-btn {
      flex: 1; height: 32px; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      border: 0; border-radius: 10px; cursor: pointer;
      background: var(--w-accent);
      color: var(--w-on-accent); font-size: 12px; font-weight: 750;
      transition: transform .14s ease, filter .14s ease;
    }
    .primary-btn:hover { filter: brightness(1.08); transform: translateY(-1px); }
    .primary-btn:active { transform: translateY(0); }
    .primary-btn svg { width: 14px; height: 14px; }
    .ghost-btn {
      height: 32px; padding: 0 10px; border-radius: 10px; cursor: pointer;
      border: 1px solid var(--w-border); background: transparent; color: var(--w-muted);
      font-size: 11px; transition: color .15s, background .15s;
    }
    .ghost-btn:hover { color: var(--w-text); background: color-mix(in srgb, var(--w-text) 6%, transparent); }
    .timer-dots { display: flex; gap: 4px; align-items: center; margin-left: 2px; }
    .timer-dots i { width: 5px; height: 5px; border-radius: 50%; background: color-mix(in srgb, var(--w-text) 16%, transparent); }
    .timer-dots i.on { background: var(--w-accent); box-shadow: 0 0 6px var(--w-accent); }

    .audio {
      display: flex; align-items: center; gap: 8px;
      padding: 7px 9px 7px 7px; border-radius: 999px; width: min(300px, calc(100vw - 24px));
    }
    .play-btn {
      width: 34px; height: 34px; border-radius: 50%; flex: none; border: 0; cursor: pointer;
      display: grid; place-items: center;
      background: var(--w-accent);
      color: var(--w-on-accent); box-shadow: 0 4px 14px -4px var(--w-accent);
    }
    .play-btn svg { width: 15px; height: 15px; }
    .play-btn:focus-visible { outline: 2px solid var(--w-text); outline-offset: 2px; }
    .eq { display: flex; align-items: flex-end; gap: 2px; height: 15px; width: 19px; flex: none; }
    .eq i { display: block; width: 2.5px; border-radius: 2px; background: currentColor; opacity: .35; height: 5px; }
    .audio.playing .eq i { opacity: 1; animation: eq .9s ease-in-out infinite alternate; }
    .audio.playing .eq i:nth-child(2) { animation-delay: -.25s; }
    .audio.playing .eq i:nth-child(3) { animation-delay: -.5s; }
    .audio.playing .eq i:nth-child(4) { animation-delay: -.15s; }
    @keyframes eq { from { height: 3px; } to { height: 15px; } }
    .audio-info { min-width: 0; flex: 1 1 auto; overflow: hidden; }
    .audio-title { font-size: 11px; font-weight: 700; letter-spacing: .01em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .audio-sub { font-size: 9px; color: var(--w-muted); letter-spacing: .08em; text-transform: uppercase; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .preset-btn {
      flex: none;
      border: 0; background: transparent; color: var(--w-muted); cursor: pointer;
      padding: 4px 6px; border-radius: 7px; font-size: 10px; margin-left: 1px;
    }
    .preset-btn:hover { background: color-mix(in srgb, var(--w-text) 8%, transparent); color: var(--w-text); }
    .volume-wrap { display: flex; align-items: center; gap: 5px; color: var(--w-muted); flex: none; }
    .volume-wrap svg { width: 13px; height: 13px; flex: none; }
    .volume {
      -webkit-appearance: none; appearance: none; width: 46px; height: 3px; border-radius: 99px;
      background: color-mix(in srgb, var(--w-text) 18%, transparent); outline: none; cursor: pointer;
    }
    .volume::-webkit-slider-thumb {
      -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
      background: var(--w-accent); border: 2px solid var(--w-surface); box-shadow: 0 0 0 1px var(--w-accent);
    }
    .volume::-moz-range-thumb { width: 8px; height: 8px; border-radius: 50%; background: var(--w-accent); border: 0; }
    .audio .icon-btn { width: 24px; height: 24px; }

    .focus-chip {
      position: fixed; left: 18px; bottom: 18px; border-radius: 999px;
      display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px;
      font-size: 11px; font-weight: 650; letter-spacing: .01em;
    }
    .focus-chip svg { width: 14px; height: 14px; color: var(--w-accent); }
    .focus-chip span { color: var(--w-muted); font-weight: 500; }
    .focus-chip button {
      margin-left: 2px; width: 22px; height: 22px; border: 0; border-radius: 50%; cursor: pointer;
      background: color-mix(in srgb, var(--w-text) 8%, transparent); color: var(--w-text);
      display: grid; place-items: center;
    }
    .focus-chip button:hover { background: color-mix(in srgb, var(--w-text) 15%, transparent); }
    .focus-chip button svg { width: 12px; height: 12px; color: inherit; }

    .toasts {
      position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%);
      display: flex; flex-direction: column; align-items: center; gap: 8px;
      pointer-events: none; width: min(90vw, 380px);
    }
    .toast {
      pointer-events: auto; max-width: 100%;
      padding: 10px 14px; border-radius: 12px;
      border: 1px solid var(--w-border);
      background: color-mix(in srgb, var(--w-elevated) 94%, transparent);
      color: var(--w-text); font-size: 12px; line-height: 1.35;
      box-shadow: 0 16px 40px -12px rgba(0,0,0,.7);
      backdrop-filter: blur(18px);
      animation: toast-in .25s ease both;
    }
    .toast.out { animation: toast-out .25s ease both; }
    .toast strong { color: var(--w-accent-text); font-weight: 700; }
    @keyframes toast-in { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
    @keyframes toast-out { to { opacity: 0; transform: translateY(6px) scale(.98); } }

    .timer.warn .ring .progress { stroke: var(--w-accent-2); }
    @media (max-width: 640px) {
      .stack { right: 10px; bottom: 10px; }
      .timer { width: 205px; }
      .volume { width: 38px; }
      .focus-chip { left: 10px; bottom: 10px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
    }
  `;

  const TEMPLATE = `
    <div class="layer">
      <div class="stack">
        <section class="card timer hidden" data-el="timer" aria-label="Pomodoro timer">
          <div class="timer-head" data-el="timerHead" title="Drag to move · double-click to dock">
            <div class="timer-label"><span class="drag-grip" aria-hidden="true"></span>${ICONS.timer}<span data-el="timerLabel">Focus</span></div>
            <div class="timer-controls-top">
              <button class="icon-btn" data-el="timerReset" title="Reset timer" aria-label="Reset timer">${ICONS.reset}</button>
              <button class="icon-btn" data-el="timerSettings" title="Timer settings" aria-label="Timer settings">${ICONS.settings}</button>
              <button class="icon-btn" data-el="timerClose" title="Hide timer" aria-label="Hide timer">${ICONS.close}</button>
            </div>
          </div>
          <div class="timer-body">
            <svg class="ring" viewBox="0 0 62 62" aria-hidden="true">
              <circle class="track" cx="31" cy="31" r="26"></circle>
              <circle class="progress" data-el="ringProgress" cx="31" cy="31" r="26" stroke-dasharray="163.36" stroke-dashoffset="0"></circle>
            </svg>
            <div class="timer-readout">
              <div class="timer-time" data-el="timerTime">25:00</div>
              <div class="timer-sub"><span class="dot"></span><span data-el="timerSub">Ready when you are</span></div>
            </div>
          </div>
          <div class="timer-actions">
            <button class="primary-btn" data-el="timerToggle">${ICONS.play}<span data-el="timerToggleLabel">Start</span></button>
            <button class="ghost-btn" data-el="timerSkip" title="Skip phase">Skip</button>
            <div class="timer-dots" data-el="timerDots" title="Completed focus sessions"></div>
          </div>
          <button class="timer-resize" data-el="timerResize" type="button" title="Drag to resize · double-click to reset size" aria-label="Resize timer"></button>
        </section>

        <section class="pill audio hidden" data-el="audio" aria-label="Lofi player">
          <button class="play-btn" data-el="audioToggle" aria-label="Play lofi">${ICONS.play}</button>
          <div class="eq" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
          <div class="audio-info">
            <div class="audio-title" data-el="audioTitle">Lofi Café</div>
            <div class="audio-sub" data-el="audioSub">tap to vibe</div>
          </div>
          <button class="preset-btn" data-el="audioPreset" title="Switch soundscape">next</button>
          <div class="volume-wrap">
            ${ICONS.volume}
            <input class="volume" data-el="audioVolume" type="range" min="0" max="100" value="32" aria-label="Lofi volume">
          </div>
          <button class="icon-btn" data-el="audioClose" title="Turn off lofi" aria-label="Turn off lofi">${ICONS.close}</button>
        </section>
      </div>

      <div class="focus-chip hidden" data-el="focusChip">
        ${ICONS.focus}<span>Focus mode</span>
        <button data-el="focusExit" title="Exit focus mode" aria-label="Exit focus mode">${ICONS.close}</button>
      </div>

      <div class="toasts" data-el="toasts" role="status" aria-live="polite"></div>
    </div>
  `;

  class Widgets {
    constructor() {
      this.host = null;
      this.root = null;
      this.callbacks = {};
      this.mounted = false;
      this.timerData = null;
      this.audioData = null;
      this._visible = true;
      this.savedTimerPosition = null;
      this.timerPositionApplied = false;
      this.timerDrag = null;
      this.timerResizeDrag = null;
      this._onViewportResize = this._handleViewportResize.bind(this);
    }

    mount() {
      if (this.mounted) return;
      this.mounted = true;
      const host = document.createElement('div');
      host.id = 'lct-widgets';
      host.setAttribute('data-lct-ignore', 'true');
      const root = host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = STYLE;
      root.appendChild(style);
      const wrapper = document.createElement('div');
      wrapper.innerHTML = TEMPLATE;
      root.appendChild(wrapper);
      (document.body || document.documentElement).appendChild(host);
      this.host = host;
      this.root = root;
      this.refs = {};
      root.querySelectorAll('[data-el]').forEach(function (element) {
        this.refs[element.dataset.el] = element;
      }.bind(this));
      this._bind();
    }

    configure(callbacks) {
      this.callbacks = Object.assign({}, this.callbacks, callbacks);
    }

    _call(name, arg) {
      const fn = this.callbacks[name];
      if (typeof fn === 'function') fn(arg);
    }

    _bind() {
      const refs = this.refs;
      refs.audioToggle.addEventListener('click', function () { this._call('audioToggle'); }.bind(this));
      refs.audioPreset.addEventListener('click', function () { this._call('audioNext'); }.bind(this));
      refs.audioClose.addEventListener('click', function () { this._call('audioClose'); }.bind(this));
      refs.audioVolume.addEventListener('input', function (event) {
        this._call('audioVolume', Number(event.target.value) / 100);
      }.bind(this));
      refs.timerToggle.addEventListener('click', function () { this._call('timerToggle'); }.bind(this));
      refs.timerSkip.addEventListener('click', function () { this._call('timerSkip'); }.bind(this));
      refs.timerReset.addEventListener('click', function () { this._call('timerReset'); }.bind(this));
      refs.timerClose.addEventListener('click', function () { this._call('timerClose'); }.bind(this));
      refs.timerSettings.addEventListener('click', function () { this._call('openSettings'); }.bind(this));
      refs.focusExit.addEventListener('click', function () { this._call('focusExit'); }.bind(this));
      this._bindTimerDrag();
      this._bindTimerResize();
      this._loadTimerPosition();
      window.addEventListener('resize', this._onViewportResize);
    }

    _bindTimerDrag() {
      const handle = this.refs.timerHead;
      const timer = this.refs.timer;
      if (!handle || !timer) return;

      handle.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || !event.isPrimary) return;
        if (event.target.closest('button')) return;
        const rect = timer.getBoundingClientRect();
        this.timerDrag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          moved: false
        };
        try { handle.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
        event.preventDefault();
      }.bind(this));

      handle.addEventListener('pointermove', function (event) {
        const drag = this.timerDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < 4) return;
        drag.moved = true;
        timer.classList.add('dragging');
        if (!timer.classList.contains('detached')) this._detachTimer(drag.left, drag.top, drag.width);
        const pos = this._clampTimerPosition(
          drag.left + dx,
          drag.top + dy,
          timer.offsetWidth || drag.width,
          timer.offsetHeight || drag.height
        );
        timer.style.left = pos.x + 'px';
        timer.style.top = pos.y + 'px';
        event.stopPropagation();
        event.preventDefault();
      }.bind(this));

      const finishDrag = function (event) {
        const drag = this.timerDrag;
        if (!drag || (event && event.pointerId !== drag.pointerId)) return;
        this.timerDrag = null;
        timer.classList.remove('dragging');
        if (drag.moved) {
          const pos = this._clampTimerPosition(
            parseFloat(timer.style.left) || drag.left,
            parseFloat(timer.style.top) || drag.top,
            timer.offsetWidth || drag.width,
            timer.offsetHeight || drag.height
          );
          timer.style.left = pos.x + 'px';
          timer.style.top = pos.y + 'px';
          const saved = { x: pos.x, y: pos.y };
          if (timer.classList.contains('resized')) {
            saved.width = timer.offsetWidth;
            saved.height = timer.offsetHeight;
          }
          this.savedTimerPosition = saved;
          this.timerPositionApplied = true;
          this._saveTimerPosition(this.savedTimerPosition);
        }
        try { handle.releasePointerCapture(drag.pointerId); } catch (error) { /* ignore */ }
        if (drag.moved) event.stopPropagation();
      }.bind(this);
      handle.addEventListener('pointerup', finishDrag);
      handle.addEventListener('pointercancel', finishDrag);

      handle.addEventListener('dblclick', function (event) {
        if (event.target.closest('button')) return;
        this._dockTimer();
        event.stopPropagation();
      }.bind(this));
    }

    _bindTimerResize() {
      const handle = this.refs.timerResize;
      const timer = this.refs.timer;
      if (!handle || !timer) return;

      handle.addEventListener('pointerdown', function (event) {
        if (event.button !== 0 || !event.isPrimary) return;
        const rect = timer.getBoundingClientRect();
        this.timerResizeDrag = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          startWidth: rect.width,
          startHeight: rect.height,
          left: rect.left,
          top: rect.top,
          started: false
        };
        try { handle.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
        event.preventDefault();
        event.stopPropagation();
      }.bind(this));

      handle.addEventListener('pointermove', function (event) {
        const drag = this.timerResizeDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.started && Math.hypot(dx, dy) < 3) return;
        if (!drag.started) {
          drag.started = true;
          timer.classList.add('resizing');
          if (!timer.classList.contains('detached')) this._detachTimer(drag.left, drag.top, drag.startWidth);
        }
        this._applyTimerSize(drag.startWidth + dx, drag.startHeight + dy);
        const pos = this._clampTimerPosition(
          parseFloat(timer.style.left) || drag.left,
          parseFloat(timer.style.top) || drag.top,
          timer.offsetWidth,
          timer.offsetHeight
        );
        timer.style.left = pos.x + 'px';
        timer.style.top = pos.y + 'px';
        event.preventDefault();
        event.stopPropagation();
      }.bind(this));

      const finishResize = function (event) {
        const drag = this.timerResizeDrag;
        if (!drag || (event && event.pointerId !== drag.pointerId)) return;
        this.timerResizeDrag = null;
        timer.classList.remove('resizing');
        if (drag.started) {
          const rect = timer.getBoundingClientRect();
          const pos = this._clampTimerPosition(rect.left, rect.top, rect.width, rect.height);
          timer.style.left = pos.x + 'px';
          timer.style.top = pos.y + 'px';
          this.savedTimerPosition = { x: pos.x, y: pos.y, width: rect.width, height: rect.height };
          this.timerPositionApplied = true;
          this._saveTimerPosition(this.savedTimerPosition);
        }
        try { handle.releasePointerCapture(drag.pointerId); } catch (error) { /* ignore */ }
        if (drag.started) event.stopPropagation();
      }.bind(this);
      handle.addEventListener('pointerup', finishResize);
      handle.addEventListener('pointercancel', finishResize);

      handle.addEventListener('dblclick', function (event) {
        this._resetTimerSize();
        event.preventDefault();
        event.stopPropagation();
      }.bind(this));

      handle.addEventListener('keydown', function (event) {
        const directions = {
          ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
        };
        const direction = directions[event.key];
        if (!direction) return;
        const rect = timer.getBoundingClientRect();
        if (!timer.classList.contains('detached')) this._detachTimer(rect.left, rect.top, rect.width);
        const step = event.shiftKey ? 32 : 12;
        const size = this._applyTimerSize(
          timer.offsetWidth + direction[0] * step,
          timer.offsetHeight + direction[1] * step
        );
        const pos = this._clampTimerPosition(
          parseFloat(timer.style.left) || rect.left,
          parseFloat(timer.style.top) || rect.top,
          size.width,
          size.height
        );
        timer.style.left = pos.x + 'px';
        timer.style.top = pos.y + 'px';
        this.savedTimerPosition = { x: pos.x, y: pos.y, width: size.width, height: size.height };
        this.timerPositionApplied = true;
        this._saveTimerPosition(this.savedTimerPosition);
        event.preventDefault();
        event.stopPropagation();
      }.bind(this));
    }

    _applyTimerSize(width, height) {
      const timer = this.refs.timer;
      const size = this._clampTimerSize(width, height);
      timer.style.width = size.width + 'px';
      timer.style.height = size.height + 'px';
      timer.classList.add('resized');
      timer.classList.toggle('compact', size.width < 220 || size.height < 168);
      return size;
    }

    _clampTimerSize(width, height) {
      const limitWidth = Math.max(160, Math.min(430, window.innerWidth - 16));
      const limitHeight = Math.max(130, Math.min(430, window.innerHeight - 16));
      const minWidth = Math.min(190, limitWidth);
      const minHeight = Math.min(140, limitHeight);
      return {
        width: Math.round(Math.min(Math.max(width || 232, minWidth), limitWidth)),
        height: Math.round(Math.min(Math.max(height || 170, minHeight), limitHeight))
      };
    }

    _detachTimer(left, top, width, height) {
      const timer = this.refs.timer;
      if (!timer) return;
      const measured = timer.offsetWidth || width || 232;
      timer.classList.add('detached');
      timer.style.position = 'fixed';
      timer.style.left = left + 'px';
      timer.style.top = top + 'px';
      timer.style.right = 'auto';
      timer.style.bottom = 'auto';
      timer.style.width = measured + 'px';
      if (height) {
        timer.style.height = height + 'px';
        timer.classList.add('resized');
      }
      timer.style.margin = '0';
      timer.style.zIndex = '20';
    }

    _clampTimerPosition(x, y, width, height) {
      const margin = 8;
      const w = width || 232;
      const h = height || 180;
      const maxX = Math.max(margin, window.innerWidth - w - margin);
      const maxY = Math.max(margin, window.innerHeight - h - margin);
      return {
        x: Math.min(Math.max(margin, x), maxX),
        y: Math.min(Math.max(margin, y), maxY)
      };
    }

    _applyStoredTimerPosition() {
      if (!this.savedTimerPosition || this.timerPositionApplied || !this.refs.timer) return;
      const timer = this.refs.timer;
      if (timer.classList.contains('hidden')) return;
      const saved = this.savedTimerPosition;
      const storedWidth = Number(saved.width);
      const storedHeight = Number(saved.height);
      const hasSize = isFinite(storedWidth) && isFinite(storedHeight) && storedWidth > 0 && storedHeight > 0;
      const width = hasSize ? storedWidth : (timer.offsetWidth || 232);
      this._detachTimer(saved.x, saved.y, width, hasSize ? storedHeight : 0);
      if (hasSize) {
        const size = this._applyTimerSize(storedWidth, storedHeight);
        const pos = this._clampTimerPosition(saved.x, saved.y, size.width, size.height);
        timer.style.left = pos.x + 'px';
        timer.style.top = pos.y + 'px';
        this.savedTimerPosition = { x: pos.x, y: pos.y, width: size.width, height: size.height };
      } else {
        timer.classList.remove('resized', 'compact');
        timer.style.removeProperty('height');
        const pos = this._clampTimerPosition(saved.x, saved.y, timer.offsetWidth, timer.offsetHeight);
        timer.style.left = pos.x + 'px';
        timer.style.top = pos.y + 'px';
        this.savedTimerPosition = { x: pos.x, y: pos.y };
      }
      this.timerPositionApplied = true;
    }

    _handleViewportResize() {
      if (!this.refs || !this.refs.timer || !this.refs.timer.classList.contains('detached')) return;
      const timer = this.refs.timer;
      if (timer.classList.contains('hidden')) return;
      let size = { width: timer.offsetWidth, height: timer.offsetHeight };
      if (timer.classList.contains('resized')) size = this._applyTimerSize(size.width, size.height);
      const pos = this._clampTimerPosition(
        parseFloat(timer.style.left) || 0,
        parseFloat(timer.style.top) || 0,
        size.width,
        size.height
      );
      timer.style.left = pos.x + 'px';
      timer.style.top = pos.y + 'px';
      this.savedTimerPosition = timer.classList.contains('resized')
        ? { x: pos.x, y: pos.y, width: size.width, height: size.height }
        : { x: pos.x, y: pos.y };
      this._saveTimerPosition(this.savedTimerPosition);
    }

    _saveTimerPosition(pos) {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ lctTimerPosition: pos });
        }
      } catch (error) { /* ignore */ }
    }

    _loadTimerPosition() {
      try {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
        chrome.storage.local.get('lctTimerPosition', function (result) {
          const pos = result && result.lctTimerPosition;
          if (!pos || !isFinite(pos.x) || !isFinite(pos.y)) return;
          this.savedTimerPosition = { x: Number(pos.x), y: Number(pos.y) };
          if (isFinite(pos.width) && isFinite(pos.height) && pos.width > 0 && pos.height > 0) {
            this.savedTimerPosition.width = Number(pos.width);
            this.savedTimerPosition.height = Number(pos.height);
          }
          this._applyStoredTimerPosition();
        }.bind(this));
      } catch (error) { /* ignore */ }
    }

    _resetTimerSize() {
      const timer = this.refs.timer;
      if (!timer || !timer.classList.contains('detached')) return;
      timer.style.width = '232px';
      timer.style.removeProperty('height');
      timer.classList.remove('resized', 'compact', 'resizing');
      const rect = timer.getBoundingClientRect();
      const pos = this._clampTimerPosition(rect.left, rect.top, rect.width, rect.height);
      timer.style.left = pos.x + 'px';
      timer.style.top = pos.y + 'px';
      this.savedTimerPosition = { x: pos.x, y: pos.y };
      this.timerPositionApplied = true;
      this._saveTimerPosition(this.savedTimerPosition);
    }

    _dockTimer() {
      const timer = this.refs.timer;
      if (!timer) return;
      timer.classList.remove('detached', 'dragging', 'resizing', 'resized', 'compact');
      ['position', 'left', 'top', 'right', 'bottom', 'width', 'height', 'margin', 'zIndex'].forEach(function (property) {
        timer.style.removeProperty(property.replace(/[A-Z]/g, function (letter) { return '-' + letter.toLowerCase(); }));
      });
      timer.style.removeProperty('z-index');
      this.savedTimerPosition = null;
      this.timerPositionApplied = false;
      try {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.remove('lctTimerPosition');
        }
      } catch (error) { /* ignore */ }
    }

    setVisible(visible) {
      this._visible = Boolean(visible);
      this._refreshVisibility();
    }

    _refreshVisibility() {
      if (!this.mounted) return;
      if (!this._visible) {
        this.host.style.display = 'none';
        return;
      }
      this.host.style.display = '';
      const showAudio = Boolean(this.audioData && this.audioData.visible);
      const showTimer = Boolean(this.timerData && this.timerData.visible);
      const showFocus = Boolean(this.focusVisible);
      this.refs.audio.style.display = showAudio ? '' : 'none';
      this.refs.audio.classList.toggle('hidden', !showAudio);
      this.refs.timer.style.display = showTimer ? '' : 'none';
      this.refs.timer.classList.toggle('hidden', !showTimer);
      this.refs.focusChip.style.display = showFocus ? '' : 'none';
      this.refs.focusChip.classList.toggle('hidden', !showFocus);
    }

    updateTimer(data) {
      if (!this.mounted) return;
      this.timerData = Object.assign({ visible: true }, data);
      this._refreshVisibility();
      if (!this.timerData.visible) return;
      const refs = this.refs;
      refs.timerTime.textContent = this.timerData.time || '25:00';
      refs.timerLabel.textContent = this.timerData.label || 'Focus';
      refs.timerSub.textContent = this.timerData.sub || '';
      refs.timerToggle.innerHTML = (this.timerData.running ? ICONS.pause : ICONS.play) + '<span data-el="timerToggleLabel">' + (this.timerData.running ? 'Pause' : 'Start') + '</span>';
      refs.timerToggle.setAttribute('aria-label', this.timerData.running ? 'Pause timer' : 'Start timer');
      const circle = refs.ringProgress;
      const radius = 26;
      const circumference = 2 * Math.PI * radius;
      circle.setAttribute('stroke-dasharray', circumference.toFixed(2));
      circle.setAttribute('stroke-dashoffset', (circumference * (1 - Math.max(0, Math.min(1, this.timerData.progress || 0)))).toFixed(2));
      const dots = refs.timerDots;
      dots.innerHTML = '';
      const cycles = Math.max(0, Math.min(8, this.timerData.cycles || 0));
      for (let i = 0; i < Math.max(4, cycles); i += 1) {
        const dot = document.createElement('i');
        if (i < cycles) dot.className = 'on';
        dots.appendChild(dot);
      }
      refs.timer.classList.toggle('warn', Boolean(this.timerData.warn));
      this._applyStoredTimerPosition();
    }

    updateAudio(data) {
      if (!this.mounted) return;
      this.audioData = Object.assign({ visible: true }, data);
      this._refreshVisibility();
      if (!this.audioData.visible) return;
      const refs = this.refs;
      refs.audio.classList.toggle('playing', Boolean(this.audioData.playing));
      refs.audioToggle.innerHTML = this.audioData.playing ? ICONS.pause : ICONS.play;
      refs.audioToggle.setAttribute('aria-label', this.audioData.playing ? 'Pause lofi' : 'Play lofi');
      refs.audioTitle.textContent = this.audioData.title || 'Lofi Café';
      refs.audioSub.textContent = this.audioData.playing ? 'playing' : (this.audioData.pending ? 'tap to start' : 'paused');
      refs.audioVolume.value = Math.round((this.audioData.volume == null ? 0.32 : this.audioData.volume) * 100);
    }

    setFocus(visible) {
      if (!this.mounted) return;
      this.focusVisible = Boolean(visible);
      this.refs.focusChip.classList.toggle('hidden', !visible);
      this._refreshVisibility();
    }

    showToast(html, options) {
      if (!this.mounted) return;
      const duration = (options && options.duration) || 3200;
      const toast = document.createElement('div');
      toast.className = 'toast';
      toast.innerHTML = html;
      this.refs.toasts.appendChild(toast);
      setTimeout(function () {
        toast.classList.add('out');
        setTimeout(function () { toast.remove(); }, 300);
      }, duration);
    }

    destroy() {
      window.removeEventListener('resize', this._onViewportResize);
      if (this.host) this.host.remove();
      this.mounted = false;
    }
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.widgets = new Widgets();
  globalThis.LCT.WIDGET_ICONS = ICONS;
})();
