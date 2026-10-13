

const ICON_48 = 'icons/icon48.png';
const DEFAULT_SETTINGS = { theme: 'light', sound: true, snoozeMinutes: 10 };
const CONTEXT_MENU_ID = 'remind-me-about-this';
const MAX_HISTORY = 100;

function isReminder(value) {
  return !!value && typeof value === 'object' && typeof value.text === 'string' && typeof value.time === 'number';
}

function isRepeating(repeat) {
  return repeat === 'daily' || repeat === 'weekly';
}

function nextOccurrence(time, repeat) {
  const d = new Date(time);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  return d.getTime();
}

// Moves a repeating reminder forward until it is in the future, so a late
// alarm (computer asleep, browser closed) never fires several times in a row.
function rollForward(time, repeat) {
  if (!isRepeating(repeat)) return time;
  let next = time;
  while (next <= Date.now()) next = nextOccurrence(next, repeat);
  return next;
}



chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  let touchedReminder = false;

  for (const [key, change] of Object.entries(changes)) {
    if (isReminder(change.newValue)) {
      chrome.alarms.create(key, { when: change.newValue.time });
      touchedReminder = true;
    } else if (!change.newValue && isReminder(change.oldValue)) {
      chrome.alarms.clear(key);
      touchedReminder = true;
    }
  }

  if (touchedReminder) updateBadge();
});

function updateBadge() {
  chrome.storage.local.get(null, (items) => {
    const count = Object.values(items).filter(isReminder).length;
    chrome.action.setBadgeText({ text: count ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#c17a2f' });
  });
}

// Re-creates alarms after install / browser start. Reminders that came due while
// the browser was closed are shown now (marked as missed) instead of being lost.
function rescheduleAll() {
  chrome.storage.local.get(null, (items) => {
    Object.entries(items).forEach(([key, reminder]) => {
      if (!isReminder(reminder)) return;
      if (reminder.time > Date.now()) {
        chrome.alarms.create(key, { when: reminder.time });
      } else {
        fireReminder(key, true);
      }
    });
    updateBadge();
  });
}

/* ---------- firing ---------- */

function fireReminder(key, missed) {
  chrome.storage.local.get([key, 'settings'], (data) => {
    const reminder = data[key];
    if (!isReminder(reminder)) return;

    // Edited to a later time since the alarm was set: just re-arm it.
    if (reminder.time > Date.now() + 1000) {
      chrome.alarms.create(key, { when: reminder.time });
      return;
    }

    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };

    const options = {
      type: 'basic',
      iconUrl: chrome.runtime.getURL(ICON_48),
      title: 'Reminder',
      message: reminder.text,
      priority: 2,
      requireInteraction: true,
      silent: !settings.sound,
      buttons: [{ title: `Snooze ${settings.snoozeMinutes}m` }, { title: 'Dismiss' }]
    };
    if (missed) options.contextMessage = 'Missed while the browser was closed';

    chrome.notifications.create(key, options, () => {
      if (chrome.runtime.lastError) {
        console.error('notification failed:', chrome.runtime.lastError.message);
      }
    });

    chrome.storage.local.set(
      {
        [`history:${key}`]: {
          id: key,
          text: reminder.text,
          firedAt: Date.now(),
          priority: reminder.priority,
          category: reminder.category
        }
      },
      trimHistory
    );

    if (isRepeating(reminder.repeat)) {
      chrome.storage.local.set({
        [key]: { ...reminder, time: rollForward(reminder.time, reminder.repeat) }
      });
    } else {
      chrome.storage.local.remove(key);
    }
  });
}

function trimHistory() {
  chrome.storage.local.get(null, (items) => {
    const entries = Object.entries(items)
      .filter(([key]) => key.startsWith('history:'))
      .sort((a, b) => ((b[1] && b[1].firedAt) || 0) - ((a[1] && a[1].firedAt) || 0));
    const extra = entries.slice(MAX_HISTORY).map(([key]) => key);
    if (extra.length) chrome.storage.local.remove(extra);
  });
}

chrome.alarms.onAlarm.addListener((alarm) => fireReminder(alarm.name, false));

/* ---------- notification buttons ---------- */

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  chrome.storage.local.get([`history:${notificationId}`, 'settings'], (data) => {
    chrome.notifications.clear(notificationId);

    const original = data[`history:${notificationId}`];
    if (buttonIndex !== 0 || !original) return;

    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    const newId = `${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;

    chrome.storage.local.set({
      [newId]: {
        id: newId,
        text: original.text,
        time: Date.now() + settings.snoozeMinutes * 60000,
        priority: original.priority || 'medium',
        category: original.category || 'other',
        repeat: 'none'
      }
    });
  });
});

chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId);
});

/* ---------- lifecycle + context menu ---------- */

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('settings', (data) => {
    if (!data.settings) chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  });

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create(
      { id: CONTEXT_MENU_ID, title: 'Remind me about "%s"', contexts: ['selection'] },
      () => void chrome.runtime.lastError
    );
  });

  rescheduleAll();
});

chrome.runtime.onStartup.addListener(rescheduleAll);

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) return;

  chrome.storage.local.set({ draftText: info.selectionText.slice(0, 200) }, () => {
    // openPopup needs a recent Chrome; if it is unavailable the text is still
    // waiting in the popup the next time it is opened.
    try {
      const opened = chrome.action.openPopup && chrome.action.openPopup();
      if (opened && opened.catch) opened.catch(() => {});
    } catch (err) {
      /* ignore */
    }
  });
});
