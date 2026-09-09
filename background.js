const ICON_48 = 'icons/icon48.png';
const DEFAULT_SETTINGS = { theme: 'light', sound: true, snoozeMinutes: 10 };
const CONTEXT_MENU_ID = 'remind-me-about-this';

 
function isReminder(value) {
  return !!value && typeof value === 'object' && typeof value.text === 'string' && typeof value.time === 'number';
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
 
function rescheduleAll() {

  chrome.storage.local.get(null, (items) => {
    Object.values(items)

      .filter(isReminder)
      .forEach((reminder) => {
        if (reminder.time > Date.now()) {
          chrome.alarms.create(reminder.id, { when: reminder.time });
        } else {
          chrome.storage.local.remove(reminder.id);
        }

      });
    updateBadge();

  });
}
 

function nextOccurrence(time, repeat) {

  const d = new Date(time);

  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  return d.getTime();
}

chrome.alarms.onAlarm.addListener((alarm) => {
    chrome.storage.local.get.get([alarm.name, 'settings'], (data) => {
        const reminder = data[alarm.name];
        if (!isReminder(reminder)) return;

        const settings = {...DEFAULT_SETTINGS, ...(data.seetings || {}) };

        chrome.notifications.create(
            reminder.id,
            {
                type: 'basic',
                iconURL: chrome.runtime.getURL(ICON_48),
                title: 'Reminder',
                message: reminder.text,
                priority: 2,
                requireInteraction: true,
                silent: !settings.sound,
                buttons: [{title: `Snooze ${settings.snoozeMinutes}m`}, { title: 'Dismis'}]
            },

            () => {
              if (chrome.runtime.lastError) {
                console.error('notification failed', chrome.runtime.lastError.message);
              }
            }
        );

        chrome.storage.local.set({
          [`history:${reminder.id}`]: {
            id: reminder.id,
            text: reminder.text,
            fireAt: Date.now(),
            priority: reminder.priority,
            category: reminder.category
          }
        });

        if (reminder.repeat && reminder.repeat !== 'none') {
          chrome.storage.local.set({
            [reminder.id]: { ...reminder, time: nextOccurrence(reminder.time, reminder.repeat) }
          });
        } else {
          chrome.storage.local.remove(reminder.id);
        }
    });
});

chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  chrome.storage.local.get([`history:${notificationId}`, 'settings'], (data) => {
    chrome.notifications.clear(notificationId);
 
    const original = data[`history:${notificationId}`];
    if (buttonIndex !== 0 || !original) return;
 
    const settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    const newId = Date.now().toString();
 
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

chrome.notification.onClicked.addListener((notificationId) => {
  chrome.notification.clear(notificationId);
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get('settings', (data) => {
    if (!data.settings) chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  });
 
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: 'Remind me about "%s"',
    contexts: ['selection']
  });
 
  rescheduleAll();
});

chrome.runtime.onStartup.addListener(rescheduleAll);


chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId !== CONTEXT_MENU_ID || !info.selectionText) return;

  chrome.storage.local.set({ draftText: info.selectionText.slice(0, 200) }, () => {

    if (chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {});
    }
  });
});

