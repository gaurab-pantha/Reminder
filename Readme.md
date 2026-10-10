# Reminder

A Chrome extension (Manifest V3) for setting one-off or recurring reminders. When one is due, you get a native notification with **Snooze** and **Dismiss** buttons.


## Features

- One-off or recurring (daily / weekly) reminders
- Priority (low / medium / high) shown as a colored left border
- Category (work / personal / health / other) shown as a colored dot
- Search and filter by category
- Snooze or dismiss right from the notification
- History tab showing reminders that already fired
- Dark mode, sound toggle, configurable snooze length
- Export / import reminders as JSON
- Toolbar badge showing the number of active reminders
- Right-click selected text on any page and choose **Remind me about "..."** to open the popup with the text pre-filled
- Keyboard shortcut: `Ctrl+Shift+R` (`Cmd+Shift+R` on Mac)

## Install and Run

No build step or dependencies are needed.

1. Clone the repo:
   ```bash
   git clone https://github.com/<your-username>/reminder-extension.git
   ```
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the project folder (the one containing `manifest.json`).
5. Click the puzzle-piece icon in the toolbar and pin **Reminder**.

After editing any file, click the refresh icon on the extension's card in `chrome://extensions`.

## Usage

1. Click the extension icon and press **New**.
2. Enter what to be reminded of, pick a date and time (at least a minute from now), and choose priority, category and repeat.
3. Click **Set alarm**.
4. When it's due, a notification appears. Press **Snooze** to be reminded again later, or **Dismiss**.

## Project Structure

```
reminder-extension/
├── manifest.json     extension config, permissions, shortcut
├── index.html        popup markup
├── style.css         popup styling (light and dark themes)
├── popup.js          popup logic (form, lists, settings, import/export)
├── background.js     service worker (alarms, notifications, badge, context menu)
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png
```

## Permissions

| Permission      | Why                                                  |
| --------------- | ---------------------------------------------------- |
| `storage`       | Saves reminders, history and settings locally        |
| `alarms`        | Fires reminders at the right time                    |
| `notifications` | Shows the reminder notification                      |
| `contextMenus`  | Adds the right-click "Remind me about..." option     |

All data stays on your device in `chrome.storage.local`. Nothing is sent anywhere.

## How It Works

`chrome.storage.local` is the single source of truth. Both `popup.js` and `background.js` tell a live reminder apart from everything else with one check: it has a string `text` and a numeric `time`.

```js
// active reminder: key is its own id
"1725650123456": {
  id, text, time,
  priority: "low" | "medium" | "high",
  category: "work" | "personal" | "health" | "other",
  repeat:   "none" | "daily" | "weekly"
}

// fired reminder, shown in the History tab
"history:1725650123456": { id, text, firedAt, priority, category }

// app settings
"settings": { theme, sound, snoozeMinutes }

// temporary: set by the context menu, read and deleted by the popup
"draftText": "selected text"
```

When storage changes, `background.js` creates or clears the matching alarm. When an alarm fires, it shows the notification, writes a history entry, and either removes the reminder or schedules the next occurrence if it repeats. Alarms are rescheduled on install and on browser startup.

## Known Limitations

- Reminders can't be edited. Delete and re-add instead.
- Repeating reminders support only daily and weekly intervals.
- Reminders must be set at least one minute in the future.

## Future Ideas

- Edit existing reminders
- Monthly / custom repeat intervals
- Sync across devices with `chrome.storage.sync`

## Tech Stack

HTML, CSS, vanilla JavaScript, Chrome Extensions API (Manifest V3)
