'use strict';

/**
 * Minimal fake of electron-store's API surface (just .get/.set with a
 * default-value fallback). Used to unit-test kernel/store.js without
 * touching disk or requiring Electron to be running.
 */
function createFakeBackingStore(seed = {}) {
  const data = { ...seed };
  return {
    get(key, defaultValue) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : defaultValue;
    },
    set(key, value) {
      data[key] = value;
    },
    // exposed for assertions that want to peek at raw state
    _dump: () => ({ ...data }),
  };
}

module.exports = { createFakeBackingStore };
