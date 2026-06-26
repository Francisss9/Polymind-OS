'use strict';

// Habit property names in Notion (checkboxes)
const HABIT_PROPS = [
  'Wake up 7 a.m.',
  'GM',
  'Read',
  'Trading',
  'Journal',
  'Gym',
  '3L Hydration',
  'Shower',
  'Study/Work',
  'Nutrition',
  'God',
];

function notionPageToHabitEntry(page) {
  const props = page.properties;
  const entry = {
    id: page.id,
    date: props.Date?.date?.start || null,
    day: props.Day?.select?.name || null,
    progress: props.Progress?.formula?.number ?? null,
  };
  HABIT_PROPS.forEach(name => {
    entry[name] = props[name]?.checkbox ?? false;
  });
  return entry;
}

// Build Notion properties patch for a single checkbox update
function habitCheckboxPatch(habitName, checked) {
  return { [habitName]: { checkbox: checked } };
}

module.exports = { HABIT_PROPS, notionPageToHabitEntry, habitCheckboxPatch };
