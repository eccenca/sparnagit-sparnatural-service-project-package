'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_LINKS, parseLinks, expandLink, linkIconsHtml } = require('../lib/links.js');

const EXPLORE = '/{view}/explore?graph={graph}&resource={resource}';
const BKE = '/{view}/bke/new?graph={graph}&resourceIri={resource}';

test('default link list is Explore, then BKE', () => {
  assert.deepEqual(parseLinks(DEFAULT_LINKS), [{ name: 'Explore', template: EXPLORE }, { name: 'BKE', template: BKE }]);
});

test('parseLinks splits pairs at | and names at the first =', () => {
  assert.deepEqual(parseLinks(`Explore=${EXPLORE}|BKE=${BKE}`), [
    { name: 'Explore', template: EXPLORE },
    { name: 'BKE', template: BKE },
  ]);
});

test('parseLinks ignores empty and nameless entries', () => {
  assert.deepEqual(parseLinks(`|=x|Explore=${EXPLORE}|`), [{ name: 'Explore', template: EXPLORE }]);
});

test('expandLink encodes every value', () => {
  assert.equal(
    expandLink(EXPLORE, { view: 'sparnatural', graph: 'http://g/', resource: 'http://r/1?a=b' }),
    '/sparnatural/explore?graph=http%3A%2F%2Fg%2F&resource=http%3A%2F%2Fr%2F1%3Fa%3Db',
  );
});

test('expandLink drops the graph pair without a context graph', () => {
  assert.equal(
    expandLink(EXPLORE, { view: 'sparnatural', graph: null, resource: 'http://r/1?a=b' }),
    '/sparnatural/explore?resource=http%3A%2F%2Fr%2F1%3Fa%3Db',
  );
  assert.equal(
    expandLink('/{view}/x?resource={resource}&graph={graph}', { view: 'v', graph: null, resource: 'r' }),
    '/v/x?resource=r',
  );
});

test('linkIconsHtml renders the targets after the first one, escaped', () => {
  const targets = [{ name: 'Explore', template: EXPLORE }, { name: 'B<K>E', template: BKE }];
  const html = linkIconsHtml("http://r/'x", targets, { view: 'sparnatural', graph: 'http://g/' });
  assert.equal((html.match(/<a /g) || []).length, 1);
  assert.match(html, /href="\/sparnatural\/bke\/new\?graph=http%3A%2F%2Fg%2F&amp;resourceIri=http%3A%2F%2Fr%2F%27x"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener"/);
  assert.match(html, /title="B&lt;K&gt;E"/);
  assert.doesNotMatch(html, /'/);
});

test('linkIconsHtml is empty with a single target', () => {
  assert.equal(linkIconsHtml('http://r/1', parseLinks(`Explore=${EXPLORE}`), { view: 'v', graph: null }), '');
});

test('graphOfQuery: graphs with the resource as subject, typed first', () => {
  const q = require('../lib/links.js').graphOfQuery('http://r/1>');
  assert.match(q, /GRAPH \?g \{ <http:\/\/r\/1\\u003E> \?p \?o \}/);
  assert.match(q, /ORDER BY DESC\(\?typed\)/);
  assert.match(q, /LIMIT 1/);
});

test('resolveGraph: first graph of the result, null without one or on error', async () => {
  const { resolveGraph } = require('../lib/links.js');
  const one = async () => ({ results: { bindings: [{ g: { type: 'uri', value: 'http://g/1' } }] } });
  assert.equal(await resolveGraph(one, 'http://r/1'), 'http://g/1');
  assert.equal(await resolveGraph(async () => ({ results: { bindings: [] } }), 'http://r/1'), null);
  assert.equal(await resolveGraph(async () => { throw new Error('x'); }, 'http://r/1'), null);
});

test('parseLinks only accepts local paths and http(s) URLs (no javascript: or protocol-relative)', () => {
  const r = parseLinks('Bad=javascript:alert(1)//{resource}|Also=//evil.example/{resource}|Data=data:text/html,x|Ok=/{view}/explore?resource={resource}|Ext=https://example.org/r?x={resource}');
  assert.deepEqual(r.map((l) => l.name), ['Ok', 'Ext']);
});

test('safeBindingSet HTML-escapes label bindings (TableX renders labels as HTML), leaves other values alone', () => {
  const { safeBindingSet } = require('../lib/links.js');
  const b = safeBindingSet({ x: { type: 'uri', value: 'http://r/1' }, x_label: { type: 'literal', value: '<img src=x onerror=alert(1)> & co' } });
  assert.equal(b.x.value, 'http://r/1');
  assert.equal(b.x_label.value, '&lt;img src=x onerror=alert(1)&gt; &amp; co');
});
