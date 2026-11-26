'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const theme = require('../lib/theme.js');

test('TOKEN_NAMES covers the mapped CMEM tokens', () => {
  assert.equal(theme.TOKEN_NAMES.length, 14);
  assert.ok(theme.TOKEN_NAMES.includes('--eccgui-color-primary'));
  assert.ok(theme.TOKEN_NAMES.includes('--eccgui-color-accent'));
  assert.ok(theme.TOKEN_NAMES.includes('--eccgui-size-typo-text'));
});

test('copyTokens copies only non-empty values and reports how many', () => {
  const set = [];
  const source = { getPropertyValue: (n) => (n === '--eccgui-color-primary' ? ' #123456 ' : '') };
  const target = { style: { setProperty: (n, v) => set.push([n, v]) } };
  assert.equal(theme.copyTokens(source, target), 1);
  assert.deepEqual(set, [['--eccgui-color-primary', '#123456']]);
});

test('copyTokens tolerates a missing source', () => {
  assert.equal(theme.copyTokens(null, { style: { setProperty() {} } }), 0);
});

test('every theme CSS variable falls back to a hex value', () => {
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'sparnatural-theme-cmem.css'), 'utf8');
  for (const name of ['--primary-color-main', '--primary-color-important', '--primary-color-medium', '--primary-color-light',
    '--secondary-color-main', '--secondary-color-important', '--secondary-color-light', '--ternary-color-main',
    '--ternary-color-light', '--silver-color-main', '--silver-color-light', '--default-text-color', '--focus-color']) {
    assert.match(css, new RegExp(name + ': var\\(--eccgui-[a-z0-9-]+, #[0-9a-f]{6}\\);'), name);
  }
});
