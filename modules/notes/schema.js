'use strict';

function notionPageToNote(page) {
  const props = page.properties;
  return {
    id: page.id,
    title: props.Title?.title?.[0]?.plain_text
      || props.Name?.title?.[0]?.plain_text
      || 'Untitled',
    content: props.Content?.rich_text?.map((r) => r.plain_text).join('') || '',
    tags: props.Tags?.multi_select?.map((t) => t.name) || [],
    pinned: props.Pinned?.checkbox || false,
    updatedAt: page.last_edited_time,
  };
}

function noteToNotionProperties(note) {
  const props = {};
  if (note.title   !== undefined) props.Title   = { title:     [{ text: { content: note.title } }] };
  if (note.content !== undefined) props.Content = { rich_text: [{ text: { content: note.content } }] };
  if (note.tags    !== undefined) props.Tags    = { multi_select: note.tags.map((name) => ({ name })) };
  if (note.pinned  !== undefined) props.Pinned  = { checkbox: note.pinned };
  return props;
}

/**
 * Notes need one client-side ordering rule sync doesn't get for free
 * from a Notion "sorts" query option: pinned notes first, then most
 * recently edited. Centralized here so main.js and any future caller
 * apply the exact same rule instead of re-deriving it.
 */
function sortNotes(notes) {
  return [...notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
}

module.exports = { notionPageToNote, noteToNotionProperties, sortNotes };
