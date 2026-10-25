/* =============================================================================
   background.js — the focus-mode shortcut.

   Extension shortcuts are delivered here, not to the page. The toggle is
   written to storage, and every open problem tab hears it through
   storage.onChanged, so focus mode flips everywhere at once. The key is
   rebindable at chrome://extensions/shortcuts.
============================================================================= */
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'toggle-focus') return;
  chrome.storage.local.get('lcFocus', (res) => {
    chrome.storage.local.set({ lcFocus: !(res && res.lcFocus) });
  });
});

/* Title cards used to be limited to once per problem per day, remembered in
   lcAnimeSeen. They now follow the problem's solved state instead, so the old
   list is cleared once when the extension installs or updates. */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.remove('lcAnimeSeen');
});

/* Sound for tabs that may not play it themselves. Chrome refuses audio on a
   page the user has not clicked yet (a problem opened from the address bar),
   so src/anime/sounds.js and src/game/sounds.js hand the sound here and the
   offscreen document (src/offscreen.js) plays it. One document at most.
   When the document is already open it receives the tab's message itself;
   this only opens it and forwards the messages that arrived before it was. */
let opening = null;
function ensureOffscreen() {
  if (!chrome.offscreen) return Promise.reject(new Error('no offscreen API'));
  if (!opening) {
    opening = (async () => {
      const url = chrome.runtime.getURL('src/offscreen.html');
      const open = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
      if (open.length) return false;
      await chrome.offscreen.createDocument({
        url, reasons: ['AUDIO_PLAYBACK'],
        justification: 'Plays the theme\'s moment sounds when the LeetCode tab itself may not start audio.'
      });
      return true;
    })().finally(() => { opening = null; });
  }
  return opening;
}

chrome.runtime.onMessage.addListener((m, sender) => {
  if (!m || m.type !== 'lcts-sound' || !sender.tab) return;
  const wasOpening = !!opening;
  ensureOffscreen()
    .then((created) => {
      /* the page did not exist when this message was broadcast: deliver it */
      if (created || wasOpening) chrome.runtime.sendMessage(Object.assign({}, m.msg, { target: 'lcts-offscreen' }));
    })
    .catch(() => {});
});
