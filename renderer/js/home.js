'use strict';

// =========================================================
// HOME / WORKSTATION MODULE
// =========================================================

const HOME_STORAGE_KEY = 'polymind_home';
const HABIT_PROPS = [
  'Wake up 7 a.m.', 'GM', 'Read', 'Trading', 'Journal',
  'Gym', '3L Hydration', 'Shower', 'Study/Work', 'Nutrition', 'God',
];

// Local state
let habitEntries = [];      // from Notion cache
let savingGoals = [];       // from Notion cache
let habitPeriod = 'daily';  // daily | weekly | monthly
let habitSyncing = false;
let goalSyncing = false;

let homeData = {
  notes: '',
  objectives: [
    { id: 1, name: '200€ Trading', checked: true },
    { id: 2, name: 'Read 1 book', checked: false },
    { id: 3, name: 'Progress in projects', checked: false },
  ],
};

// ---- Persistence (non-Notion data) ----

function loadHomeData() {
  try {
    const saved = JSON.parse(localStorage.getItem(HOME_STORAGE_KEY));
    if (saved) homeData = { ...homeData, ...saved };
  } catch(e) {
    console.warn('[home] Failed to parse local storage data — resetting.', e.message);
  }
}

function saveHomeData() {
  localStorage.setItem(HOME_STORAGE_KEY, JSON.stringify(homeData));
}

// ---- Clock ----

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const clockEl = document.getElementById('home-clock');
  if (clockEl) clockEl.textContent = `${h}:${m}`;

  const dateEl = document.getElementById('home-date');
  if (dateEl) dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

  const greetEl = document.getElementById('home-greeting');
  if (greetEl) {
    const hr = now.getHours();
    greetEl.textContent = `Good ${hr < 12 ? 'morning' : hr < 18 ? 'afternoon' : 'evening'}, Francis`;
  }
}

// =========================================================
// HABITS — Notion synced
// =========================================================

// todayISO() and toISODate() live in utils.js

function getWeekRange() {
  const today = new Date();
  const day = today.getDay();
  const mon = new Date(today);
  mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: toISODate(mon), end: toISODate(sun) };
}

