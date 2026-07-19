'use strict';

// =========================================================
// ELECTRON CIPHER
// =========================================================
// Adapts Electron's safeStorage (OS-native encryption — macOS
// Keychain, Windows DPAPI, Linux Secret Service/libsecret) to
// the { isAvailable, encrypt, decrypt } shape secure-store.js
// expects.
//
// This file is the ONLY place that requires 'electron' for
// storage purposes, kept out of kernel/store.js and
// kernel/secure-store.js on purpose — both of those need to
// stay importable from a plain Node test process, and
// require('electron') throws outside a real Electron runtime.
//
// safeStorage.encryptString returns a Buffer; electron-store
// persists to JSON, so the buffer is base64-encoded going in
// and decoded coming back out.

function createElectronCipher() {
  const { safeStorage } = require('electron');

  return {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plainText) => safeStorage.encryptString(plainText).toString('base64'),
    decrypt: (encoded) => safeStorage.decryptString(Buffer.from(encoded, 'base64')),
  };
}

module.exports = { createElectronCipher };
