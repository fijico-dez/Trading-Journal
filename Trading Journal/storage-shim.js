/**
 * Polyfills `window.storage` using the browser's localStorage.
 *
 * The trading journal app talks to `window.storage.get/set/delete/list`
 * because that's the persistence API available inside Claude.ai artifacts.
 * Outside of Claude.ai (e.g. hosted on GitHub Pages) that API doesn't exist,
 * so this shim recreates the same interface on top of localStorage. It's
 * imported once, before the app renders, and the app's code needs no changes.
 *
 * Notes:
 * - Data is stored per-browser, per-device (localStorage is not synced
 *   across devices or browsers).
 * - The `shared` parameter is accepted for API compatibility but ignored,
 *   since there's no backend to share data through.
 */

const PREFIX = "tj:";

function readAll() {
  const out = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(PREFIX)) {
      out[key.slice(PREFIX.length)] = localStorage.getItem(key);
    }
  }
  return out;
}

if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(PREFIX + key);
      if (raw === null) return null;
      return { key, value: raw, shared: false };
    },

    async set(key, value) {
      localStorage.setItem(PREFIX + key, value);
      return { key, value, shared: false };
    },

    async delete(key) {
      const existed = localStorage.getItem(PREFIX + key) !== null;
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: existed, shared: false };
    },

    async list(prefix = "") {
      const all = readAll();
      const keys = Object.keys(all).filter((k) => k.startsWith(prefix));
      return { keys, prefix, shared: false };
    },
  };
}
