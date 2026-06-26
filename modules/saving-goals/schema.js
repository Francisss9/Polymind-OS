'use strict';

function notionPageToGoal(page) {
  const props = page.properties;
  return {
    id: page.id,
    name: props.Name?.title?.[0]?.plain_text || 'Unnamed',
    goal: props.Goal?.number ?? 0,
    saved: props.Saved?.number ?? 0,
    earned: props.Earned?.number ?? 0,
    required: props.Required?.number ?? null,
    targetDate: props['Target Date']?.date?.start || null,
    category: props.Category?.select?.name || null,
    status: props.Status?.select?.name || null,
    progress: props.Progress?.formula?.number ?? null,
  };
}

function goalToNotionProperties(goal) {
  const props = {};
  if (goal.saved !== undefined) props.Saved = { number: goal.saved };
  if (goal.earned !== undefined) props.Earned = { number: goal.earned };
  return props;
}

module.exports = { notionPageToGoal, goalToNotionProperties };
