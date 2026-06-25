'use strict';

// =========================================================
// HOME / WORKSTATION MODULE
// =========================================================

const HOME_STORAGE_KEY = 'polymind_home';

let homeData = {
  notes: '',
  habits: [
    { id: 1, name: 'Sleep', checked: false },
    { id: 2, name: 'GM', checked: false },
    { id: 3, name: 'Read', checked: false },
    { id: 4, name: 'Trading', checked: false },
    { id: 5, name: 'Journal', checked: false },
    { id: 6, name: 'Gym / Running', checked: false },
    { id: 7, name: 'Hydration', checked: false },
    { id: 8, name: 'Shower', checked: false },
    { id: 9, name: 'Study/Work', checked: false },
    { id: 10, name: 'Nutrition', checked: false },
    { id: 11, name: 'Pray', checked: false },
  ],
  objectives: [
    { id: 1, name: '200€ Trading', checked: true },
    { id: 2, name: 'Read 1 book', checked: false },
    { id: 3, name: 'Progress in projects', checked: false },
  ],
  lastHabitDate: '',
};

function loadHomeData() {
  try {
    const saved = JSON.parse(localStorage.getItem(HOME_STORAGE_KEY));
    if (saved) {
      homeData = { ...homeData, ...saved };
      // Reset habits if it's a new day
      const today = new Date().toISOString().slice(0, 10);
      if (homeData.lastHabitDate !== today) {
        homeData.habits = homeData.habits.map(h => ({ ...h, checked: false }));
        homeData.lastHabitDate = today;
        saveHomeData();
      }
    }
  } catch {}
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
  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  const greetEl = document.getElementById('home-greeting');
  if (greetEl) {
    const hour = now.getHours();
    const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    greetEl.textContent = `Good ${period}, Francis`;
  }

  const trackerDate = document.getElementById('tracker-date');
  if (trackerDate) {
    trackerDate.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
  }
}

// ---- Habits ----

function renderHabits() {
  const list = document.getElementById('habit-tracker-list');
  if (!list) return;
  list.innerHTML = homeData.habits.map(h => `
    <div class="habit-row" data-id="${h.id}">
      <div class="habit-checkbox ${h.checked ? 'checked' : ''}" data-habit="${h.id}">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="habit-name">${h.name}</span>
      <button class="habit-del" data-del="${h.id}" title="Remove">×</button>
    </div>
  `).join('');

  list.querySelectorAll('.habit-checkbox').forEach(el => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.habit);
      const habit = homeData.habits.find(h => h.id === id);
      if (habit) { habit.checked = !habit.checked; saveHomeData(); renderHabits(); }
    });
  });

  list.querySelectorAll('.habit-del').forEach(el => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.del);
      homeData.habits = homeData.habits.filter(h => h.id !== id);
      saveHomeData(); renderHabits();
    });
  });
}

function addHabit() {
  const name = prompt('Habit name:');
  if (!name || !name.trim()) return;
  const id = Date.now();
  homeData.habits.push({ id, name: name.trim(), checked: false });
  saveHomeData();
  renderHabits();
}

// ---- Objectives ----

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
      const id = Number(el.dataset.obj);
      const obj = homeData.objectives.find(o => o.id === id);
      if (obj) { obj.checked = !obj.checked; saveHomeData(); renderObjectives(); }
    });
  });
}

// ---- Notes ----

function initNotes() {
  const el = document.getElementById('home-notes');
  if (!el) return;
  el.value = homeData.notes || '';
  el.addEventListener('input', () => {
    homeData.notes = el.value;
    saveHomeData();
  });
}

// ---- Links ----

function initLinks() {
  document.querySelectorAll('.link-chip[data-external]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const url = a.getAttribute('href');
      if (url && window.polymind && window.polymind.openExternal) {
        window.polymind.openExternal(url);
      }
    });
  });
}

// ---- Init ----

function initHome() {
  loadHomeData();
  updateClock();
  setInterval(updateClock, 10000);
  renderHabits();
  renderObjectives();
  initNotes();
  initLinks();

  const addBtn = document.getElementById('btn-add-habit');
  if (addBtn) addBtn.addEventListener('click', addHabit);
}

