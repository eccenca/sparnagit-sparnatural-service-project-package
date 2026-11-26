'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const cache = require('../lib/cache.js');

function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k),
    get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, _m: m,
  };
}
const throwing = (name) => () => { const e = new Error('nope'); e.name = name; throw e; };
const base = { version: 'v1', user: 'http://u/1', graph: 'http://g/', shapes: 'auto', lang: 'en' };
const entry = { turtle: '@prefix x: <y> .', builtAt: 1000, mode: 'shapes' };

test('write then read within 24h returns the entry; expired returns null', () => {
  const s = memoryStorage();
  const key = cache.cacheKey(base);
  assert.equal(cache.writeCache(s, key, entry, 1000), true);
  assert.deepEqual(cache.readCache(s, key, 1000 + cache.MAX_AGE_MS), entry);
  assert.equal(cache.readCache(s, key, 1000 + cache.MAX_AGE_MS + 1), null);
});

test('keys differ by version, user, graph, shapes and lang', () => {
  const k = cache.cacheKey(base);
  for (const change of [{ version: 'v2' }, { user: 'http://u/2' }, { graph: null }, { shapes: 'off' }, { lang: 'de' }]) {
    assert.notEqual(cache.cacheKey({ ...base, ...change }), k, JSON.stringify(change));
  }
  assert.ok(cache.cacheKey({ ...base, graph: null }).includes('"store"'));
});

test('dropCache removes the entry', () => {
  const s = memoryStorage();
  const key = cache.cacheKey(base);
  cache.writeCache(s, key, entry, 1000);
  cache.dropCache(s, key);
  assert.equal(cache.readCache(s, key, 1000), null);
});

test('unparsable entries read as null', () => {
  const s = memoryStorage();
  s.setItem('k', '{not json');
  assert.equal(cache.readCache(s, 'k', 0), null);
});

test('full storage: writeCache returns false', () => {
  const s = memoryStorage();
  s.setItem = throwing('QuotaExceededError');
  assert.equal(cache.writeCache(s, 'k', entry, 1000), false);
});

test('storage that always throws, or no storage: no exceptions', () => {
  const s = { getItem: throwing('SecurityError'), setItem: throwing('SecurityError'), removeItem: throwing('SecurityError') };
  assert.equal(cache.readCache(s, 'k', 0), null);
  assert.equal(cache.writeCache(s, 'k', entry, 0), false);
  assert.doesNotThrow(() => cache.dropCache(s, 'k'));
  assert.equal(cache.readCache(null, 'k', 0), null);
  assert.equal(cache.writeCache(undefined, 'k', entry, 0), false);
});

test('cache keeps the depiction CSS with the configuration', () => {
  const s = memoryStorage();
  cache.writeCache(s, 'k', { ...entry, css: '.x{}' }, 1000);
  assert.equal(cache.readCache(s, 'k', 1000).css, '.x{}');
});

test('unknown user: no cache key, and reading or writing without a key does nothing', () => {
  const s = memoryStorage();
  assert.equal(cache.cacheKey({ ...base, user: null }), null);
  assert.equal(cache.writeCache(s, null, entry, 1000), false);
  assert.equal(cache.readCache(s, null, 1000), null);
  assert.equal(s._m.size, 0);
});

test('pruneCache removes expired entries and entries of other versions, keeps the rest and foreign keys', () => {
  const s = memoryStorage();
  const fresh = cache.cacheKey(base);
  const old = cache.cacheKey({ ...base, version: 'v0' });
  const expired = cache.cacheKey({ ...base, graph: 'http://g/2' });
  cache.writeCache(s, fresh, entry, 1000);
  cache.writeCache(s, old, entry, 1000);
  cache.writeCache(s, expired, entry, 1000 - cache.MAX_AGE_MS - 10);
  s.setItem('workspace', 'cmem');
  cache.pruneCache(s, 'v1', 1000);
  assert.deepEqual([...s._m.keys()].sort(), [fresh, 'workspace'].sort());
});

test('full storage: writeCache drops the other cache entries and retries once', () => {
  const s = memoryStorage();
  cache.writeCache(s, cache.cacheKey({ ...base, graph: 'http://g/old' }), entry, 1000);
  const set = s.setItem;
  let failures = 1;
  s.setItem = (k, v) => { if (failures-- > 0) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } set(k, v); };
  const key = cache.cacheKey(base);
  assert.equal(cache.writeCache(s, key, entry, 1000), true);
  assert.deepEqual([...s._m.keys()], [key]);
});
