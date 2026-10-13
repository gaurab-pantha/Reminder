const DEFAULT_SETTINGS = { theme: 'light', sound: true, snoozeMinutes: 10 };
const VALID_PRIORITY = ['low', 'medium', 'high'];
const VALID_CATEGORY = ['work', 'personal', 'health', 'other'];
const VALID_REPEAT = ['none', 'daily', 'weekly'];
const MAX_TEXT = 200;
const SOON_WINDOW_MS = 15 * 60 * 1000;

const CATEGORY_COLORS = { work: '#3b6fc1', personal: '#c17a2f', health: '#3f9142', other: '#8a8f98' };
const PRIORITY_COLORS = { high: '#c0483b', medium: '#c17a2f', low: '#b9b6ae' };
const REPEAT_LABELS = { daily: 'Daily', weekly: 'Weekly' };

const EDIT_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>' +
  '</svg>';

const TRASH_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/>' +
  '</svg>';

const el = {
  tabBar: document.getElementById('tabBar'),
  panels: {
    active: document.getElementById('panel-active'),
    history: document.getElementById('panel-history'),
    settings: document.getElementById('panel-settings')
  },
  liveClock: document.getElementById('liveClock'),
  nextUp: document.getElementById('nextUp'),

  searchInput: document.getElementById('searchInput'),
  categoryFilter: document.getElementById('categoryFilter'),
  toggleFormBtn: document.getElementById('toggleFormBtn'),

  form: document.getElementById('reminderForm'),
  taskInput: document.getElementById('taskInput'),
  timeInput: document.getElementById('timeInput'),
  priorityInput: document.getElementById('priorityInput'),
  categoryInput: document.getElementById('categoryInput'),
  repeatInput: document.getElementById('repeatInput'),
  formError: document.getElementById('formError'),
  submitBtn: document.getElementById('submitBtn'),
  cancelBtn: document.getElementById('cancelBtn'),

  listEl: document.getElementById('reminderList'),
  emptyState: document.getElementById('emptyState'),

  historyList: document.getElementById('historyList'),
  historyEmpty: document.getElementById('historyEmpty'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),

  themeToggle: document.getElementById('themeToggle'),
  soundToggle: document.getElementById('soundToggle'),
  snoozeInput: document.getElementById('snoozeInput'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFile: document.getElementById('importFile'),
  importStatus: document.getElementById('importStatus'),
  clearAllBtn: document.getElementById('clearAllBtn')
};

let cachedReminders = [];
let cachedHistory = [];
let settings = DEFAULT_SETTINGS;
let editingId = null;
let clearAllTimer = null;

function isReminder(value) {
  return !!value && typeof value === 'object' && typeof value.text === 'string' && typeof value.time === 'number';
}

function isHistoryKey(key) {
  return key.startsWith('history:');
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadDraftIfAny();
  renderAll();
  tickClock();
  setInterval(tickClock, 1000);
  wireEvents();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') renderAll();
});

function wireEvents() {
  el.tabBar.addEventListener('click', (event) => {
    const btn = event.target.closest('.tab-btn');
    if (btn) switchTab(btn.dataset.tab);
  });

  el.toggleFormBtn.addEventListener('click', () => {
    if (el.form.hasAttribute('hidden')) {
      editingId = null;
      resetFormFields();
      showForm();
      el.taskInput.focus();
    } else {
      hideForm();
    }
  });

  el.cancelBtn.addEventListener('click', hideForm);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el.form.hasAttribute('hidden')) hideForm();
  });

  el.form.addEventListener('submit', handleReminderSubmit);
  el.searchInput.addEventListener('input', paintList);
  el.categoryFilter.addEventListener('change', paintList);

  el.clearHistoryBtn.addEventListener('click', () => {
    chrome.storage.local.get(null, (items) => {
      const keys = Object.keys(items).filter(isHistoryKey);
      if (keys.length) chrome.storage.local.remove(keys);
    });
  });

  el.clearAllBtn.addEventListener('click', () => {
    // First click arms the button, second click (within 3s) actually clears.
    if (!clearAllTimer) {
      el.clearAllBtn.textContent = 'Click again to confirm';
      clearAllTimer = setTimeout(resetClearAllBtn, 3000);
      return;
    }
    resetClearAllBtn();
    chrome.storage.local.get(null, (items) => {
      const keys = Object.entries(items)
        .filter(([, value]) => isReminder(value))
        .map(([key]) => key);
      if (keys.length) chrome.storage.local.remove(keys);
    });
  });

  el.themeToggle.addEventListener('change', () => {
    saveSettings({ theme: el.themeToggle.checked ? 'dark' : 'light' });
  });

  el.soundToggle.addEventListener('change', () => {
    saveSettings({ sound: el.soundToggle.checked });
  });

  el.snoozeInput.addEventListener('change', () => {
    const minutes = Math.min(180, Math.max(1, Number(el.snoozeInput.value) || 10));
    el.snoozeInput.value = minutes;
    saveSettings({ snoozeMinutes: minutes });
  });

  el.exportBtn.addEventListener('click', exportData);
  el.importBtn.addEventListener('click', () => el.importFile.click());
  el.importFile.addEventListener('change', importData);
}

