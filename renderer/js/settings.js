'use strict';

// =========================================================
// SETTINGS MODULE
// Owns: the Kernel settings view's save/test/disconnect
// actions. Reads/writes config through window.polymind.config
// and window.polymind.notion — never touches sync or gate
// state directly.
// =========================================================

async function handleSettingsSave() {
  clearBanners($('#settings-error'), $('#settings-success'));
  const payload = {
    displayName: $('#settings-display-name').value.trim(),
    databaseId:  $('#settings-database').value.trim(),
    habitsDbId:  $('#settings-habits-db').value.trim(),
    goalsDbId:   $('#settings-goals-db').value.trim(),
    balanceDbId: $('#settings-balance-db').value.trim(),
    notesDbId:   $('#settings-notes-db').value.trim(),
  };
  const token = $('#settings-token').value.trim();
  if (token) payload.notionToken = token;
  try {
    config = await window.polymind.config.set(payload);
    showBanner($('#settings-success'), 'Saved.');
    $('#settings-success').classList.remove('hidden');
    $('#settings-token').value = '';
  } catch (err) {
    showBanner($('#settings-error'), err.message);
  }
}

async function handleSettingsTest() {
  clearBanners($('#settings-error'), $('#settings-success'));
  try {
    const r = await window.polymind.notion.test({
      notionToken: $('#settings-token').value.trim() || config.notionToken,
      databaseId:  $('#settings-database').value.trim(),
    });
    showBanner($('#settings-success'), `✓ Connected to "${r.title}"`);
    $('#settings-success').classList.remove('hidden');
  } catch (err) {
    showBanner($('#settings-error'), err.message);
  }
}

function handleDisconnect() {
  const btn = document.getElementById('btn-disconnect');
  if (!btn) return;
  if (btn.dataset.confirm !== 'pending') {
    btn.dataset.confirm = 'pending';
    btn.textContent = 'Sure? Click again';
    setTimeout(() => {
      if (btn.dataset.confirm === 'pending') {
        btn.dataset.confirm = '';
        btn.textContent = 'Disconnect Notion';
      }
    }, 3000);
    return;
  }
  window.polymind.config.set({ setupComplete: false, notionToken: '', databaseId: '' });
  showGate('notion');
}
