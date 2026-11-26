/*
 * Per-user cache of the generated configuration in localStorage. Structure only, never widget values.
 * Every function tolerates missing, full or blocked storage. Runs in the browser and in node.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).cache = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_AGE_MS = 24 * 3600 * 1000;

  const PREFIX = 'cmem-sparnatural:';

  /** null when the user is unknown: never share cached configurations between users. */
  function cacheKey({ version, user, graph, shapes, lang }) {
    if (!user) return null;
    return PREFIX + JSON.stringify([version, user, graph == null ? 'store' : graph, shapes, lang]);
  }

  function ownKeys(storage) {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    return keys;
  }

  /** Removes entries of other page versions and expired ones (the origin's storage is shared with CMEM). */
  function pruneCache(storage, version, now) {
    try {
      if (!storage) return;
      for (const k of ownKeys(storage)) {
        let drop = true;
        try {
          const v = JSON.parse(k.slice(PREFIX.length))[0];
          const entry = JSON.parse(storage.getItem(k));
          drop = v !== version || !entry || now - entry.builtAt > MAX_AGE_MS;
        } catch (e) { /* unreadable: drop */ }
        if (drop) storage.removeItem(k);
      }
    } catch (e) { /* ignore */ }
  }

  function readCache(storage, key, now) {
    try {
      const raw = storage && key && storage.getItem(key);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (!entry || typeof entry.turtle !== 'string' || typeof entry.builtAt !== 'number') return null;
      if (now - entry.builtAt > MAX_AGE_MS) return null;
      return entry;
    } catch (e) {
      return null;
    }
  }

  function writeCache(storage, key, entry, now) {
    if (!storage || !key) return false;
    const value = { turtle: entry.turtle, builtAt: now, mode: entry.mode };
    if (entry.css) value.css = entry.css;
    const json = JSON.stringify(value);
    try {
      storage.setItem(key, json);
      return true;
    } catch (e) {
      // full: drop our other entries and try once more
      try {
        for (const k of ownKeys(storage)) if (k !== key) storage.removeItem(k);
        storage.setItem(key, json);
        return true;
      } catch (e2) {
        return false;
      }
    }
  }

  function dropCache(storage, key) {
    try { if (storage && key) storage.removeItem(key); } catch (e) { /* ignore */ }
  }

  return { MAX_AGE_MS, cacheKey, readCache, writeCache, dropCache, pruneCache };
});