function resetClearAllBtn() {
  clearTimeout(clearAllTimer);
  clearAllTimer = null;
  el.clearAllBtn.textContent = 'Clear all active alarms';
}

function toLocalInputValue(timestamp) {
  const d = new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function newId(offset = 0) {
  return `${Date.now() + offset}${Math.floor(Math.random() * 900 + 100)}`;
}

function nextOccurrence(time, repeat) {
  const d = new Date(time);
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  return d.getTime();
}

function resetFormFields() {
  el.form.reset();
  el.formError.textContent = '';
  el.priorityInput.value = 'medium';
  el.categoryInput.value = 'other';
  el.repeatInput.value = 'none';
  el.timeInput.min = toLocalInputValue(Date.now());
  el.timeInput.value = toLocalInputValue(Date.now() + 10 * 60000);
  el.submitBtn.textContent = 'Set alarm';
}

function showForm() {
  el.form.removeAttribute('hidden');
  el.toggleFormBtn.setAttribute('aria-expanded', 'true');
}

function hideForm() {
  editingId = null;
  el.formError.textContent = '';
  el.submitBtn.textContent = 'Set alarm';
  el.form.setAttribute('hidden', '');
  el.toggleFormBtn.setAttribute('aria-expanded', 'false');
}

function startEdit(reminder) {
  editingId = reminder.id;
  resetFormFields();
  el.taskInput.value = reminder.text;
  el.timeInput.value = toLocalInputValue(reminder.time);
  el.priorityInput.value = reminder.priority || 'medium';
  el.categoryInput.value = reminder.category || 'other';
  el.repeatInput.value = reminder.repeat || 'none';
  el.submitBtn.textContent = 'Save changes';
  switchTab('active');
  showForm();
  el.taskInput.focus();
}

function switchTab(tab) {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.tab === tab);
  });
  Object.entries(el.panels).forEach(([name, panel]) => {
    panel.toggleAttribute('hidden', name !== tab);
  });
}

function loadDraftIfAny() {
  chrome.storage.local.get('draftText', (data) => {
    if (!data.draftText) return;
    editingId = null;
    resetFormFields();
    el.taskInput.value = data.draftText;
    showForm();
    el.taskInput.focus();
    chrome.storage.local.remove('draftText');
  });
}

function loadSettings() {
  chrome.storage.local.get('settings', (data) => {
    settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    applySettingsToUI();
  });
}

function applySettingsToUI() {
  document.body.dataset.theme = settings.theme;
  el.themeToggle.checked = settings.theme === 'dark';
  el.soundToggle.checked = settings.sound;
  el.snoozeInput.value = settings.snoozeMinutes;
}

function saveSettings(patch) {
  settings = { ...settings, ...patch };
  chrome.storage.local.set({ settings });
  applySettingsToUI();
}

function handleReminderSubmit(event) {
  event.preventDefault();
  el.formError.textContent = '';

  const text = el.taskInput.value.trim();
  const dueAt = el.timeInput.value ? new Date(el.timeInput.value).getTime() : NaN;

  if (!text) {
    el.formError.textContent = 'Type something to remind you of.';
    el.taskInput.focus();
    return;
  }

  if (!dueAt || Number.isNaN(dueAt)) {
    el.formError.textContent = 'Pick a date and time.';
    return;
  }

  if (dueAt <= Date.now() + 60000) {
    el.formError.textContent = 'Pick a time at least a minute from now.';
    return;
  }

  const id = editingId || newId();
  const reminder = {
    id,
    text: text.slice(0, MAX_TEXT),
    time: dueAt,
    priority: el.priorityInput.value,
    category: el.categoryInput.value,
    repeat: el.repeatInput.value
  };

  chrome.storage.local.set({ [id]: reminder }, () => {
    if (chrome.runtime.lastError) {
      el.formError.textContent = "Couldn't save that reminder. Try again.";
      return;
    }
    hideForm();
  });
}