function getMonthRange() {
  const now = new Date();
  const start = toISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end   = toISODate(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  return { start, end };
}

function habitProgress(entry) {
  const done = HABIT_PROPS.filter(p => entry[p]).length;
  return Math.round((done / HABIT_PROPS.length) * 100);
}

async function loadCachedHabits() {
  try {
    const { entries } = await window.polymind.habits.getCached();
    habitEntries = entries || [];
    renderHabitTracker();
    updateHabitSyncLabel();
  } catch(e) { console.warn('habits cache', e); }
}

async function syncHabits() {
  if (habitSyncing) return;
  habitSyncing = true;
  setHabitSyncState(true);
  try {
    const { entries, lastSyncedAt } = await window.polymind.habits.sync();
    habitEntries = entries || [];
    renderHabitTracker();
    updateHabitSyncLabel(lastSyncedAt);
  } catch(e) {
    console.error('habits sync failed', e);
    const lbl = document.getElementById('habit-sync-status');
    if (lbl) lbl.textContent = e.message?.includes('not configured') ? '⚠ Set Habits DB in Kernel' : 'Sync failed';
  } finally {
    habitSyncing = false;
    setHabitSyncState(false);
  }
}

function setHabitSyncState(active) {
  const btn = document.getElementById('btn-habit-sync');
  if (btn) btn.disabled = active;
  const lbl = document.getElementById('habit-sync-status');
  if (lbl && active) lbl.textContent = 'Syncing…';
}

function updateHabitSyncLabel(ts) {
  const el = document.getElementById('habit-sync-status');
  if (!el) return;
  if (!ts) { el.textContent = ''; return; }
  const d = new Date(ts);
  el.textContent = `Synced ${d.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}`;
}

// ---- Toggle a checkbox and write to Notion ----

async function toggleHabitCheckbox(pageId, habitName, currentValue) {
  const newValue = !currentValue;

  // Optimistic DOM patch — no re-render, keeps weekly panels open
  const entry = habitEntries.find(e => e.id === pageId);
  if (entry) {
    entry[habitName] = newValue;
    // Patch all matching checkboxes for this page+habit
    document.querySelectorAll(`.habit-checkbox[data-page="${pageId}"][data-habit="${habitName}"]`).forEach(el => {
      el.classList.toggle('checked', newValue);
      el.dataset.checked = newValue;
    });
    // Patch all progress bars and labels for this page
    const pct = habitProgress(entry);
    document.querySelectorAll(`[data-progress="${pageId}"]`).forEach(bar => bar.style.width = pct + '%');
    document.querySelectorAll(`[data-progress-label="${pageId}"]`).forEach(lbl => lbl.textContent = pct + '%');
  }

  try {
    await window.polymind.habits.updateCheckbox(pageId, habitName, newValue);
  } catch(e) {
    // Revert on failure
    if (entry) {
      entry[habitName] = currentValue;
      document.querySelectorAll(`.habit-checkbox[data-page="${pageId}"][data-habit="${habitName}"]`).forEach(el => {
        el.classList.toggle('checked', currentValue);
        el.dataset.checked = currentValue;
      });
      const pct = habitProgress(entry);
      document.querySelectorAll(`[data-progress="${pageId}"]`).forEach(bar => bar.style.width = pct + '%');
      document.querySelectorAll(`[data-progress-label="${pageId}"]`).forEach(lbl => lbl.textContent = pct + '%');
    }
    console.error('habit update failed', e);
  }
}

// ---- Render ----

function renderHabitTracker() {
  const today = todayISO();

  if (habitPeriod === 'daily') renderHabitDaily(today);
  else if (habitPeriod === 'weekly') renderHabitWeekly();
  else if (habitPeriod === 'monthly') renderHabitMonthly();
}

function habitCheckboxHtml(pageId, name, checked) {
  return `<div class="habit-checkbox ${checked ? 'checked' : ''}"
    data-page="${pageId}" data-habit="${name}" data-checked="${checked}">
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>`;
}

function renderHabitDaily(dateStr) {
  const list = document.getElementById('habit-tracker-list');
  if (!list) return;

  const entry = habitEntries.find(e => e.date === dateStr);

  if (!entry) {
    list.innerHTML = `<div class="habit-empty">No entry for today in Notion.<br>
      <small>Sync or create today's row in your Tracker database.</small></div>`;
    return;
  }

  const pct = habitProgress(entry);
  list.innerHTML = `
    <div class="habit-progress-bar-wrap">
      <div class="habit-progress-bar" data-progress="${entry.id}" style="width:${pct}%"></div>
      <span class="habit-progress-label" data-progress-label="${entry.id}">${pct}%</span>
    </div>
    ${HABIT_PROPS.map(name => `
      <div class="habit-row">
        ${habitCheckboxHtml(entry.id, name, entry[name])}
        <span class="habit-name">${name}</span>
      </div>
    `).join('')}`;

  bindHabitCheckboxes(list);
}

function renderHabitWeekly() {
  const list = document.getElementById('habit-tracker-list');
  if (!list) return;
  const { start, end } = getWeekRange();
  const week = habitEntries.filter(e => e.date >= start && e.date <= end)
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!week.length) {
    list.innerHTML = '<div class="habit-empty">No entries this week.</div>';
    return;
  }

  list.innerHTML = week.map(entry => {
    const pct = habitProgress(entry);
    const dayName = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short' });
    return `
      <div class="habit-week-row">
        <div class="habit-week-header" data-toggle="${entry.id}">
          <span class="habit-week-day">${dayName}</span>
          <div class="habit-week-bar-wrap">
            <div class="habit-week-bar" data-progress="${entry.id}" style="width:${pct}%"></div>
          </div>
          <span class="habit-week-pct" data-progress-label="${entry.id}">${pct}%</span>
          <span class="habit-week-chevron">›</span>
        </div>
        <div class="habit-week-detail hidden" id="detail-${entry.id}">
          ${HABIT_PROPS.map(name => `
            <div class="habit-row habit-row-sm">
              ${habitCheckboxHtml(entry.id, name, entry[name])}
              <span class="habit-name">${name}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');

  // Toggle expand/collapse
  list.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('click', () => {
      const detail = document.getElementById(`detail-${el.dataset.toggle}`);
      const chevron = el.querySelector('.habit-week-chevron');
      if (detail) {
        detail.classList.toggle('hidden');
        if (chevron) chevron.textContent = detail.classList.contains('hidden') ? '›' : '⌄';
      }
    });
  });

  bindHabitCheckboxes(list);
}

function renderHabitMonthly() {
  const list = document.getElementById('habit-tracker-list');
  if (!list) return;
  const { start, end } = getMonthRange();
  const month = habitEntries.filter(e => e.date >= start && e.date <= end)
    .sort((a,b) => a.date.localeCompare(b.date));

  if (!month.length) {
    list.innerHTML = '<div class="habit-empty">No entries this month.</div>';
    return;
  }

  list.innerHTML = month.map(entry => {
    const pct = habitProgress(entry);
    const dayName = new Date(entry.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday:'short', day:'numeric' });
    return `
      <div class="habit-month-row">
        <span class="habit-month-day">${dayName}</span>
        <div class="habit-month-bar-wrap">
          <div class="habit-month-bar" data-progress="${entry.id}" style="width:${pct}%"></div>
        </div>
        <span class="habit-month-pct" data-progress-label="${entry.id}">${pct}%</span>
      </div>`;
  }).join('');
}

