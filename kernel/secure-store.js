'use strict';

// =========================================================
// SECURE STORE
// =========================================================
// Wraps any backing store (the same .get/.set shape used
// throughout kernel/store.js) so that specific keys are
// encrypted at rest instead of sitting in plaintext JSON.
//
// This is a pure factory — it takes a `cipher` object rather
// than reaching for Electron's safeStorage itself. That's
// what keeps it unit-testable from plain Node (see
// tests/kernel/secure-store.test.js): tests pass in a fake
// cipher, main.js wires in the real Electron one.
//
// cipher shape: { isAvailable(), encrypt(plainText) -> string,
//                 decrypt(encoded) -> string }
//
// Migration note: if a value already on disk predates
// encryption (plain string, never touched by this wrapper),
// decrypt() will throw. That failure is treated as "this was
// never encrypted" and the raw value is returned as-is — the
// very next write re-saves it encrypted, so existing installs
// upgrade themselves silently on first use. No manual
// migration step, no crash, no data loss.

function wrapWithEncryption(backingStore, cipher, sensitiveKeys) {
  const keySet = new Set(sensitiveKeys);

  function get(key, defaultValue) {
    const raw = backingStore.get(key, defaultValue);
    if (!keySet.has(key) || !raw || !cipher.isAvailable()) return raw;
    try {
      return cipher.decrypt(raw);
    } catch {
      // Pre-encryption plaintext value, or corrupted — hand back as-is.
      // The next set() call for this key will encrypt it going forward.
      return raw;
    }
  }

  function set(key, value) {
    if (keySet.has(key) && value && cipher.isAvailable()) {
      backingStore.set(key, cipher.encrypt(value));
      return;
    }
    backingStore.set(key, value);
  }

  return { get, set };
}

module.exports = { wrapWithEncryption };