function renderAll() {
  chrome.storage.local.get(null, (items) => {
    cachedReminders = Object.values(items).filter(isReminder).sort((a, b) => a.time - b.time);

    cachedHistory = Object.entries(items)
      .filter(([key, value]) => isHistoryKey(key) && value && value.text)
      .map(([, value]) => value)
      .sort((a, b) => b.firedAt - a.firedAt);

    paintList();
    paintNextUp();
    paintHistory();
  });
}

function paintList() {
  const query = el.searchInput.value.trim().toLowerCase();
  const category = el.categoryFilter.value;

  const visible = cachedReminders.filter((reminder) => {
    const matchesQuery = !query || reminder.text.toLowerCase().includes(query);
    const matchesCategory = category === 'all' || reminder.category === category;
    return matchesQuery && matchesCategory;
  });

  el.listEl.innerHTML = '';
  el.emptyState.style.display = visible.length ? 'none' : 'flex';

  const fragment = document.createDocumentFragment();
  visible.forEach((reminder) => fragment.appendChild(buildReminderRow(reminder)));
  el.listEl.appendChild(fragment);
}

function buildReminderRow(reminder) {
  const li = document.createElement('li');
  li.className = 'reminder-item';
  li.style.borderLeftColor = PRIORITY_COLORS[reminder.priority] || PRIORITY_COLORS.medium;
  if (reminder.time - Date.now() <= SOON_WINDOW_MS) li.classList.add('is-soon');

  const dot = document.createElement('span');
  dot.className = 'reminder-dot';
  dot.style.background = CATEGORY_COLORS[reminder.category] || CATEGORY_COLORS.other;

  const body = document.createElement('div');
  body.className = 'reminder-body';

  const textLine = document.createElement('div');
  textLine.className = 'reminder-text';
  textLine.textContent = reminder.text;

  const meta = document.createElement('div');
  meta.className = 'reminder-meta';

  const timeLine = document.createElement('span');
  timeLine.className = 'reminder-time';
  timeLine.textContent = formatDueTime(reminder.time);
  meta.appendChild(timeLine);

  if (REPEAT_LABELS[reminder.repeat]) {
    const chip = document.createElement('span');
    chip.className = 'repeat-chip';
    chip.textContent = REPEAT_LABELS[reminder.repeat];
    meta.appendChild(chip);
  }

  body.appendChild(textLine);
  body.appendChild(meta);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'edit-btn';
  editBtn.title = 'Edit alarm';
  editBtn.setAttribute('aria-label', 'Edit alarm');
  editBtn.innerHTML = EDIT_ICON;
  editBtn.addEventListener('click', () => startEdit(reminder));

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'delete-btn';
  deleteBtn.title = 'Remove alarm';
  deleteBtn.setAttribute('aria-label', 'Remove alarm');
  deleteBtn.innerHTML = TRASH_ICON;
  deleteBtn.addEventListener('click', () => {
    if (editingId === reminder.id) hideForm();
    chrome.storage.local.remove(reminder.id);
  });

  li.appendChild(dot);
  li.appendChild(body);
  li.appendChild(editBtn);
  li.appendChild(deleteBtn);
  return li;
}

function paintHistory() {
  el.historyList.innerHTML = '';
  el.historyEmpty.style.display = cachedHistory.length ? 'none' : 'flex';

  const fragment = document.createDocumentFragment();
  cachedHistory.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'reminder-item';
    li.style.borderLeftColor = PRIORITY_COLORS[entry.priority] || PRIORITY_COLORS.medium;

    const dot = document.createElement('span');
    dot.className = 'reminder-dot';
    dot.style.background = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.other;

    const body = document.createElement('div');
    body.className = 'reminder-body';

    const textLine = document.createElement('div');
    textLine.className = 'reminder-text';
    textLine.textContent = entry.text;

    const timeLine = document.createElement('div');
    timeLine.className = 'reminder-time';
    timeLine.textContent = `fired ${formatDueTime(entry.firedAt)}`;

    body.appendChild(textLine);
    body.appendChild(timeLine);
    li.appendChild(dot);
    li.appendChild(body);
    fragment.appendChild(li);
  });
  el.historyList.appendChild(fragment);
}

