'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HABIT_PROPS, notionPageToHabitEntry, habitCheckboxPatch } = require('../../modules/habits/schema');

function pageWithChecks(overrides = {}, progress = 45) {
  const properties = {
    Date: { date: { start: '2026-01-01' } },
    Day: { select: { name: 'Thursday' } },
    Progress: { formula: { number: progress } },
  };
  for (const name of HABIT_PROPS) {
    properties[name] = { checkbox: overrides[name] ?? false };
  }
  return { id: 'habit-page-1', properties };
}

test('notionPageToHabitEntry', async (t) => {
  await t.test('reads every habit checkbox by name', () => {
    const entry = notionPageToHabitEntry(pageWithChecks({ Gym: true, Journal: true }));
    assert.equal(entry.Gym, true);
    assert.equal(entry.Journal, true);
    assert.equal(entry.Read, false);
  });

  await t.test('reads progress straight from the Notion formula, not recomputed locally', () => {
    // This is the regression that matters: progress must come from
    // whatever Notion's own formula produces (91 here), never a locally
    // reimplemented average of checkboxes. If someone reintroduces a
    // local average, this test would still pass by coincidence unless
    // the formula and the checkbox count disagree — so we deliberately
    // seed a progress value that a flat average could NOT produce.
    const entry = notionPageToHabitEntry(pageWithChecks({ Gym: true }, 91));
    assert.equal(entry.progress, 91);
  });

  await t.test('defaults progress to null when the formula has no value', () => {
    const page = pageWithChecks();
    page.properties.Progress = { formula: {} };
    assert.equal(notionPageToHabitEntry(page).progress, null);
  });

  await t.test('missing checkbox properties default to false, not undefined', () => {
    const page = { id: 'sparse', properties: { Date: { date: { start: '2026-01-02' } } } };
    const entry = notionPageToHabitEntry(page);
    for (const name of HABIT_PROPS) {
      assert.equal(entry[name], false);
    }
  });
});

test('habitCheckboxPatch', async (t) => {
  await t.test('builds a single-property checkbox patch', () => {
    assert.deepEqual(habitCheckboxPatch('Gym', true), { Gym: { checkbox: true } });
  });

  await t.test('only patches the named habit, nothing else', () => {
    const patch = habitCheckboxPatch('Read', false);
    assert.equal(Object.keys(patch).length, 1);
    assert.equal(patch.Read.checkbox, false);
  });
});
