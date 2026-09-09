const DEFAULT_SETTINGS = { theme: 'light', sound: true, snoozeMinutes: 10 };
const SOON_WINDOW_MS = 15 * 60 * 1000;
 
const CATEGORY_COLORS = { work: '#3b6fc1', personal: '#c17a2f', health: '#3f9142', other: '#8a8f98' };
const PRIORITY_COLORS = { high: '#c0483b', medium: '#c17a2f', low: '#b9b6ae' };
const REPEAT_LABELS = { daily: 'Daily', weekly: 'Weekly' };
 
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
    const isHidden = el.form.hasAttribute('hidden');

    el.form.toggleAttribute('hidden', !isHidden);
    el.toggleFormBtn.setAttribute('aria-expanded', String(isHidden));
    if (isHidden) el.taskInput.focus();
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
        el.taskInput.value = data.draftText;
        el.form.removeAttribute('hidden');
        el.toggleFormBtn.setAttribute('aria-expanded', 'true');
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
  settings = { ... settings, ...patch };
  chrome.storage.local.set({ settings });
  applySettingsToUI();
}

function handleReminderSubmit(event) {
  event.preventDefult();
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

  const id = Date.now().toSpring();
  const reminder = {
    id,
    text,
    time: dueAt,
    priority: el.priorityInput.value,
    category: el.categoryInput.value,
    repeat: el.repeatInput.value
  };

  chrome.storage.local.set({ [id]: reminder }, () => {
    el.form.reset();
    el.priorityInput.value = 'medium';
    el.categoryInput.value = 'other';
    el.repeatInput.value = 'none';
    el.form.setAttribute('hidden', '');
    el.toggleFormBtn.setAttribute('aria-expanded', 'false');
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

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.title = 'Remove alarm';
  deleteBtn.innerHTML = TRASH_ICON;
  deleteBtn.addEventListener('click', () => chrome.storage.local.remove(reminder.id));

  li.appendChild(dot);
  li.appendChild(body);
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
    const payload = {
      exportedAt: new Date().toISOString(),
      reminders: Object.values(items).filter(isReminder),
      history: Object.entries(items)
        .filter(([key]) => isHistoryKey(key))
        .map(([, value]) => value)
    };
 
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reminders-export-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  });
}
 
function importData(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
 
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const reminders = Array.isArray(parsed.reminders) ? parsed.reminders : [];
      const valid = reminders.filter(isReminder);
 
      if (!valid.length) {
        el.importStatus.textContent = 'No valid reminders found in that file.';
        return;
      }
 
      const toSave = {};
      valid.forEach((reminder) => {
        toSave[reminder.id || Date.now().toString()] = reminder;
      });
 
      chrome.storage.local.set(toSave, () => {
        el.importStatus.textContent = `Imported ${valid.length} reminder${valid.length === 1 ? '' : 's'}.`;
      });
    } catch (err) {
      el.importStatus.textContent = "That file isn't valid JSON.";
    }
  };
  reader.readAsText(file);
}
 