function paintNextUp() {
  const next = cachedReminders[0];

  if (!next) {
    el.nextUp.innerHTML = '<span class="next-up__label">Nothing scheduled</span>';
    return;
  }

  el.nextUp.innerHTML =
    '<span class="next-up__label">Next up</span>' +
    `<span class="next-up__text">${escapeHtml(next.text)}</span>` +
    `<span class="next-up__time">${formatCountdown(next.time)}</span>`;
}

function tickClock() {
  el.liveClock.textContent = new Date().toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  });
  if (cachedReminders.length) paintNextUp();
}

function formatDueTime(timestamp) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatCountdown(timestamp) {
  const diff = timestamp - Date.now();
  if (diff <= 0) return 'due now';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `in ${days}d ${hours % 24}h`;
  if (hours > 0) return `in ${hours}h ${minutes % 60}m`;
  return `in ${minutes}m`;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function exportData() {
  chrome.storage.local.get(null, (items) => {
    const reminders = Object.values(items).filter(isReminder);
    const history = Object.entries(items)
      .filter(([key]) => isHistoryKey(key))
      .map(([, value]) => value);

    const payload = { app: 'Reminder', exportedAt: new Date().toISOString(), reminders, history };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reminders-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    el.importStatus.textContent = `Exported ${reminders.length} reminder${reminders.length === 1 ? '' : 's'}.`;
  });
}

// Cleans one imported reminder. Returns null if it can't be used.
function normalizeImported(raw, index) {
  if (!isReminder(raw)) return null;
  const text = raw.text.trim().slice(0, MAX_TEXT);
  if (!text || !Number.isFinite(raw.time)) return null;

  const repeat = VALID_REPEAT.includes(raw.repeat) ? raw.repeat : 'none';
  let time = raw.time;

  if (time <= Date.now() + 60000) {
    if (repeat === 'none') return null; // already past, nothing to wait for
    while (time <= Date.now() + 60000) time = nextOccurrence(time, repeat);
  }

  const id = newId(index);
  return {
    id,
    text,
    time,
    priority: VALID_PRIORITY.includes(raw.priority) ? raw.priority : 'medium',
    category: VALID_CATEGORY.includes(raw.category) ? raw.category : 'other',
    repeat
  };
}

function importData(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;

  const reader = new FileReader();
  reader.onerror = () => {
    el.importStatus.textContent = "Couldn't read that file.";
  };
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch (err) {
      el.importStatus.textContent = "That file isn't valid JSON.";
      return;
    }

    const rawReminders = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.reminders) ? parsed.reminders : [];
    const rawHistory = parsed && Array.isArray(parsed.history) ? parsed.history : [];

    const toSave = {};
    let imported = 0;
    rawReminders.forEach((raw, index) => {
      const clean = normalizeImported(raw, index);
      if (clean) {
        toSave[clean.id] = clean;
        imported += 1;
      }
    });
    const skipped = rawReminders.length - imported;

    let restoredHistory = 0;
    rawHistory.forEach((entry, index) => {
      if (entry && typeof entry.text === 'string' && Number.isFinite(entry.firedAt)) {
        const id = newId(1000 + index);
        toSave[`history:${id}`] = {
          id,
          text: entry.text.slice(0, MAX_TEXT),
          firedAt: entry.firedAt,
          priority: VALID_PRIORITY.includes(entry.priority) ? entry.priority : 'medium',
          category: VALID_CATEGORY.includes(entry.category) ? entry.category : 'other'
        };
        restoredHistory += 1;
      }
    });

    if (!imported && !restoredHistory) {
      el.importStatus.textContent = skipped
        ? 'Nothing imported: those reminders are already in the past.'
        : 'No valid reminders found in that file.';
      return;
    }

    chrome.storage.local.set(toSave, () => {
      if (chrome.runtime.lastError) {
        el.importStatus.textContent = "Couldn't save the imported reminders.";
        return;
      }
      let message = `Imported ${imported} reminder${imported === 1 ? '' : 's'}`;
      if (restoredHistory) message += ` and ${restoredHistory} history entr${restoredHistory === 1 ? 'y' : 'ies'}`;
      message += skipped ? `. Skipped ${skipped} (already past or invalid).` : '.';
      el.importStatus.textContent = message;
    });
  };
  reader.readAsText(file);
}
