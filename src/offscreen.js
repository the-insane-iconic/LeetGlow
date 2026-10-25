/* =============================================================================
   offscreen.js — plays sounds for LeetCode tabs that are not allowed to.

   Chrome refuses audio on a page the user has not clicked yet, so a problem
   opened straight from the address bar showed its title card in silence.
   An extension's offscreen document (reason AUDIO_PLAYBACK) is not bound by
   that rule, so when a tab may not start audio itself, sounds.js sends the
   sound through background.js to this page, which plays it with the very
   same Web Audio code (src/anime/sounds.js) or the same file.

   Messages (from a tab directly, or forwarded by background.js):
     { op: 'synth', kind, theme, volume }   an anime / crawler moment
     { op: 'file', path, volume }           a recorded cue (the game theme)
     { op: 'warm', theme }                  decode a theme's recordings early
   Chrome closes this page itself after ~30 s without audio.
============================================================================= */
(() => {
  const SFX = globalThis.LCTSSounds;
  const seen = new Set();
  /* a tab's own message (type 'lcts-sound') arrives here directly while this
     page is open; background.js forwards it (target 'lcts-offscreen') only
     when it had to open the page first, so each sound plays once */
  chrome.runtime.onMessage.addListener((raw) => {
    const m = raw && raw.type === 'lcts-sound' ? raw.msg : raw && raw.target === 'lcts-offscreen' ? raw : null;
    if (!m) return;
    /* the same message can arrive both ways while this page is opening */
    if (m.id) { if (seen.has(m.id)) return; seen.add(m.id); if (seen.size > 50) seen.delete(seen.values().next().value); }
    try {
      /* open the audio device now and keep it up while a title card may come */
      if (m.op === 'warm' && SFX) { SFX.warm(m.theme); SFX.wake(15000); }
      else if (m.op === 'synth' && SFX) {
        SFX.warm(m.theme);
        SFX.play(String(m.kind), { theme: m.theme, volume: m.volume, offscreen: true });
      } else if (m.op === 'file' && /^[\w\/.-]+\.(mp3|ogg|wav|m4a)$/.test(m.path || '')) {
        const a = new Audio(chrome.runtime.getURL(m.path));
        a.volume = Math.max(0, Math.min(1, +m.volume || 0));
        a.play().catch(() => {});
      }
    } catch (e) {}
  });
})();
