'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readParams } = require('../lib/params.js');
const { parseLinks, DEFAULT_LINKS } = require('../lib/links.js');

test('defaults without parameters', () => {
  const p = readParams('', '', 'de-DE');
  assert.equal(p.graph, null);
  assert.equal(p.picker, true);
  assert.equal(p.mode, 'shaped');
  assert.equal(p.sparql, false);
  assert.equal(p.lang, 'de');
  assert.equal(p.limit, 1000);
  assert.deepEqual(p.links, parseLinks(DEFAULT_LINKS));
});

test('hash parameters win over query parameters', () => {
  assert.equal(readParams('?graph=a', '#graph=b', 'en').graph, 'b');
  assert.equal(readParams('?graph=a', '', 'en').graph, 'a');
});

test('a preset graph hides the picker unless picker=true', () => {
  assert.equal(readParams('', '#graph=http://g/', 'en').picker, false);
  assert.equal(readParams('', '#graph=http://g/&picker=true', 'en').picker, true);
});

test('shapes, sparql, limit and lang are read and validated', () => {
  const p = readParams('', '#mode=raw&sparql=true&limit=50&lang=fr', 'en');
  assert.equal(p.mode, 'raw');
  assert.equal(p.sparql, true);
  assert.equal(p.limit, 50);
  assert.equal(p.lang, 'fr');
  assert.equal(readParams('', '#limit=abc', 'en').limit, 1000);
  assert.equal(readParams('', '#mode=xyz', 'en').mode, 'shaped');
});

test('an empty graph parameter means the whole store', () => {
  assert.equal(readParams('', '#graph=', 'en').graph, null);
});

test('links parameter replaces the default list', () => {
  const p = readParams('', '#links=' + encodeURIComponent('BKE=/{view}/bke/new?graph={graph}&resourceIri={resource}'), 'en');
  assert.deepEqual(p.links.map((l) => l.name), ['BKE']);
});

test('shapes=off is an alias of mode=raw; mode wins when both are given', () => {
  assert.equal(readParams('', '#shapes=off', 'en').mode, 'raw');
  assert.equal(readParams('', '#shapes=off&mode=shaped', 'en').mode, 'shaped');
});
