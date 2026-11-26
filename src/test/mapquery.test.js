'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { toV13Query } = require('../lib/mapquery.js');

const v = (value) => ({ type: 'term', subType: 'variable', value });
const nn = (value) => ({ type: 'term', subType: 'namedNode', value });

// Sparnatural 14 query JSON (as emitted for Country -> Point, recorded in the browser)
const simple = { type: 'query', subType: 'SELECT', variables: [v('Country')], where: {
  type: 'pattern', subType: 'bgpSameSubject', subject: v('Country'),
  predicateObjectPairs: [{ type: 'predicateObjectPair', predicate: nn('https://ns/Country_hasGeometry'),
    object: { type: 'objectCriteria', variable: v('Point'), filters: [] } }],
} };

test('toV13Query: one pattern becomes one branch with line s/p/o', () => {
  assert.deepEqual(toV13Query(simple), { branches: [
    { line: { s: 'Country', p: 'https://ns/Country_hasGeometry', o: 'Point' }, children: [] },
  ] });
});

test('toV13Query: nested patterns below an object become children; sibling patterns become branches', () => {
  const nested = { where: { type: 'group', patterns: [
    { subject: v('Supplier'), predicateObjectPairs: [{ predicate: nn('p/Supplier_country'), object: { variable: v('Country'),
      predicateObjectPairs: [{ predicate: nn('p/Country_lat'), object: { variable: v('Number_1') } }] } }] },
    { subject: v('Supplier'), predicateObjectPairs: [{ predicate: nn('p/Supplier_long'), object: { variable: v('Number_2') } }] },
  ] } };
  const r = toV13Query(nested);
  assert.equal(r.branches.length, 2);
  assert.deepEqual(r.branches[0].line, { s: 'Supplier', p: 'p/Supplier_country', o: 'Country' });
  assert.deepEqual(r.branches[0].children[0].line, { s: 'Country', p: 'p/Country_lat', o: 'Number_1' });
  assert.deepEqual(r.branches[1].line, { s: 'Supplier', p: 'p/Supplier_long', o: 'Number_2' });
});

test('toV13Query: already old-style or empty input is passed through or empty', () => {
  const old = { branches: [{ line: { s: 'a', p: 'b', o: 'c' }, children: [] }] };
  assert.equal(toV13Query(old), old);
  assert.deepEqual(toV13Query(null), { branches: [] });
});