function bindHabitCheckboxes(container) {
  container.querySelectorAll('.habit-checkbox[data-page]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const pageId = el.dataset.page;
      const habitName = el.dataset.habit;
      const current = el.dataset.checked === 'true';
      toggleHabitCheckbox(pageId, habitName, current);
    });
  });
}

function initHabitTabs() {
  document.querySelectorAll('.habit-period-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      habitPeriod = btn.dataset.period;
      document.querySelectorAll('.habit-period-tab').forEach(b => b.classList.toggle('active', b === btn));
      renderHabitTracker();
    });
  });
}

// =========================================================
// SAVING GOALS — Notion synced
// =========================================================

async function loadCachedGoals() {
  try {
    const { goals } = await window.polymind.goals.getCached();
    savingGoals = goals || [];
    renderSavingGoals();
  } catch(e) { console.warn('goals cache', e); }
}

async function syncGoals() {
  if (goalSyncing) return;
  goalSyncing = true;
  const btn = document.getElementById('btn-goals-sync');
  if (btn) btn.disabled = true;
  try {
    const { goals } = await window.polymind.goals.sync();
    savingGoals = goals || [];
    renderSavingGoals();
  } catch(e) {
    console.error('goals sync', e);
    const btn2 = document.getElementById('btn-goals-sync');
    if (btn2) btn2.title = e.message?.includes('not configured') ? 'Set Goals DB in Kernel settings' : 'Sync failed';
  } finally {
    goalSyncing = false;
    if (btn) btn.disabled = false;
  }
}

function renderSavingGoals() {
  const list = document.getElementById('saving-goals-list');
  if (!list || !savingGoals.length) return;

  list.innerHTML = savingGoals.map(g => {
    const pct = g.progress !== null ? Math.round(g.progress * 100) : (g.goal > 0 ? Math.round((g.saved / g.goal) * 100) : 0);
    const safeP = Math.min(pct, 100);
    const dateStr = g.targetDate ? new Date(g.targetDate).toLocaleDateString('en-GB', { month:'short', year:'numeric' }) : '';
    return `
      <div class="saving-item" data-goal-id="${g.id}">
        <div class="saving-top">
          <span class="saving-name">${g.name}</span>
          <span class="saving-pct">${safeP}%</span>
        </div>
        <div class="saving-bar-wrap"><div class="saving-bar" style="width:${safeP}%"></div></div>
        <div class="saving-meta">€${(g.saved||0).toLocaleString()} / €${(g.goal||0).toLocaleString()}${dateStr ? ' · ' + dateStr : ''}</div>
      </div>`;
  }).join('');
}

// =========================================================
// OBJECTIVES (local)
// =========================================================

function renderObjectives() {
  const list = document.getElementById('objectives-list');
  if (!list) return;
  list.innerHTML = homeData.objectives.map(o => `
    <div class="objective-item">
      <div class="obj-check ${o.checked ? 'checked' : ''}" data-obj="${o.id}">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span>${o.name}</span>
    </div>
  `).join('');

  list.querySelectorAll('.obj-check').forEach(el => {
    el.addEventListener('click', () => {
      const obj = homeData.objectives.find(o => o.id === Number(el.dataset.obj));
      if (obj) { obj.checked = !obj.checked; saveHomeData(); renderObjectives(); }
    });
  });
}

// =========================================================
// NOTES (local)
// =========================================================

function initNotes() {
  const el = document.getElementById('home-notes');
  if (!el) return;
  el.value = homeData.notes || '';
  el.addEventListener('input', () => { homeData.notes = el.value; saveHomeData(); });
}

// =========================================================
// LINKS
// =========================================================

function initLinks() {
  document.querySelectorAll('.link-chip[data-external]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const url = a.getAttribute('href');
      if (url && window.polymind?.openExternal) window.polymind.openExternal(url);
    });
  });
}

// =========================================================
// INIT
// =========================================================

async function initHome() {
  loadHomeData();
  updateClock();
  setInterval(updateClock, 10000);

  renderObjectives();
  initNotes();
  initLinks();
  initHabitTabs();

  // Sync buttons
  const habitSyncBtn = document.getElementById('btn-habit-sync');
  if (habitSyncBtn) habitSyncBtn.addEventListener('click', syncHabits);

  const goalsSyncBtn = document.getElementById('btn-goals-sync');
  if (goalsSyncBtn) goalsSyncBtn.addEventListener('click', syncGoals);

  // Load from cache first (instant), then sync in background
  await loadCachedHabits();
  await loadCachedGoals();
}
