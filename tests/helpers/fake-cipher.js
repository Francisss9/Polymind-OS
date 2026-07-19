'use strict';

/**
 * Minimal fake of the { isAvailable, encrypt, decrypt } cipher shape
 * secure-store.js expects. Used to unit-test the encryption wrapper
 * without requiring Electron's safeStorage to be running.
 *
 * The "encryption" here is a reversible, obviously-fake transform
 * (prefix tag + reverse) — good enough to prove the wrapper calls
 * encrypt/decrypt at the right times, without pretending to test
 * real cryptography (that's Electron's job, not ours).
 */
function createFakeCipher({ available = true } = {}) {
  const TAG = 'ENC:';
  return {
    isAvailable: () => available,
    encrypt: (plainText) => TAG + [...plainText].reverse().join(''),
    decrypt: (encoded) => {
      if (!encoded.startsWith(TAG)) throw new Error('not encrypted with this cipher');
      return [...encoded.slice(TAG.length)].reverse().join('');
    },
  };
}

module.exports = { createFakeCipher };
