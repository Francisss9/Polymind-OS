'use strict';

// =========================================================
// Notes Module
// Notion-synced two-pane note editor
// DB: b6195916-595b-46c2-94e0-635fa84c0384
// =========================================================

const Notes = (() => {
  // ---- State ----
  let notes = [];
  let activeId = null;
  let saveTimer = null;
  let activeTagFilter = null;
  let searchQuery = '';
  const SAVE_DELAY = 1200; // ms after last keystroke

  // ---- DOM refs (resolved on init) ----
  let listEl, searchEl, tagRowEl, editorPane, editorEmpty,
      titleInput, contentArea, tagInputRow, tagAddInput,
      saveStatus, syncBar, syncBtnEl;

  // ---- Helpers ----

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function activeNote() {
    return notes.find((n) => n.id === activeId) || null;
  }

  function allTags() {
    const set = new Set();
    notes.forEach((n) => n.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }

  function filteredNotes() {
    return notes.filter((n) => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q
        || n.title.toLowerCase().includes(q)
        || n.content.toLowerCase().includes(q);
      const matchTag = !activeTagFilter || n.tags.includes(activeTagFilter);
      return matchSearch && matchTag;
    });
  }

  // ---- Render: list ----

  function renderList() {
    const items = filteredNotes();
    if (!items.length) {
      listEl.innerHTML = '<div class="notes-empty-list">No notes found.<br>Press <strong>+ New</strong> to create one.</div>';
      return;
    }
    listEl.innerHTML = items.map((n) => `
      <div class="note-item${n.id === activeId ? ' active' : ''}" data-id="${n.id}">
        <div class="note-item-title">
          ${n.pinned ? '<svg class="note-pin-icon" width="9" height="9" viewBox="0 0 16 16" fill="currentColor"><path d="M9.828.722a.5.5 0 01.354.146l4.95 4.95a.5.5 0 010 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 01.16 1.013c.046.702-.032 1.687-.72 2.375l-1.933 1.933a.5.5 0 01-.707 0L5.845 13.6l-3.172 3.172a.5.5 0 01-.707-.707l3.172-3.172-1.487-1.488a.5.5 0 010-.707l1.932-1.932c.688-.688 1.673-.767 2.375-.72.353.022.671.079.977.16L12.069 5.1a6.645 6.645 0 01-.04-.46c0-.43.108-1.022.588-1.502a.5.5 0 01.354-.147z"/></svg>' : ''}
          ${escapeHtml(n.title || 'Untitled')}
        </div>
        <div class="note-item-preview">${escapeHtml((n.content || '').slice(0, 60))}</div>
        <div class="note-item-meta">
          <span class="note-item-date">${fmtDate(n.updatedAt)}</span>
          ${n.tags.map((t) => `<span class="note-item-tag">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.note-item').forEach((el) => {
      el.addEventListener('click', () => selectNote(el.dataset.id));
    });
  }

  function renderTagFilters() {
    const tags = allTags();
    tagRowEl.innerHTML = tags.map((t) => `
      <button class="notes-tag-filter${t === activeTagFilter ? ' active' : ''}" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>
    `).join('');
    tagRowEl.querySelectorAll('.notes-tag-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeTagFilter = activeTagFilter === btn.dataset.tag ? null : btn.dataset.tag;
        renderTagFilters();
        renderList();
      });
    });
  }

  // ---- Render: editor ----

  function renderEditor() {
    const note = activeNote();
    if (!note) {
      editorPane.querySelector('.notes-editor-toolbar').style.display = 'none';
      editorPane.querySelector('.notes-title-input').style.display = 'none';
      editorPane.querySelector('.notes-tag-input-row').style.display = 'none';
      editorPane.querySelector('.notes-content-area').style.display = 'none';
      editorEmpty.style.display = 'flex';
      return;
    }

    editorEmpty.style.display = 'none';
    editorPane.querySelector('.notes-editor-toolbar').style.display = 'flex';
    titleInput.style.display = 'block';
    editorPane.querySelector('.notes-tag-input-row').style.display = 'flex';
    contentArea.style.display = 'block';

    titleInput.value = note.title;
    contentArea.value = note.content;
    renderEditorTags(note.tags);
    updatePinBtn(note.pinned);
    setSaveStatus('');
    resetDeleteConfirm();
  }

  function resetDeleteConfirm() {
    const btn = document.getElementById('notes-delete-btn');
    if (!btn) return;
    btn.dataset.confirm = '';
    const label = btn.querySelector('.notes-btn-label');
    if (label) label.textContent = 'Delete';
  }

  function renderEditorTags(tags) {
    // Remove existing tag chips (leave the input)
    tagInputRow.querySelectorAll('.note-editor-tag').forEach((el) => el.remove());

    // Insert chips before the add-input
    tags.forEach((tag) => {
      const chip = document.createElement('span');
      chip.className = 'note-editor-tag';
      chip.innerHTML = `${escapeHtml(tag)}<button class="note-editor-tag-remove" data-tag="${escapeHtml(tag)}" title="Remove tag">×</button>`;
      tagInputRow.insertBefore(chip, tagAddInput);
      chip.querySelector('.note-editor-tag-remove').addEventListener('click', () => removeTag(tag));
    });
  }

  function updatePinBtn(pinned) {
    const btn = document.getElementById('notes-pin-btn');
    if (!btn) return;
    btn.title = pinned ? 'Unpin note' : 'Pin note';
    btn.classList.toggle('active', !!pinned);
  }

  // ---- Select / create / delete ----

  function selectNote(id) {
    if (activeId === id) return;
    flushSave();
    activeId = id;
    renderList();
    renderEditor();
  }

  async function createNote() {
    flushSave();
    try {
      const note = await window.polymind.notes.create({ title: '', content: '', tags: [] });
      notes.unshift(note);
      activeId = note.id;
      renderTagFilters();
      renderList();
      renderEditor();
      titleInput.focus();
    } catch (err) {
      console.error('notes:create', err);
      showNotesError(err.message || 'Could not create note.');
    }
  }

  function showNotesError(message) {
    if (!syncBar) return;
    const label = syncBar.querySelector('.notes-sync-label');
    if (!label) return;
    const original = label.textContent;
    label.textContent = message;
    label.classList.add('notes-sync-error');
    setTimeout(() => {
      label.textContent = original;
      label.classList.remove('notes-sync-error');
    }, 4000);
  }

  async function deleteActiveNote() {
    const note = activeNote();
    if (!note) return;
    const btn = document.getElementById('notes-delete-btn');
    if (btn && btn.dataset.confirm !== 'pending') {
      btn.dataset.confirm = 'pending';
      const label = btn.querySelector('.notes-btn-label');
      if (label) label.textContent = 'Sure?';
      setTimeout(() => {
        if (btn.dataset.confirm === 'pending') resetDeleteConfirm();
      }, 2500);
      return;
    }
    clearTimeout(saveTimer);
    const id = activeId;
    activeId = null;
    notes = notes.filter((n) => n.id !== id);
    renderTagFilters();
    renderList();
    renderEditor();
    try {
      await window.polymind.notes.delete(id);
    } catch (err) {
      console.error('notes:delete', err);
      showNotesError(err.message || 'Could not delete note.');
    }
  }

  async function togglePin() {
    const note = activeNote();
    if (!note) return;
    const newPinned = !note.pinned;
    note.pinned = newPinned;
    // Re-sort: pinned first
    notes.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt) - new Date(a.updatedAt);
    });
    updatePinBtn(newPinned);
    renderList();
    try {
      await window.polymind.notes.update({ id: note.id, pinned: newPinned });
    } catch (err) {
      console.error('notes:update pin', err);
      showNotesError(err.message || 'Could not update pin.');
    }
  }

  // ---- Tags ----

  function removeTag(tag) {
    const note = activeNote();
    if (!note) return;
    note.tags = note.tags.filter((t) => t !== tag);
    renderEditorTags(note.tags);
    scheduleSave();
  }

  function addTag(raw) {
    const tag = raw.trim();
    if (!tag) return;
    const note = activeNote();
    if (!note || note.tags.includes(tag)) return;
    note.tags.push(tag);
    renderEditorTags(note.tags);
    scheduleSave();
  }

  // ---- Auto-save ----

  function scheduleSave() {
    setSaveStatus('Unsaved…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DELAY);
  }

  async function flushSave() {
    clearTimeout(saveTimer);
    const note = activeNote();
    if (!note) return;
    const title   = titleInput.value.trim() || 'Untitled';
    const content = contentArea.value;
    // Sync state
    note.title   = title;
    note.content = content;
    setSaveStatus('Saving…');
    try {
      const updated = await window.polymind.notes.update({
        id: note.id,
        title,
        content,
        tags: note.tags,
      });
      note.updatedAt = updated.updatedAt;
      setSaveStatus('Saved');
      renderList();
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      setSaveStatus('Save failed');
      console.error('notes:update', err);
    }
  }

  function setSaveStatus(text) {
    if (saveStatus) saveStatus.textContent = text;
  }

  // ---- Sync ----

  async function syncNotes() {
    if (syncBar) syncBar.querySelector('.notes-sync-label').textContent = 'Syncing…';
    try {
      const result = await window.polymind.notes.sync();
      notes = result.notes;
      updateSyncBar(result.syncedAt);
      renderTagFilters();
      renderList();
      // If active note was updated, refresh editor
      if (activeId && !notes.find((n) => n.id === activeId)) {
        activeId = null;
        renderEditor();
      } else if (activeId) {
        renderEditor();
      }
    } catch (err) {
      if (syncBar) syncBar.querySelector('.notes-sync-label').textContent = 'Sync failed';
      console.error('notes:sync', err);
    }
  }

  function updateSyncBar(iso) {
    if (!syncBar) return;
    const label = syncBar.querySelector('.notes-sync-label');
    label.textContent = iso ? `Synced ${fmtDate(iso)}` : 'Not synced';
  }

  // ---- Keyboard ----

  function onKeydown(e) {
    // Ctrl/Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      flushSave();
    }
  }

  // ---- Init ----

  async function init() {
    const section = document.getElementById('view-notes');
    if (!section) return;

    // Build DOM
    section.innerHTML = `
      <div class="notes-list-pane">
        <div class="notes-sync-bar" id="notes-sync-bar">
          <span class="notes-sync-label">Not synced</span>
          <button class="notes-sync-btn" id="notes-sync-btn" title="Sync from Notion">↻</button>
        </div>
        <div class="notes-list-header">
          <div class="notes-search-wrap">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" stroke-width="1.3"/>
              <path d="M10.5 10.5l3 3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
            </svg>
            <input class="notes-search" id="notes-search" type="text" placeholder="Search notes…" spellcheck="false" />
          </div>
          <div class="notes-tag-row" id="notes-tag-row"></div>
        </div>
        <div class="notes-list-actions">
          <button class="notes-new-btn" id="notes-new-btn">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <path d="M6 1v10M1 6h10" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
            </svg>
            New note
          </button>
        </div>
        <div class="notes-list-scroll" id="notes-list"></div>
      </div>

      <div class="notes-editor-pane" id="notes-editor-pane">
        <div class="notes-editor-empty" id="notes-editor-empty">
          <svg width="32" height="32" viewBox="0 0 16 16" fill="none">
            <path d="M3 2h10v12H3zM6 6h4M6 9h4M6 12h2" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
          </svg>
          <span>Select a note or create one</span>
        </div>

        <div class="notes-editor-toolbar" style="display:none">
          <div class="notes-toolbar-left">
            <button class="notes-icon-btn" id="notes-pin-btn" title="Pin note">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M9.828.722a.5.5 0 01.354.146l4.95 4.95a.5.5 0 010 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 01.16 1.013c.046.702-.032 1.687-.72 2.375l-1.933 1.933a.5.5 0 01-.707 0L5.845 13.6l-3.172 3.172a.5.5 0 01-.707-.707l3.172-3.172-1.487-1.488a.5.5 0 010-.707l1.932-1.932c.688-.688 1.673-.767 2.375-.72.353.022.671.079.977.16L12.069 5.1a6.645 6.645 0 01-.04-.46c0-.43.108-1.022.588-1.502a.5.5 0 01.354-.147z" stroke="currentColor" stroke-width="1.1"/>
              </svg>
              Pin
            </button>
          </div>
          <div class="notes-toolbar-right">
            <span class="notes-save-status" id="notes-save-status"></span>
            <button class="notes-icon-btn danger" id="notes-delete-btn" title="Delete note">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span class="notes-btn-label">Delete</span>
            </button>
          </div>
        </div>

        <input class="notes-title-input" id="notes-title-input" type="text" placeholder="Note title…" style="display:none" spellcheck="false" />

        <div class="notes-tag-input-row" id="notes-tag-input-row" style="display:none">
          <input class="notes-tag-add-input" id="notes-tag-add-input" type="text" placeholder="+ add tag" spellcheck="false" />
        </div>

        <textarea class="notes-content-area" id="notes-content-area" placeholder="Start writing…" style="display:none" spellcheck="false"></textarea>
      </div>
    `;

    // Resolve refs
    listEl       = document.getElementById('notes-list');
    searchEl     = document.getElementById('notes-search');
    tagRowEl     = document.getElementById('notes-tag-row');
    editorPane   = document.getElementById('notes-editor-pane');
    editorEmpty  = document.getElementById('notes-editor-empty');
    titleInput   = document.getElementById('notes-title-input');
    contentArea  = document.getElementById('notes-content-area');
    tagInputRow  = document.getElementById('notes-tag-input-row');
    tagAddInput  = document.getElementById('notes-tag-add-input');
    saveStatus   = document.getElementById('notes-save-status');
    syncBar      = document.getElementById('notes-sync-bar');
    syncBtnEl    = document.getElementById('notes-sync-btn');

    // Events: list pane
    searchEl.addEventListener('input', () => {
      searchQuery = searchEl.value;
      renderList();
    });

    document.getElementById('notes-new-btn').addEventListener('click', createNote);

    // Events: sync
    syncBtnEl.addEventListener('click', syncNotes);

    // Events: editor
    document.getElementById('notes-pin-btn').addEventListener('click', togglePin);
    document.getElementById('notes-delete-btn').addEventListener('click', deleteActiveNote);

    titleInput.addEventListener('input', scheduleSave);
    contentArea.addEventListener('input', scheduleSave);

    tagAddInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addTag(tagAddInput.value);
        tagAddInput.value = '';
      }
      if (e.key === 'Backspace' && !tagAddInput.value) {
        const note = activeNote();
        if (note && note.tags.length) {
          removeTag(note.tags[note.tags.length - 1]);
        }
      }
    });

    tagAddInput.addEventListener('blur', () => {
      if (tagAddInput.value.trim()) {
        addTag(tagAddInput.value);
        tagAddInput.value = '';
      }
    });

    // Global keyboard shortcut
    document.addEventListener('keydown', onKeydown);

    // Load cache
    try {
      const cached = await window.polymind.notes.getCached();
      notes = cached.notes || [];
      updateSyncBar(cached.syncedAt);
    } catch (err) {
      console.error('notes:getCached', err);
      notes = [];
    }

    renderTagFilters();
    renderList();
    renderEditor();
  }

  return { init, sync: syncNotes };
})();
