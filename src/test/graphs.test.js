'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const graphs = require('../lib/graphs.js');

const NB = ' ';
const g = (iri, title, system = false) => ({ iri, title, system });
const lines = (rows) => rows.map((r) => r.label.replace(new RegExp(NB, 'g'), ' '));

test('importsQuery reads owl:imports between graphs', () => {
  assert.match(graphs.importsQuery(), /GRAPH \?g \{ \?g owl:imports \?i \}/);
});

test('parseImports: map of graph to imported graphs', () => {
  const m = graphs.parseImports({ results: { bindings: [
    { g: { value: 'A' }, i: { value: 'B' } }, { g: { value: 'A' }, i: { value: 'C' } }, { g: { value: 'B' }, i: { value: 'C' } },
  ] } });
  assert.deepEqual(m.get('A'), ['B', 'C']);
  assert.deepEqual(m.get('B'), ['C']);
});

test('graphTree: roots are graphs nobody imports, children sorted by title, tree prefixes', () => {
  const list = [g('A', 'Alpha'), g('B', 'Beta'), g('C', 'Gamma'), g('D', 'Delta')];
  const rows = graphs.graphTree(list, new Map([['A', ['C', 'B']], ['B', ['C']]]));
  assert.deepEqual(lines(rows), [
    'Alpha',
    '├─ Beta',
    '│  └─ Gamma',
    '└─ Gamma',
    'Delta',
  ]);
  assert.deepEqual(rows.map((r) => r.iri), ['A', 'B', 'C', 'C', 'D']);
});

test('graphTree: imports of graphs not in the list are left out; cycles are cut', () => {
  const list = [g('A', 'Alpha'), g('B', 'Beta')];
  const rows = graphs.graphTree(list, new Map([['A', ['B', 'X']], ['B', ['A']]]));
  // A and B import each other: no graph is a root by the rule, so both stay reachable as roots
  assert.ok(rows.length >= 2);
  assert.ok(rows.every((r) => r.iri !== 'X'));
  assert.ok(rows.length < 10);
});

test('graphTree: system graphs after user graphs, behind a disabled separator', () => {
  const rows = graphs.graphTree([g('S', 'Shapes', true), g('U', 'Data')], new Map());
  assert.deepEqual(rows.map((r) => [r.iri, r.disabled || false]), [['U', false], ['', true], ['S', false]]);
  assert.match(rows[1].label, /System graphs/);
});

test('graphTree rows carry title, tree prefix, depth and parent index separately', () => {
  const rows = graphs.graphTree([g('A', 'Alpha'), g('B', 'Beta'), g('C', 'Gamma')], new Map([['A', ['B']], ['B', ['C']]]));
  assert.deepEqual(rows.map((r) => [r.title, r.depth, r.parent]), [['Alpha', 0, -1], ['Beta', 1, 0], ['Gamma', 2, 1]]);
  assert.equal(rows[2].prefix.replace(new RegExp(NB, 'g'), ' '), '   └─ ');
  assert.equal(rows[2].label, rows[2].prefix + rows[2].title);
});

test('filterTree keeps matches (title or IRI, case-insensitive) and their ancestors, in order', () => {
  const rows = graphs.graphTree(
    [g('http://x/a', 'Alpha'), g('http://x/b', 'Beta'), g('http://x/c', 'Gamma'), g('http://x/d', 'Delta'), g('http://x/s', 'Shapes', true)],
    new Map([['http://x/a', ['http://x/b']], ['http://x/b', ['http://x/c']]]));
  assert.deepEqual(graphs.filterTree(rows, 'gAm').map((r) => r.title), ['Alpha', 'Beta', 'Gamma']);
  assert.deepEqual(graphs.filterTree(rows, 'x/d').map((r) => r.title), ['Delta']);
  assert.deepEqual(graphs.filterTree(rows, 'shap').map((r) => r.title || r.label), ['── System graphs ──', 'Shapes']);
  assert.equal(graphs.filterTree(rows, '').length, rows.length);
  assert.deepEqual(graphs.filterTree(rows, 'nothing'), []);
});
