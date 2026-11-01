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
    .hidden { display: none !important; }

    /* Bottom-Right Dock Stack */
    .dock-stack {
      position: fixed;
      right: 18px;
      bottom: 18px;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
      pointer-events: none;
      z-index: 20;
    }
    .pill {
      pointer-events: auto;
      border: 1px solid var(--w-border);
      background: color-mix(in srgb, var(--w-surface) 88%, transparent);
      color: var(--w-text);
      box-shadow: 0 18px 48px -16px rgba(0,0,0,.65), 0 0 0 1px color-mix(in srgb, var(--w-accent) 10%, transparent) inset;
      backdrop-filter: blur(22px) saturate(140%);
      -webkit-backdrop-filter: blur(22px) saturate(140%);
      animation: w-in .24s cubic-bezier(.16, 1, 0.3, 1) both;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease, border-color 0.2s ease;
      user-select: none;
    }
    @keyframes w-in {
      from { opacity: 0; transform: translateY(8px) scale(.97); }
      to { opacity: 1; transform: none; }
    }

    /* Timer Pill (compact, placed on top of the Lofi bar when both active) */
    .timer-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 8px 6px 6px;
      border-radius: 999px;
      width: auto;
      max-width: min(250px, calc(100vw - 24px));
    }

    /* Audio Pill (the Lofi bar, kept intact as requested) */
    .audio-pill {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 9px 7px 7px;
      border-radius: 999px;
      width: min(300px, calc(100vw - 24px));
    }

    /* Play/Toggle button */
    .play-btn {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      flex: none;
      border: 0;
      cursor: pointer;
      display: grid;
      place-items: center;
      background: var(--w-accent);
      color: var(--w-on-accent);
      box-shadow: 0 4px 14px -4px var(--w-accent);
      transition: transform .16s cubic-bezier(0.16, 1, 0.3, 1), box-shadow .16s ease, filter .16s ease;
      position: relative;
    }
    .play-btn:hover { transform: scale(1.06); filter: brightness(1.08); }
    .play-btn:active { transform: scale(0.95); }
    .play-btn svg { width: 14px; height: 14px; }
    .play-btn:focus-visible { outline: 2px solid var(--w-text); outline-offset: 2px; }

    /* Timer Toggle button with circular progress ring */
    .timer-toggle-btn {
      position: relative;
    }
    .timer-toggle-btn .ring {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
      pointer-events: none;
    }
    .timer-toggle-btn .ring circle {
      fill: none;
    }
    .timer-toggle-btn .ring .track {
      stroke: color-mix(in srgb, var(--w-on-accent) 22%, transparent);
      stroke-width: 2.4;
    }
    .timer-toggle-btn .ring .progress {
      stroke: var(--w-on-accent);
      stroke-width: 2.4;
      stroke-linecap: round;
      transition: stroke-dashoffset .35s linear;
    }
    .timer-toggle-btn .timer-icon {
      display: grid;
      place-items: center;
      position: relative;
      z-index: 1;
    }

    /* Timer readout */
    .timer-info {
      min-width: 0;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 2px;
    }
    .timer-time {
      font-family: var(--w-mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.15;
      color: var(--w-text);
      white-space: nowrap;
    }
    .timer-sub {
      font-size: 9px;
      color: var(--w-muted);
      letter-spacing: .06em;
      text-transform: uppercase;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 110px;
    }

    /* Timer actions */
    .timer-actions {
      display: flex;
      align-items: center;
      gap: 2px;
      margin-left: 2px;
    }

    /* Audio Equalizer */
    .eq { display: flex; align-items: flex-end; gap: 2px; height: 15px; width: 19px; flex: none; }
    .eq i { display: block; width: 2.5px; border-radius: 2px; background: currentColor; opacity: .35; height: 5px; }
    .audio-pill.playing .eq i { opacity: 1; animation: eq .9s ease-in-out infinite alternate; }
    .audio-pill.playing .eq i:nth-child(2) { animation-delay: -.25s; }
    .audio-pill.playing .eq i:nth-child(3) { animation-delay: -.5s; }
    .audio-pill.playing .eq i:nth-child(4) { animation-delay: -.15s; }
    @keyframes eq { from { height: 3px; } to { height: 15px; } }

    /* Audio Readout */
    .audio-info { min-width: 0; max-width: 95px; overflow: hidden; }
    .audio-title { font-size: 11px; font-weight: 700; letter-spacing: .01em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .audio-sub { font-size: 9px; color: var(--w-muted); letter-spacing: .08em; text-transform: uppercase; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    .preset-btn {
      flex: none;
      border: 0; background: transparent; color: var(--w-muted); cursor: pointer;
      padding: 4px 6px; border-radius: 7px; font-size: 10px; margin-left: 1px;
      transition: background .15s ease, color .15s ease, transform .14s ease;
    }
    .preset-btn:hover { background: color-mix(in srgb, var(--w-text) 8%, transparent); color: var(--w-text); transform: translateY(-0.5px); }
    .preset-btn:active { transform: scale(0.95); }

    .volume-wrap { display: flex; align-items: center; gap: 5px; color: var(--w-muted); flex: none; }
    .volume-wrap svg { width: 13px; height: 13px; flex: none; }
    .volume {
      -webkit-appearance: none; appearance: none; width: 44px; height: 3px; border-radius: 99px;
      background: color-mix(in srgb, var(--w-text) 18%, transparent); outline: none; cursor: pointer;
    }
    .volume::-webkit-slider-thumb {
      -webkit-appearance: none; width: 10px; height: 10px; border-radius: 50%;
      background: var(--w-accent); border: 2px solid var(--w-surface); box-shadow: 0 0 0 1px var(--w-accent);
      transition: transform .14s ease, box-shadow .14s ease;
    }
    .volume::-webkit-slider-thumb:hover { transform: scale(1.2); }
    .volume::-moz-range-thumb { width: 8px; height: 8px; border-radius: 50%; background: var(--w-accent); border: 0; }

    /* Common Icon Button */
    .icon-btn {
      display: inline-flex; align-items: center; justify-content: center;
      width: 24px; height: 24px; padding: 0;
      border: 0; border-radius: 8px; background: transparent; color: var(--w-muted);
      cursor: pointer; transition: background .15s ease, color .15s ease, transform .14s ease;
      flex: none;
    }
    .icon-btn:hover { background: color-mix(in srgb, var(--w-text) 8%, transparent); color: var(--w-text); transform: scale(1.08); }
    .icon-btn:active { transform: scale(0.92); }
    .icon-btn:focus-visible { outline: 2px solid var(--w-accent); outline-offset: 1px; }
    .icon-btn svg { width: 14px; height: 14px; }

    .focus-chip {
      position: fixed; left: 18px; bottom: 18px; border-radius: 999px;
      display: flex; align-items: center; gap: 8px;
      padding: 7px 10px 7px 7px;
      width: auto; max-width: min(290px, calc(100vw - 24px));
      cursor: default; user-select: none;
    }
    .focus-badge {
      width: 34px; height: 34px; border-radius: 50%; flex: none;
      display: grid; place-items: center;
      background: var(--w-accent);
      color: var(--w-on-accent);
      box-shadow: 0 4px 14px -4px var(--w-accent);
      transition: transform .16s cubic-bezier(0.16, 1, 0.3, 1), filter .16s ease;
    }
    .focus-chip:hover .focus-badge {
      transform: scale(1.06); filter: brightness(1.08);
    }
    .focus-badge svg {
      width: 15px; height: 15px; fill: currentColor;
    }
    .focus-pulse {
      display: flex; align-items: center; justify-content: center;
      width: 12px; height: 12px; position: relative; flex: none;
    }
    .focus-pulse-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--w-accent);
      box-shadow: 0 0 8px var(--w-accent);
    }
    .focus-pulse-ring {
      position: absolute; width: 12px; height: 12px; border-radius: 50%;
      border: 1.5px solid var(--w-accent);
      animation: focus-ring 2s cubic-bezier(0.24, 0, 0.38, 1) infinite;
      opacity: 0;
    }
    @keyframes focus-ring {
      0% { transform: scale(0.5); opacity: 0.9; }
      50% { opacity: 0.4; }
      100% { transform: scale(1.8); opacity: 0; }
    }
    .focus-info {
      min-width: 0; flex: 1 1 auto; overflow: hidden; padding-right: 4px;
    }
    .focus-title {
      font-size: 11px; font-weight: 700; letter-spacing: .01em; line-height: 1.2;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--w-text);
    }
    .focus-sub {
      font-size: 9px; color: var(--w-muted); letter-spacing: .08em;
      text-transform: uppercase; margin-top: 2px; white-space: nowrap;
      overflow: hidden; text-overflow: ellipsis;
    }
    .focus-chip .icon-btn {
      width: 24px; height: 24px; flex: none;
    }

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

    .timer-pill.warn .timer-toggle-btn {
      background: var(--w-accent-2);
      box-shadow: 0 4px 14px -4px var(--w-accent-2);
    }
    .timer-pill.warn .ring .progress {
      stroke: var(--w-on-accent);
    }

    /* Light Theme Refinements — eliminates heavy dark blotches & harsh drop shadows */
    :host-context([data-lct-mode="light"]),
    :host-context(.light),
    :host-context([data-theme="light"]),
    :host([data-mode="light"]) {
      --w-surface: var(--lct-surface, #fbf8f1);
      --w-surface-2: var(--lct-surface-2, #efe8d9);
      --w-elevated: var(--lct-elevated, #ffffff);
      --w-text: var(--lct-text, #1c1917);
      --w-muted: var(--lct-muted, #6d685d);
      --w-border: var(--lct-border, rgba(43, 42, 38, 0.13));
    }

    :host-context([data-lct-mode="light"]) .pill,
    :host-context(.light) .pill,
    :host-context([data-theme="light"]) .pill,
    :host([data-mode="light"]) .pill {
      background: color-mix(in srgb, var(--w-surface) 92%, transparent);
      border: 1px solid color-mix(in srgb, var(--w-text) 12%, transparent);
      box-shadow: 0 10px 32px -8px rgba(0,0,0,.09), 0 2px 6px -1px rgba(0,0,0,.04), 0 0 0 1px rgba(255,255,255,.7) inset;
      backdrop-filter: blur(24px) saturate(120%);
      -webkit-backdrop-filter: blur(24px) saturate(120%);
    }

    :host-context([data-lct-mode="light"]) .play-btn,
    :host-context(.light) .play-btn,
    :host-context([data-theme="light"]) .play-btn,
    :host([data-mode="light"]) .play-btn {
      background: color-mix(in srgb, var(--w-accent) 15%, var(--w-surface));
      color: var(--w-accent-text, var(--w-accent));
      border: 1px solid color-mix(in srgb, var(--w-accent) 26%, transparent);
      box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--w-accent) 22%, transparent);
    }
    :host-context([data-lct-mode="light"]) .play-btn:hover,
    :host-context(.light) .play-btn:hover,
    :host-context([data-theme="light"]) .play-btn:hover,
    :host([data-mode="light"]) .play-btn:hover {
      background: color-mix(in srgb, var(--w-accent) 22%, var(--w-surface));
      border-color: color-mix(in srgb, var(--w-accent) 38%, transparent);
      box-shadow: 0 3px 10px -2px color-mix(in srgb, var(--w-accent) 30%, transparent);
    }
    :host-context([data-lct-mode="light"]) .play-btn:active,
    :host-context(.light) .play-btn:active,
    :host-context([data-theme="light"]) .play-btn:active,
    :host([data-mode="light"]) .play-btn:active {
      background: color-mix(in srgb, var(--w-accent) 28%, var(--w-surface));
    }

    :host-context([data-lct-mode="light"]) .timer-toggle-btn .ring .track,
    :host-context(.light) .timer-toggle-btn .ring .track,
    :host-context([data-theme="light"]) .timer-toggle-btn .ring .track,
    :host([data-mode="light"]) .timer-toggle-btn .ring .track {
      stroke: color-mix(in srgb, var(--w-accent) 16%, transparent);
    }
    :host-context([data-lct-mode="light"]) .timer-toggle-btn .ring .progress,
    :host-context(.light) .timer-toggle-btn .ring .progress,
    :host-context([data-theme="light"]) .timer-toggle-btn .ring .progress,
    :host([data-mode="light"]) .timer-toggle-btn .ring .progress {
      stroke: var(--w-accent-text, var(--w-accent));
    }

    :host-context([data-lct-mode="light"]) .timer-pill.warn .timer-toggle-btn,
    :host-context(.light) .timer-pill.warn .timer-toggle-btn,
    :host-context([data-theme="light"]) .timer-pill.warn .timer-toggle-btn,
    :host([data-mode="light"]) .timer-pill.warn .timer-toggle-btn {
      background: color-mix(in srgb, var(--w-accent-2) 16%, var(--w-surface));
      color: var(--w-accent-2);
      border-color: color-mix(in srgb, var(--w-accent-2) 30%, transparent);
      box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--w-accent-2) 24%, transparent);
    }

    :host-context([data-lct-mode="light"]) .audio-pill.playing .eq i,
    :host-context(.light) .audio-pill.playing .eq i,
    :host-context([data-theme="light"]) .audio-pill.playing .eq i,
    :host([data-mode="light"]) .audio-pill.playing .eq i {
      background: var(--w-accent-text, var(--w-accent));
    }

    :host-context([data-lct-mode="light"]) .volume,
    :host-context(.light) .volume,
    :host-context([data-theme="light"]) .volume,
    :host([data-mode="light"]) .volume {
      background: color-mix(in srgb, var(--w-text) 14%, transparent);
    }

    :host-context([data-lct-mode="light"]) .focus-badge,
    :host-context(.light) .focus-badge,
    :host-context([data-theme="light"]) .focus-badge,
    :host([data-mode="light"]) .focus-badge {
      background: color-mix(in srgb, var(--w-accent) 15%, var(--w-surface));
      color: var(--w-accent-text, var(--w-accent));
      border: 1px solid color-mix(in srgb, var(--w-accent) 26%, transparent);
      box-shadow: 0 2px 8px -2px color-mix(in srgb, var(--w-accent) 22%, transparent);
    }
    :host-context([data-lct-mode="light"]) .focus-pulse-dot,
    :host-context(.light) .focus-pulse-dot,
    :host-context([data-theme="light"]) .focus-pulse-dot,
    :host([data-mode="light"]) .focus-pulse-dot {
      background: var(--w-accent-text, var(--w-accent));
      box-shadow: 0 0 6px color-mix(in srgb, var(--w-accent) 40%, transparent);
    }
    :host-context([data-lct-mode="light"]) .focus-pulse-ring,
    :host-context(.light) .focus-pulse-ring,
    :host-context([data-theme="light"]) .focus-pulse-ring,
    :host([data-mode="light"]) .focus-pulse-ring {
      border-color: var(--w-accent-text, var(--w-accent));
    }

    @media (max-width: 640px) {
      .dock-stack { right: 10px; bottom: 10px; }
      .audio-pill { width: calc(100vw - 20px); }
      .volume { width: 34px; }
      .focus-chip { left: 10px; bottom: 10px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .001ms !important; transition-duration: .001ms !important; }
    }
  `;

  const TEMPLATE = `
    <div class="layer">
      <div class="dock-stack" data-el="dockStack">
        <!-- Timer bar (placed on top of the lofi bar when both active) -->
        <section class="pill timer-pill hidden" data-el="timer" aria-label="Pomodoro timer">
          <button class="play-btn timer-toggle-btn" data-el="timerToggle" title="Start timer" aria-label="Start timer">
            <svg class="ring" viewBox="0 0 34 34" aria-hidden="true">
              <circle class="track" cx="17" cy="17" r="14.5"></circle>
              <circle class="progress" data-el="ringProgress" cx="17" cy="17" r="14.5" stroke-dasharray="91.1" stroke-dashoffset="0"></circle>
            </svg>
            <span class="timer-icon" data-el="timerIcon">${ICONS.play}</span>
          </button>
          <div class="timer-info">
            <div class="timer-time" data-el="timerTime">25:00</div>
            <div class="timer-sub" data-el="timerSub"><span data-el="timerLabel">Focus</span></div>
          </div>
          <div class="timer-actions">
            <button class="icon-btn" data-el="timerSkip" title="Skip phase" aria-label="Skip phase">${ICONS.skip}</button>
            <button class="icon-btn" data-el="timerReset" title="Reset timer" aria-label="Reset timer">${ICONS.reset}</button>
            <button class="icon-btn" data-el="timerClose" title="Hide timer" aria-label="Hide timer">${ICONS.close}</button>
          </div>
        </section>

        <!-- Lofi bar (on bottom, kept intact) -->
        <section class="pill audio-pill hidden" data-el="audio" aria-label="Lofi player">
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

      <section class="pill focus-chip hidden" data-el="focusChip" aria-label="Focus mode active">
        <div class="focus-badge" aria-hidden="true">${ICONS.focus}</div>
        <div class="focus-pulse" aria-hidden="true">
          <span class="focus-pulse-ring"></span>
          <span class="focus-pulse-dot"></span>
        </div>
        <div class="focus-info">
          <div class="focus-title">Focus Mode</div>
          <div class="focus-sub">Distraction-free · ⌘⇧.</div>
        </div>
        <button class="icon-btn" data-el="focusExit" title="Exit focus mode (⌘+Shift+.)" aria-label="Exit focus mode">${ICONS.close}</button>
      </section>

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
      this.focusVisible = false;
      this._visible = true;
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
      this._syncMode();
      if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined' && document.documentElement) {
        this.modeObserver = new MutationObserver(this._syncMode.bind(this));
        this.modeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['data-lct-mode', 'class', 'data-theme']
        });
      }
    }

    _syncMode() {
      if (!this.host || typeof document === 'undefined') return;
      const doc = document.documentElement;
      if (!doc) return;
      const isLight = doc.dataset.lctMode === 'light' || doc.classList.contains('light') || doc.getAttribute('data-theme') === 'light';
      this.host.setAttribute('data-mode', isLight ? 'light' : 'dark');
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
      if (refs.audioToggle) refs.audioToggle.addEventListener('click', function () { this._call('audioToggle'); }.bind(this));
      if (refs.audioPreset) refs.audioPreset.addEventListener('click', function () { this._call('audioNext'); }.bind(this));
      if (refs.audioClose) refs.audioClose.addEventListener('click', function () { this._call('audioClose'); }.bind(this));
      if (refs.audioVolume) refs.audioVolume.addEventListener('input', function (event) {
        this._call('audioVolume', Number(event.target.value) / 100);
      }.bind(this));
      if (refs.timerToggle) refs.timerToggle.addEventListener('click', function () { this._call('timerToggle'); }.bind(this));
      if (refs.timerSkip) refs.timerSkip.addEventListener('click', function () { this._call('timerSkip'); }.bind(this));
      if (refs.timerReset) refs.timerReset.addEventListener('click', function () { this._call('timerReset'); }.bind(this));
      if (refs.timerClose) refs.timerClose.addEventListener('click', function () { this._call('timerClose'); }.bind(this));
      if (refs.timerSettings) refs.timerSettings.addEventListener('click', function () { this._call('openSettings'); }.bind(this));
      if (refs.focusExit) refs.focusExit.addEventListener('click', function () { this._call('focusExit'); }.bind(this));
    }

    setVisible(visible) {
      this._visible = Boolean(visible);
      this._refreshVisibility();
    }

    _refreshVisibility() {
      if (!this.mounted) return;
      this._syncMode();
      if (!this._visible) {
        this.host.style.display = 'none';
        return;
      }
      this.host.style.display = '';
      const showAudio = Boolean(this.audioData && this.audioData.visible);
      const showTimer = Boolean(this.timerData && this.timerData.visible);
      const showFocus = Boolean(this.focusVisible);

      if (this.refs.timer) {
        this.refs.timer.style.display = showTimer ? 'flex' : 'none';
        this.refs.timer.classList.toggle('hidden', !showTimer);
      }
      if (this.refs.audio) {
        this.refs.audio.style.display = showAudio ? 'flex' : 'none';
        this.refs.audio.classList.toggle('hidden', !showAudio);
      }
      if (this.refs.focusChip) {
        this.refs.focusChip.style.display = showFocus ? 'flex' : 'none';
        this.refs.focusChip.classList.toggle('hidden', !showFocus);
      }
    }

    updateTimer(data) {
      if (!this.mounted) return;
      this.timerData = Object.assign({ visible: true }, data);
      this._refreshVisibility();
      if (!this.timerData.visible) return;
      const refs = this.refs;
      if (refs.timerTime) refs.timerTime.textContent = this.timerData.time || '25:00';
      if (refs.timerLabel) refs.timerLabel.textContent = this.timerData.label || 'Focus';
      if (refs.timerSub) {
        const label = this.timerData.label || 'Focus';
        const sub = this.timerData.sub;
        refs.timerSub.textContent = sub ? (label + ' · ' + sub) : label;
      }
      if (refs.timerIcon) {
        refs.timerIcon.innerHTML = this.timerData.running ? ICONS.pause : ICONS.play;
      }
      if (refs.timerToggle) {
        const title = this.timerData.running ? 'Pause timer' : 'Start timer';
        refs.timerToggle.setAttribute('aria-label', title);
        refs.timerToggle.setAttribute('title', title);
      }
      const circle = refs.ringProgress;
      if (circle) {
        const radius = 14.5;
        const circumference = 2 * Math.PI * radius; // ~91.11
        circle.setAttribute('stroke-dasharray', circumference.toFixed(2));
        circle.setAttribute('stroke-dashoffset', (circumference * (1 - Math.max(0, Math.min(1, this.timerData.progress || 0)))).toFixed(2));
      }
      if (refs.timer) {
        refs.timer.classList.toggle('warn', Boolean(this.timerData.warn));
      }
    }

    updateAudio(data) {
      if (!this.mounted) return;
      this.audioData = Object.assign({ visible: true }, data);
      this._refreshVisibility();
      if (!this.audioData.visible) return;
      const refs = this.refs;
      if (refs.audio) {
        refs.audio.classList.toggle('playing', Boolean(this.audioData.playing));
      }
      if (refs.audioToggle) {
        refs.audioToggle.innerHTML = this.audioData.playing ? ICONS.pause : ICONS.play;
        refs.audioToggle.setAttribute('aria-label', this.audioData.playing ? 'Pause lofi' : 'Play lofi');
      }
      if (refs.audioTitle) refs.audioTitle.textContent = this.audioData.title || 'Lofi Café';
      if (refs.audioSub) refs.audioSub.textContent = this.audioData.playing ? 'playing' : (this.audioData.pending ? 'tap to start' : 'paused');
      if (refs.audioVolume) refs.audioVolume.value = Math.round((this.audioData.volume == null ? 0.32 : this.audioData.volume) * 100);
    }

    setFocus(visible) {
      if (!this.mounted) return;
      this.focusVisible = Boolean(visible);
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
      if (this.modeObserver) {
        this.modeObserver.disconnect();
        this.modeObserver = null;
      }
      if (this.host) this.host.remove();
      this.mounted = false;
    }
  }

  globalThis.LCT = globalThis.LCT || {};
  globalThis.LCT.widgets = new Widgets();
  globalThis.LCT.WIDGET_ICONS = ICONS;
})();
