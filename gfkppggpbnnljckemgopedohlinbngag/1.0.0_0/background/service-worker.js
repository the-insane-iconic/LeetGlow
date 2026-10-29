/* LeetThemes — service worker: install flow, shortcuts, notifications, badge. */
'use strict';

importScripts('../shared/themes.js', '../shared/config.js');

const BADGE_COLOR = '#e46b9e';

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html?welcome=1') });
    chrome.action.setBadgeText({ text: '' });
  }
});

chrome.commands.onCommand.addListener(async function (command) {
  try {
    const settings = await LCT.getSettings();
    if (command === 'cycle-theme') {
      const theme = LCT.nextTheme(settings.themeId);
      if (theme) await LCT.setSettings({ themeId: theme.id, enabled: true });
    }
    if (command === 'toggle-focus') {
      await LCT.setSettings({ enabled: true, focus: { enabled: !settings.focus.enabled } });
    }
    if (command === 'toggle-audio') {
      await LCT.setSettings({ enabled: true, audio: { enabled: !settings.audio.enabled } });
    }
    if (command === 'toggle-timer') {
      await LCT.setSettings({ enabled: true, pomodoro: { enabled: !settings.pomodoro.enabled } });
    }
  } catch (error) {
    console.warn('LeetThemes command failed', error);
  }
});

/* Pomodoro end alerts. Content-script timers are throttled in background tabs, so the
   service worker owns an alarm for the session end and shows the notification on time. */
const POMO_ALARM = 'lct-pomodoro';
const POMO_PAYLOAD_KEY = 'lctPomodoroAlarm';
const SHOWN_KEY = 'lctShownNotifications';
let notifyQueue = Promise.resolve();

// Show a notification at most once per key (the alarm and every open tab may report the same session).
function showOnce(key, title, message) {
  notifyQueue = notifyQueue.then(async function () {
    if (key) {
      const stored = await chrome.storage.session.get(SHOWN_KEY);
      const shown = stored[SHOWN_KEY] || [];
      if (shown.indexOf(key) !== -1) return;
      await chrome.storage.session.set({ [SHOWN_KEY]: shown.concat(key).slice(-20) });
    }
    await new Promise(function (resolve) {
      chrome.notifications.create(key || 'lct-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('assets/icons/icon128.png'),
        title: title || 'LeetThemes',
        message: message || '',
        priority: 1
      }, function () { void chrome.runtime.lastError; resolve(); });
    });
  }).catch(function (error) { console.warn('LeetThemes notification failed', error); });
  return notifyQueue;
}

async function schedulePomodoroAlarm(message) {
  if (message.when && message.when > Date.now()) {
    await chrome.storage.session.set({ [POMO_PAYLOAD_KEY]: { key: message.key, title: message.title, message: message.message, end: message.when } });
    await chrome.alarms.create(POMO_ALARM, { when: message.when });
  } else {
    await chrome.alarms.clear(POMO_ALARM);
    await chrome.storage.session.remove(POMO_PAYLOAD_KEY);
  }
}

chrome.alarms.onAlarm.addListener(async function (alarm) {
  if (alarm.name !== POMO_ALARM) return;
  const stored = await chrome.storage.session.get(POMO_PAYLOAD_KEY);
  const payload = stored[POMO_PAYLOAD_KEY];
  await chrome.storage.session.remove(POMO_PAYLOAD_KEY);
  chrome.action.setBadgeText({ text: '' });
  if (payload) {
    await showOnce(payload.key, payload.title, payload.message);
    // The alarm is the timing authority in background tabs. Tell open LeetCode tabs to advance
    // their timer state now instead of waiting for a throttled content-script interval.
    try {
      let tabs = await chrome.tabs.query({ url: ['https://*.leetcode.com/*', 'https://*.leetcode.cn/*'] });
      if (!tabs.length) tabs = await chrome.tabs.query({});
      tabs.forEach(function (tab) {
        if (tab.id == null) return;
        chrome.tabs.sendMessage(tab.id, {
          type: 'lct:pomodoro-ended',
          end: payload.end || alarm.scheduledTime || 0,
          key: payload.key || ''
        }, function () { void chrome.runtime.lastError; });
      });
    } catch (error) { /* tabs unavailable */ }
  }
});

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || !message.type) return;

  if (message.type === 'lct:patch-settings') {
    LCT.setSettings(message.patch || {}).then(function (settings) {
      sendResponse({ ok: true, settings: settings });
    }).catch(function (error) {
      sendResponse({ ok: false, error: String(error) });
    });
    return true;
  }

  if (message.type === 'lct:pomodoro-alarm') {
    schedulePomodoroAlarm(message).catch(function (error) { console.warn('LeetThemes alarm failed', error); });
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'lct:open-options') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'lct:notify') {
    showOnce(message.key, message.title, message.message);
    sendResponse({ ok: true });
    return;
  }

  if (message.type === 'lct:badge') {
    chrome.action.setBadgeBackgroundColor({ color: message.color || BADGE_COLOR });
    chrome.action.setBadgeText({ text: message.text || '' });
    sendResponse({ ok: true });
    return;
  }
});
