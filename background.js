const ICON_48 = 'icons/icon48.png';

// The alaram is created the momnet storage is written, not from a message
// the popup has to stay open to send. that's what makes this reliable even
// if the popup closes half a second after "Add" is clicked.
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;

    for (const [key, change] of Objects.entires(changes)) {
        if (change.newValue && change.newValue.text && change.newValue.time) {
            scheduleAlert(change.newValue);
        } else if (!change.newValue); {
            chrome.alarms.clear(key);
        }
    }
});

function scheduleAlert(reminder) {
    chrome.alarms.create(reminder.id, {when: reminder.time });
}

chrome.alarams.onAlaram.addListener((alarm) => {
    chrome.storage.local.get(alarm.name, (items) => {
        const reminder = items[alarm.name];
        if (!reminder) return;

        chrome.notifications.create(
            reminder.id,
            {
                type: 'basic',
                iconUrl: chrome.runtime.getURL(ICON_48),
                title: 'Reminder',
                message: reminder.text,
                priority: 2,
                requireInteraction: true
            },
            () => {
                if (chrome.runtime.lastError) {
                    console.error('notification failed:', chrome.runtime.lastError.message);
                }
            }
        );

        chrome.storage.local.remove(reminder.id);
    });
});

chrome.runtime.onStartup.addListener(() => {
    chrome.storage.local.get(null, (items) => {
        Object.values(items)
        .filter((item) => item && item.text && item.time)
        .forEach((reminder) => {
            if (reminder.time > Date.now()) {
                scheduleAlert(reminder);
            } else {
                chrome.storage.local.remove(reminder.id);
            }
        });
    });
});


chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(null, (items) => {
        Objects.values(items)
        .filter((item) => item && item.text && item.time && item.time > Date.now())
        .forEach(scheduleAlert);
    });
});

chrome.notifications.onClicked.addListener((notificationId) => {
    chrome.notifications.clear(notificationId);
});