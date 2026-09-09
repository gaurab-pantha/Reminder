# Reminder

A small chrome extention (Manifest V3) that lets you set a text reminder for a specific date and time, and shows a native OS notification when it's due.

## Folder Structure

reminder-extension/
├── manifest.json      extension config, permissions, icons
├── index.html          popup markup
├── style.css           popup styling
├── popup.js            popup behavior (form, list, live clock)
├── background.js       service worker (scheduling + notifications)
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    └── icon128.png

    ## Features
     
- One-off or recurring (daily/weekly) alarms
- Priority (low/medium/high, shown as a colored left border) and category
  (work/personal/health/other, shown as a colored dot)
- Search and filter-by-category in the Active tab
- Snooze or Dismiss buttons right on the OS notification
- History tab logging everything that's already fired
- Dark mode, notification sound toggle, and configurable snooze length
- Export/import all reminders as a JSON file
- Badge on the toolbar icon showing the count of active alarms
- Right-click selected text on any page → "Remind me about this" → opens
  the popup with that text pre-filled
- `Ctrl+Shift+R` (`Cmd+Shift+R` on Mac) opens the popup from anywhere

## How it works

### Storage is the source of truth

Everything lives in 'chrome.storage.local', split acros a few key shapes:

```js
// active reminder — key is its own id (Date.now().toString())
"1725650123456": {
  id: "1725650123456",
  text: "Call the dentist",
  time: 1725653723456,
  priority: "medium",   // "low" | "medium" | "high"
  category: "personal", // "work" | "personal" | "health" | "other"
  repeat: "none"        // "none" | "daily" | "weekly"
}
 
// a fired alarm, logged for the History tab
"history:1725650123456": {
  id: "1725650123456",
  text: "Call the dentist",
  firedAt: 1725653723500,
  priority: "medium",
  category: "personal"
}
 
// app-wide settings, single fixed key
"settings": { theme: "light", sound: true, snoozeMinutes: 10 }
 
// transient — set by the context menu, consumed and deleted by the popup
"draftText": "some selected text"
```
 

 There's no seperate index array to keep in sycn. Both `background.js` and
`popup.js` distinguish a live reminder from everything else with a single
check: does the object have a `text` string and a numeric `time`? History
entries have `firedAt` instead of `time`, and `settings`/`draftText` aren't
even objects shaped like a reminder, so that one check is enough to filter correctly everywhere without special-casing each key type.


## Known limitations
 
- No edit — deleting and re-adding is the only way to change a reminder.
- No recurring/repeating alarms, one-off only.
- No snooze action on the notification itself.
 