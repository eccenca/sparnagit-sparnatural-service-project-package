'use strict';
// Fixture: shapesQuery() for the prod-inst classes against the CMEM shapes catalog on docker.localhost,
// recorded with scripts/record-fixtures.sh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const shapes = require('../lib/shapes.js');
const { SparqlError } = require('../lib/sparql.js');

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8'));
const PV = 'http://ld.company.org/prod-vocab/';

test('parseShapes: one Shape per node shape, with target class and name', () => {
  const list = shapes.parseShapes(fixture('catalog-shapes-prod'), 'en');
  const hw = list.find((s) => s.targetClass === PV + 'Hardware');
  assert.ok(hw);
  assert.equal(hw.name, 'Hardware');
  assert.equal(new Set(list.map((s) => s.id)).size, list.length);
  assert.equal(list.filter((s) => s.targetClass === PV + 'Price').length, 2); // Hardware Price + Service Price
});

test('parseShapes: properties carry name, order, range and inverse flag, de-duplicated', () => {
  const hw = shapes.parseShapes(fixture('catalog-shapes-prod'), 'en').find((s) => s.targetClass === PV + 'Hardware');
  const supplier = hw.properties.find((p) => p.path === PV + 'hasSupplier');
  assert.deepEqual(supplier, { path: PV + 'hasSupplier', inverse: false, name: 'supplier', order: 8, class: PV + 'Supplier', datatype: null });
  const eligible = hw.properties.find((p) => p.path === PV + 'eligibleFor');
  assert.equal(eligible.inverse, true);
  assert.equal(eligible.class, PV + 'Service');
  const keys = hw.properties.map((p) => p.path + (p.inverse ? '^' : ''));
  assert.equal(new Set(keys).size, keys.length);
});

test('shapesQuery: VALUES over the classes, node and property shape details', () => {
  const q = shapes.shapesQuery(['http://x/A']);
  assert.match(q, /VALUES \?tc \{ <http:\/\/x\/A> \}/);
  assert.match(q, /sh:targetClass \?tc/);
  assert.match(q, /shui:inversePath/);
  assert.match(q, /volipi:iconName/);
});

test('loadShapes: queries the central catalog', async () => {
  let seen;
  const exec = async (q, opts) => { seen = opts.graph; return fixture('catalog-shapes-prod'); };
  const list = await shapes.loadShapes(exec, [PV + 'Hardware'], 'en');
  assert.equal(seen, 'https://vocab.eccenca.com/shacl/');
  assert.ok(list.length > 0);
});

test('loadShapes: unreadable catalog (401/403) means no shapes', async () => {
  for (const status of [401, 403]) {
    const exec = async () => { throw new SparqlError(status, 'forbidden'); };
    assert.deepEqual(await shapes.loadShapes(exec, ['http://x/C'], 'en'), []);
  }
});

test('loadShapes: other errors are passed on', async () => {
  const exec = async () => { throw new SparqlError(500, 'boom'); };
  await assert.rejects(shapes.loadShapes(exec, ['http://x/C'], 'en'), /boom/);
});

test('loadShapes: no classes, no query', async () => {
  let called = false;
  assert.deepEqual(await shapes.loadShapes(async () => { called = true; }, [], 'en'), []);
  assert.equal(called, false);
});

test('parseShapes: foaf:depiction of the node shape (CMEM icon convention)', () => {
  const hw = shapes.parseShapes(fixture('catalog-shapes-prod'), 'en').find((s) => s.targetClass === PV + 'Hardware');
  assert.match(hw.depiction, /^https:\/\/api\.iconify\.design\/ion\/hardware-chip-outline\.svg/);
  assert.match(shapes.shapesQuery(['http://x/A']), /foaf:depiction/);
});

test('loadShapesOrNote: other catalog errors fall back to no shapes with a note', async () => {
  const exec = async () => { throw new SparqlError(500, 'boom'); };
  const r = await shapes.loadShapesOrNote(exec, ['http://x/C'], 'en');
  assert.deepEqual(r.shapes, []);
  assert.match(r.note, /shapes could not be read/i);
  const ok = await shapes.loadShapesOrNote(async () => fixture('catalog-shapes-prod'), [PV + 'Hardware'], 'en');
  assert.ok(ok.shapes.length > 0);
  assert.equal(ok.note, null);
});
