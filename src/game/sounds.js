/* =============================================================================
   sounds.js  (isolated world, LeetCode)

   Gaming Theme audio cues -- currently PLACEHOLDERS. Every moment already
   asks for its cue by name; the audio files themselves are not in the repo
   yet, and nothing breaks while they are missing (see "MISSING FILES ARE
   NORMAL" below). Dropping a correctly named file into sounds/game/ is the
   only step needed to make a cue audible.

   WHERE THE FILES GO
     sounds/game/<file>   -- see CUES below for the exact names, and
                             sounds/game/README.md for the list in one place.
   The names are data, not code: to use .ogg instead of .mp3, or to rename a
   cue's file, change only the `file` string in CUES.

   MISSING FILES ARE NORMAL
   A cue whose file 404s is remembered as missing and never requested again,
   and it fails silently -- no console noise, no retry loop, no thrown error
   reaching the moment that asked for it. That is what makes these usable as
   placeholders: the whole system is inert until real audio exists.

   AUTOPLAY
   Chrome refuses audio with sound on a page the user has never interacted
   with. This used to pre-gate every cue on
   navigator.userActivation.hasBeenActive, the way src/anime/sounds.js does
   and CLAUDE.md records -- but that rule was written for a theme whose
   moments all follow a click. Here it silenced the title card outright,
   since that one fires on problem open, before any gesture exists. The gate
   is gone: cues attempt playback and a genuine refusal is caught and
   reported once (see play()). On a fresh load with no interaction at all the
   title card can still be refused by the browser -- that is policy, not
   something this file can route around -- but it now plays in every case
   the browser actually permits, including in-app navigation between
   problems, where the document already carries the click that got you there.

   COST
   Nothing is fetched at load. An Audio element is created the first time its
   cue is actually asked for, then cached, so an unused cue costs nothing and
   a page that never submits never touches the network. No AudioContext is
   created at all -- these are file cues, not synthesised ones like the anime
   theme's, which is why this file is much smaller than src/anime/sounds.js.
============================================================================= */
(function (root) {
  'use strict';

  var DIR = 'sounds/game/';

  /* delay is milliseconds after the moment starts, chosen to land on that
     moment's own beat in themes/game.css and src/game/result.js rather than
     firing everything at t=0 -- a cue that lands with the motion reads as
     one event, a cue that lands before it reads as two. */
  var CUES = {
    /* the level intro, src/game/title-card.js -- lands as the emblem sets */
    title: { file: 'title-card.mp3',      volume: 0.55, delay: 260 },
    /* Accepted: with the bloom ring opening */
    ac:    { file: 'quest-complete.mp3',  volume: 0.60, delay: 120 },
    /* tests passed: the quieter checkpoint chime */
    run:   { file: 'checkpoint.mp3',      volume: 0.45, delay: 80  },
    /* Wrong Answer: as the first character starts decoding */
    wa:    { file: 'attempt-failed.mp3',  volume: 0.50, delay: 300 },
    /* Time Limit: as the timer bar starts draining */
    tle:   { file: 'time-out.mp3',        volume: 0.50, delay: 390 },
    /* Memory Limit: as the pressure cracks start drawing */
    mle:   { file: 'memory-drained.mp3',  volume: 0.50, delay: 420 },
    /* Compile/Runtime Error: on the glitch, not on the word's entrance */
    err:   { file: 'spell-misfired.mp3',  volume: 0.50, delay: 810 }
  };

  var cache = {};       /* name -> HTMLAudioElement, built on first use */
  var missing = {};     /* name -> true once its file has failed to load */
  var warned = {};      /* kind:name -> true, so a diagnosis prints once only */
  var master = 1;
  var muted = false;

  /* Silence used to be completely undiagnosable: a missing file and a
     browser-blocked cue both produced exactly nothing, with no way to tell
     which (or whether the cue had even fired). One line, once per cue, is
     worth far more than the console quiet it costs. */
  function warnOnce(kind, name, msg) {
    var key = kind + ':' + name;
    if (warned[key]) return;
    warned[key] = true;
    try { console.warn('[Theme Studio] sound "' + name + '" ' + msg); } catch (e) {}
  }

  /* a single storage-backed mute, so audio can be silenced without a UI
     existing yet. Absent key means on. */
  try {
    chrome.storage.local.get(['lcGameSound', 'lcGameVolume'], function (res) {
      if (res && res.lcGameSound === false) muted = true;
      if (res && typeof res.lcGameVolume === 'number') master = res.lcGameVolume;
    });
    chrome.storage.onChanged.addListener(function (ch, area) {
      if (area !== 'local') return;
      if (ch.lcGameSound) muted = ch.lcGameSound.newValue === false;
      if (ch.lcGameVolume && typeof ch.lcGameVolume.newValue === 'number') master = ch.lcGameVolume.newValue;
    });
  } catch (e) {}

  function url(file) {
    return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
      ? chrome.runtime.getURL(DIR + file)
      : DIR + file;
  }

  function element(name) {
    if (cache[name]) return cache[name];
    var cue = CUES[name];
    if (!cue) return null;
    var audio = new Audio(url(cue.file));
    audio.preload = 'auto';
    /* the placeholder contract: one failure, then this cue is inert */
    audio.addEventListener('error', function () {
      missing[name] = true;
      warnOnce('missing', name, 'has no file at ' + DIR + cue.file +
        ' -- add it, or point CUES.' + name + '.file at a different name.');
    }, { once: true });
    cache[name] = audio;
    return audio;
  }

  /* One bounded second chance for a cue the browser refused. Listens for the
     next real gesture and replays only if it arrives inside `window` ms;
     after that the listeners come off and the cue is simply dropped. Capture
     phase and `once` so this never interferes with the page's own handlers
     and cannot leak past a single attempt. */
  function retryOnGesture(name, audio, window) {
    var done = false;
    var timer = 0;
    function cleanup() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      document.removeEventListener('pointerdown', fire, true);
      document.removeEventListener('keydown', fire, true);
    }
    function fire() {
      cleanup();
      if (muted || missing[name]) return;
      try {
        var p2 = audio.play();
        if (p2 && p2.catch) p2.catch(function () {
          warnOnce('blocked', name, 'was refused by the browser even after a user gesture.');
        });
      } catch (e) {}
    }
    document.addEventListener('pointerdown', fire, true);
    document.addEventListener('keydown', fire, true);
    timer = setTimeout(cleanup, window);
  }

  /* Fires cue `name` after its own delay. Returns the timeout id so the
     caller can cancel it if its moment is torn down early (result.js pushes
     it onto the same timeouts array clearAnimation() already drains), or 0
     when nothing was scheduled.

     opts.retryWithin (ms) opts a cue into one gesture-triggered retry if the
     browser refuses it outright -- see retryOnGesture above. Only worth it
     for cues that fire without a click of their own; a verdict always
     follows one, so it never needs this. */
  function play(name, opts) {
    var cue = CUES[name];
    if (!cue || muted || missing[name]) return 0;
    /* NO pre-gate on navigator.userActivation.hasBeenActive here any more.
       That check returned 0 before anything was even scheduled, and it is
       what kept the title card permanently silent: the card fires on problem
       OPEN, which on a fresh load or refresh is precisely the moment the
       document has not yet seen a user gesture. Verdicts always follow a
       Submit/Run click, so they passed the gate and played -- which is why
       only the title card appeared broken.

       It was also stricter than the browser itself. Chrome permits audio on
       sticky activation OR on a high enough Media Engagement Index for the
       origin, so pre-gating on activation alone refused cues the browser
       would have allowed. Attempt playback instead and let the browser be
       the judge; a genuine block rejects with NotAllowedError, which is
       caught below and reported once rather than thrown. */
    opts = opts || {};
    var delay = typeof opts.delay === 'number' ? opts.delay : cue.delay;
    return setTimeout(function () {
      if (missing[name] || muted) return;
      var audio = element(name);
      if (!audio) return;
      /* currentTime gets its OWN try. It only matters for a replay, but on a
         freshly created element that has not loaded yet some engines throw
         InvalidStateError on the assignment -- and it used to sit inside the
         same try as play(), so that throw skipped the play() call entirely
         and the cue died silently on its very first use. */
      /* a tab the user has not clicked yet may not start audio (a problem
         opened from the address bar): the extension's offscreen page plays
         the cue instead (src/offscreen.js), with no gesture needed */
      var S = root.LCTSSounds;
      if (S && S.mayStart && !S.mayStart() &&
          S.handOff({ op: 'file', path: DIR + cue.file, volume: Math.max(0, Math.min(1, cue.volume * master)) })) return;
      try { if (audio.readyState > 0) audio.currentTime = 0; } catch (e) {}
      try {
        audio.volume = Math.max(0, Math.min(1, cue.volume * master));
        var p = audio.play();
        if (p && p.catch) p.catch(function (err) {
          if (!err || err.name !== 'NotAllowedError') return;
          /* A real autoplay refusal: the page has had no interaction yet.
             This is the title card's normal state on a cold load, since it
             fires on problem open. The browser will accept the very next
             gesture, so wait for one -- but only briefly, so a chime can
             never arrive long after the moment it belongs to has gone. */
          if (opts.retryWithin > 0) { retryOnGesture(name, audio, opts.retryWithin); return; }
          warnOnce('blocked', name, 'was blocked by the browser autoplay policy ' +
            '(no user interaction on this page yet). Click anywhere in the page, ' +
            'then reopen the problem.');
        });
      } catch (e) {}
    }, Math.max(0, delay));
  }

  root.LCTSGameSounds = { play: play, CUES: CUES, DIR: DIR };
})(globalThis);
