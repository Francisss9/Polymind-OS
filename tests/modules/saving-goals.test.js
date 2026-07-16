'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { notionPageToGoal, goalToNotionProperties } = require('../../modules/saving-goals/schema');

test('notionPageToGoal', async (t) => {
  await t.test('maps a fully-populated page', () => {
    const page = {
      id: 'goal-1',
      properties: {
        Name: { title: [{ plain_text: 'Emergency fund' }] },
        Goal: { number: 5000 },
        Saved: { number: 1200 },
        Earned: { number: 300 },
        Required: { number: 500 },
        'Target Date': { date: { start: '2026-12-31' } },
        Category: { select: { name: 'Safety net' } },
        Status: { select: { name: 'In progress' } },
        Progress: { formula: { number: 24 } },
      },
    };
    const goal = notionPageToGoal(page);
    assert.equal(goal.name, 'Emergency fund');
    assert.equal(goal.goal, 5000);
    assert.equal(goal.saved, 1200);
    assert.equal(goal.earned, 300);
    assert.equal(goal.required, 500);
    assert.equal(goal.targetDate, '2026-12-31');
    assert.equal(goal.category, 'Safety net');
    assert.equal(goal.status, 'In progress');
    assert.equal(goal.progress, 24);
  });

  await t.test('unnamed goal falls back to a placeholder, not an empty string', () => {
    const goal = notionPageToGoal({ id: 'goal-2', properties: {} });
    assert.equal(goal.name, 'Unnamed');
  });

  await t.test('numeric fields default to 0, nullable fields default to null', () => {
    const goal = notionPageToGoal({ id: 'goal-3', properties: {} });
    assert.equal(goal.goal, 0);
    assert.equal(goal.saved, 0);
    assert.equal(goal.earned, 0);
    assert.equal(goal.required, null);
    assert.equal(goal.targetDate, null);
  });
});

test('goalToNotionProperties', async (t) => {
  await t.test('only includes saved/earned, never other fields', () => {
    const props = goalToNotionProperties({ saved: 100, earned: 20 });
    assert.deepEqual(Object.keys(props).sort(), ['Earned', 'Saved']);
  });

  await t.test('omits a field entirely when it is undefined', () => {
    const props = goalToNotionProperties({ saved: 100 });
    assert.ok(!('Earned' in props));
  });

  await t.test('a zero value is still included (0 saved is meaningful, not "unset")', () => {
    const props = goalToNotionProperties({ saved: 0, earned: 0 });
    assert.equal(props.Saved.number, 0);
    assert.equal(props.Earned.number, 0);
  });
});
