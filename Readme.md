# Reminder – Alarms & Notifications

A small Chrome extension (Manifest V3) for setting text reminders with a date and
time and getting a desktop notification when they are due. Everything is stored
in your browser (`chrome.storage.local`); nothing is sent anywhere.

**Made by Gaurab for Hack Club.**

## Features

- One-time, daily, or weekly reminders
- Priority (low / medium / high) and category (work / personal / health / other)
- Edit or delete any reminder
- Search and filter by category
- Notification with **Snooze** and **Dismiss** buttons
- Reminders missed while the browser was closed are shown on the next start
- History tab for reminders that already fired (last 100 kept)
- Dark mode, sound toggle, configurable snooze length (1–180 min)
- Export / import reminders as a JSON file
- Toolbar badge with the number of active reminders
- Select text on any page, right-click → "Remind me about …" to pre-fill a reminder
- `Ctrl+Shift+R` (`Cmd+Shift+R` on Mac) opens the popup

## Install for testing

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder.
3. Pin the extension and click its icon.

## Permissions

| Permission      | Why it is needed                                 |
| --------------- | ------------------------------------------------ |
| `alarms`        | Fire reminders at the scheduled time             |
| `notifications` | Show the desktop notification                    |
| `storage`       | Save reminders and settings locally              |
| `contextMenus`  | The "Remind me about …" right-click entry        |

## Files

    manifest.json   extension config, permissions, icons
    index.html      popup markup
    style.css       popup styling
    popup.js        popup behavior (form, list, edit, import/export)
    background.js   service worker (alarms, notifications, context menu)
    icons/          16, 32, 48, 128 px icons

## Notes

- If the right-click shortcut can't open the popup automatically (older Chrome),
  the selected text is waiting in the form the next time you open it.
- Repeating reminders that come due while the browser is closed fire once and
  then move to their next future time.
