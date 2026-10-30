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

async function refreshDailyProblemCache() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const res = await chrome.storage.local.get('lcDailyProblemCache');
    const cached = res && res.lcDailyProblemCache;
    if (cached && cached.date === today && cached.url) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const resp = await fetch('https://leetcode.com/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `query questionOfToday {
          activeDailyCodingChallengeQuestion {
            date
            link
            question {
              title
              difficulty
              titleSlug
            }
          }
        }`
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!resp.ok) return;
    const json = await resp.json();
    const daily = json && json.data && json.data.activeDailyCodingChallengeQuestion;
    if (!daily || !daily.link) return;

    const fullUrl = daily.link.startsWith('http')
      ? daily.link
      : `https://leetcode.com${daily.link}`;

    await chrome.storage.local.set({
      lcDailyProblemCache: {
        date: daily.date || today,
        url: fullUrl,
        title: (daily.question && daily.question.title) || 'Daily Problem',
        difficulty: (daily.question && daily.question.difficulty) || '',
        titleSlug: (daily.question && daily.question.titleSlug) || ''
      }
    });
  } catch (e) {
    // silently ignore background fetch failures
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.local.remove(['lcAnimeSeen', 'leetglowPremium']);
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.error('[LeetGlow] sidePanel.setPanelBehavior error:', error));
  }
  refreshDailyProblemCache().then(() => {
    if (details && details.reason === 'install') {
      chrome.storage.local.get('lcDailyProblemCache', (res) => {
        const url = (res && res.lcDailyProblemCache && res.lcDailyProblemCache.url) || 'https://leetcode.com/problemset/';
        chrome.tabs.create({ url });
      });
    }
  });
});

// Periodic cache refresh on startup / wake
if (chrome.runtime.onStartup) {
  chrome.runtime.onStartup.addListener(() => {
    refreshDailyProblemCache();
  });
}
refreshDailyProblemCache();

/* Side Panel: Open sidebar on extension icon click (Chrome Side Panel API) */
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error('[LeetGlow] sidePanel.setPanelBehavior error:', error));
}
if (chrome.action && chrome.action.onClicked) {
  chrome.action.onClicked.addListener(async (tab) => {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } catch (err) {
        console.error('[LeetGlow] Error opening side panel on action click:', err);
      }
    }
  });
}

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
  if (m && m.type === 'open-side-panel') {
    if (sender && sender.tab && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => {});
    }
    return;
  }
  if (m && m.type === 'lcts-close-offscreen') {
    if (chrome.offscreen && chrome.offscreen.closeDocument) {
      chrome.offscreen.closeDocument().catch(() => {});
    }
    return;
  }
  if (!m || m.type !== 'lcts-sound' || !sender.tab) return;
  const wasOpening = !!opening;
  ensureOffscreen()
    .then((created) => {
      /* the page did not exist when this message was broadcast: deliver it */
      if (created || wasOpening) chrome.runtime.sendMessage(Object.assign({}, m.msg, { target: 'lcts-offscreen' }));
    })
    .catch(() => {});
});
