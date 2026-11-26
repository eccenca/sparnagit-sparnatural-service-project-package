'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const config = require('../lib/config.js');
const stats = require('../lib/stats.js');
const shapes = require('../lib/shapes.js');

const XSD = 'http://www.w3.org/2001/XMLSchema#';
const A = 'http://x/A';
const B = 'http://x/B';
const P = 'http://x/p';
const Q = 'http://x/q';
const LABEL = 'http://www.w3.org/2000/01/rdf-schema#label';

// A(10) -p-> B(5), A -q-> xsd:date
const sample = () => ({
  classes: [{ iri: A, label: 'Thing A', count: 10 }, { iri: B, label: 'Thing B', count: 5 }],
  properties: [
    { domain: A, path: P, count: 10, objectClasses: [B], datatypes: [] },
    { domain: A, path: Q, count: 7, objectClasses: [], datatypes: [XSD + 'date'] },
  ],
  propertyLabels: new Map([[P, 'has p'], [Q, 'has q']]),
});

test('statistics mode: entities by count, properties with ranges and widgets', () => {
  const m = config.buildModel(sample(), [], { shapes: 'auto' });
  assert.equal(m.mode, 'statistics');
  assert.deepEqual(m.entities.map((e) => e.class), [A, B]);
  const a = m.entities[0];
  assert.equal(a.label, 'Thing A');
  const p = a.properties.find((x) => x.path === P);
  assert.deepEqual(p.range, { kind: 'entity', classes: [B] });
  assert.equal(p.widget, 'list');
  assert.equal(p.label, 'has p');
  const q = a.properties.find((x) => x.path === Q);
  assert.deepEqual(q.range, { kind: 'literal', datatype: XSD + 'date' });
  assert.equal(q.widget, 'date');
});

test('shapes mode: only shaped classes; property dropped when its range is not offered', () => {
  const shapeA = { id: 'http://s/A', targetClass: A, name: 'Shaped A', icon: 'fa-solid fa-star', order: 1,
    properties: [
      { path: P, inverse: false, name: 'p from shape', order: 2, class: B, datatype: null },
      { path: Q, inverse: false, name: 'q from shape', order: 1, class: null, datatype: XSD + 'date' },
      { path: 'http://x/unused', inverse: false, name: 'unused', order: 3, class: null, datatype: XSD + 'string' },
    ] };
  const m = config.buildModel(sample(), [shapeA], { shapes: 'auto' });
  assert.equal(m.mode, 'shapes');
  assert.deepEqual(m.entities.map((e) => e.class), [A]);
  const a = m.entities[0];
  assert.equal(a.label, 'Shaped A');
  assert.equal(a.icon, 'fa-solid fa-star');
  assert.deepEqual(a.properties.filter((x) => !x.labelRole).map((x) => [x.path, x.label, x.order]), [[Q, 'q from shape', 1]]);
});

test('shapes=off ignores shapes', () => {
  const shapeA = { id: 'http://s/A', targetClass: A, name: 'Shaped A', icon: null, order: 1, properties: [] };
  assert.equal(config.buildModel(sample(), [shapeA], { shapes: 'off' }).mode, 'statistics');
});

test('shapes for classes without instances do not switch to shapes mode', () => {
  const shapeX = { id: 'http://s/X', targetClass: 'http://x/X', name: 'X', icon: null, order: 1, properties: [] };
  assert.equal(config.buildModel(sample(), [shapeX], { shapes: 'auto' }).mode, 'statistics');
});

test('inverse shape property is kept when the data has it, Turtle uses sh:inversePath', () => {
  // data: A -p-> B ; shape on B: inverse p, class A
  const shapeA = { id: 'http://s/A', targetClass: A, name: 'A', icon: null, order: 1, properties: [] };
  const shapeB = { id: 'http://s/B', targetClass: B, name: 'B', icon: null, order: 2,
    properties: [{ path: P, inverse: true, name: 'is p of', order: 1, class: A, datatype: null }] };
  const m = config.buildModel(sample(), [shapeA, shapeB], { shapes: 'auto' });
  const b = m.entities.find((e) => e.class === B);
  const inv = b.properties.find((x) => x.path === P);
  assert.equal(inv.inverse, true);
  assert.deepEqual(inv.range, { kind: 'entity', classes: [A] });
  assert.match(config.toTurtle(m, 'en'), /sh:path \[ sh:inversePath <http:\/\/x\/p> \]/);
});

test('sh:class naming a class without instances falls back to the observed classes', () => {
  const shapeA = { id: 'http://s/A', targetClass: A, name: 'A', icon: null, order: 1,
    properties: [{ path: P, inverse: false, name: 'p', order: 1, class: 'http://x/SuperOfB', datatype: null }] };
  const shapeB = { id: 'http://s/B', targetClass: B, name: 'B', icon: null, order: 2, properties: [] };
  const m = config.buildModel(sample(), [shapeA, shapeB], { shapes: 'auto' });
  const p = m.entities.find((e) => e.class === A).properties.find((x) => x.path === P);
  assert.deepEqual(p.range, { kind: 'entity', classes: [B] });
});

test('empty statistics give the empty mode', () => {
  const m = config.buildModel({ classes: [], properties: [], propertyLabels: new Map() }, [], { shapes: 'auto' });
  assert.equal(m.mode, 'empty');
  assert.deepEqual(m.entities, []);
});

test('widgetFor: list up to 50 instances, then autocomplete; literals by datatype', () => {
  assert.equal(config.widgetFor({ kind: 'entity', classes: [B] }, 50), 'list');
  assert.equal(config.widgetFor({ kind: 'entity', classes: [B] }, 51), 'autocomplete');
  assert.equal(config.widgetFor({ kind: 'literal', datatype: XSD + 'dateTime' }, 0), 'date');
  assert.equal(config.widgetFor({ kind: 'literal', datatype: XSD + 'decimal' }, 0), 'number');
  assert.equal(config.widgetFor({ kind: 'literal', datatype: XSD + 'boolean' }, 0), 'boolean');
  assert.equal(config.widgetFor({ kind: 'literal', datatype: XSD + 'string' }, 0), 'search');
});

test('label property gets the label role, also when the shape does not list it', () => {
  const s = sample();
  s.properties.push({ domain: A, path: LABEL, count: 10, objectClasses: [], datatypes: [XSD + 'string'] });
  const shapeA = { id: 'http://s/A', targetClass: A, name: 'A', icon: null, order: 1, properties: [] };
  for (const m of [config.buildModel(s, [], { shapes: 'auto' }), config.buildModel(s, [shapeA], { shapes: 'auto' })]) {
    const a = m.entities.find((e) => e.class === A);
    assert.equal(a.properties.filter((x) => x.labelRole).length, 1);
  }
  assert.match(config.toTurtle(config.buildModel(s, [], { shapes: 'auto' }), 'en'), /dash:propertyRole dash:LabelRole/);
});

test('toTurtle escapes labels and IRIs', () => {
  const m = { mode: 'statistics', entities: [{ id: 'x', class: 'http://x/a>b', label: 'Say "hi" \\ <x> äö', icon: null, order: 1, count: 1, properties: [] }] };
  const ttl = config.toTurtle(m, 'en');
  assert.ok(ttl.includes('"Say ＂hi＂ \\\\ ＜x＞ äö"@en')); // markup characters replaced, backslash escaped
  assert.ok(ttl.includes('<http://x/a\\u003Eb>'));
  assertWellFormed(ttl);
});

test('toTurtle: node shape IRIs have SPARQL-variable-safe, unique local names', () => {
  const m = config.buildModel({
    classes: [{ iri: 'http://x/1-a', label: '1 a', count: 2 }, { iri: 'http://y/1-a', label: '1 a', count: 1 }],
    properties: [], propertyLabels: new Map(),
  }, [], { shapes: 'auto' });
  const ids = [...config.toTurtle(m, 'en').matchAll(/<https:\/\/ns\.eccenca\.com\/sparnatural\/config\/([^>]+)> a sh:NodeShape/g)].map((x) => x[1]);
  assert.equal(ids.length, 2);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) assert.match(id, /^[A-Za-z][A-Za-z0-9_]*$/);
});

test('prod-inst fixtures: shapes mode with the catalog shapes, Turtle well-formed', () => {
  const fx = (n) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
  const s = stats.applyLabels({ classes: stats.parseClasses(fx('prod-inst-classes')), properties: stats.parseProperties(fx('prod-inst-properties')) }, fx('prod-inst-labels'), 'en');
  const m = config.buildModel(s, shapes.parseShapes(fx('catalog-shapes-prod'), 'en'), { shapes: 'auto' });
  assert.equal(m.mode, 'shapes');
  const hw = m.entities.find((e) => e.class === 'http://ld.company.org/prod-vocab/Hardware');
  assert.ok(hw.properties.some((p) => p.path === 'http://ld.company.org/prod-vocab/hasSupplier'));
  assert.ok(hw.properties.some((p) => p.path === 'http://ld.company.org/prod-vocab/eligibleFor' && p.inverse));
  assertWellFormed(config.toTurtle(m, 'en'));
});

/** Minimal Turtle sanity check: balanced IRIs/strings, statements end with " ." */
function assertWellFormed(ttl) {
  const body = ttl.replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/<[^<>\s]*>/g, '<>');
  assert.equal((body.match(/</g) || []).length, (body.match(/>/g) || []).length, 'unbalanced <>');
  const stmts = body.split(/\n\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('@prefix'));
  for (const s of stmts) assert.ok(s.endsWith(' .'), 'statement must end with " .": ' + s.slice(-60));
}

test('foaf:depiction (canonical CMEM icon) wins over volipi:iconName; shape before class depiction', () => {
  const s = sample();
  s.classDepictions = new Map([[A, 'https://img/class-a.svg'], [B, 'https://img/class-b.svg']]);
  const shapeA = { id: 'http://s/A', targetClass: A, name: 'A', icon: 'fa-solid fa-star', depiction: 'https://img/a.svg?x=1', order: 1, properties: [] };
  const shapeB = { id: 'http://s/B', targetClass: B, name: 'B', icon: 'fa-solid fa-star', depiction: null, order: 2, properties: [] };
  const m = config.buildModel(s, [shapeA, shapeB], { shapes: 'auto' });
  assert.equal(m.entities.find((e) => e.class === A).depiction, 'https://img/a.svg?x=1');
  assert.equal(m.entities.find((e) => e.class === B).depiction, 'https://img/class-b.svg');
  const ttl = config.toTurtle(m, 'en');
  assert.match(ttl, /volipi:iconName "fa-cmem-dep fa-cmem-dep-1"/);
  assert.match(ttl, /volipi:iconName "fa-cmem-dep fa-cmem-dep-2"/);
  const css = config.depictionCss(m);
  assert.match(css, /\.fa-cmem-dep-1::before \{ content: ""; background-image: url\("https:\/\/img\/a\.svg\?x=1"\)/);
  assert.match(css, /\.fa-cmem-dep-2::before .*class-b\.svg/);
});

test('volipi:iconName is the fallback without any depiction; statistics mode uses class depictions', () => {
  const shapeB = { id: 'http://s/B', targetClass: B, name: 'B', icon: 'fa-solid fa-star', depiction: null, order: 1, properties: [] };
  assert.match(config.toTurtle(config.buildModel(sample(), [shapeB], { shapes: 'auto' }), 'en'), /volipi:iconName "fa-solid fa-star"/);
  const s = sample();
  s.classDepictions = new Map([[B, 'https://img/class-b.svg']]);
  const m = config.buildModel(s, [], { shapes: 'auto' });
  assert.equal(m.entities.find((e) => e.class === B).depiction, 'https://img/class-b.svg');
  assert.equal(m.entities.find((e) => e.class === A).depiction, null);
  assert.match(config.toTurtle(m, 'en'), /volipi:iconName "fa-solid fa-cube"/);
});

test('depictionCss only accepts http(s) and relative URLs, escaped', () => {
  const m = { mode: 'shapes', entities: [
    { class: 'http://x/1', label: '1', icon: null, depiction: 'javascript:alert(1)', order: 1, count: 1, properties: [] },
    { class: 'http://x/2', label: '2', icon: null, depiction: 'https://i/a")}body{x:y', order: 2, count: 1, properties: [] },
  ] };
  const css = config.depictionCss(m);
  assert.doesNotMatch(css, /javascript/);
  assert.match(css, /url\("https:\/\/i\/a%22\)%7Dbody%7Bx:y"\)/);
  assert.doesNotMatch(config.toTurtle(m, 'en'), /fa-cmem-dep-0"/);
});

test('geo:wktLiteral properties get the map widget (core:MapProperty)', () => {
  const WKT = 'http://www.opengis.net/ont/geosparql#wktLiteral';
  assert.equal(config.widgetFor({ kind: 'literal', datatype: WKT }, 0), 'map');
  const s = sample();
  s.properties.push({ domain: A, path: 'http://www.opengis.net/ont/geosparql#asWKT', count: 3, objectClasses: [], datatypes: [WKT] });
  const ttl = config.toTurtle(config.buildModel(s, [], { shapes: 'auto' }), 'en');
  assert.match(ttl, /sh:datatype <http:\/\/www\.opengis\.net\/ont\/geosparql#wktLiteral> ;\n  dash:searchWidget core:MapProperty/);
});

test('property shape IRIs carry the local name of the path (Map plugin finds lat/long columns by name)', () => {
  const s = sample();
  s.properties.push({ domain: A, path: 'http://www.w3.org/2003/01/geo/wgs84_pos#lat', count: 3, objectClasses: [], datatypes: [XSD + 'decimal'] });
  const ttl = config.toTurtle(config.buildModel(s, [], { shapes: 'auto' }), 'en');
  assert.match(ttl, /<https:\/\/ns\.eccenca\.com\/sparnatural\/config\/A_lat> sh:path <http:\/\/www\.w3\.org\/2003\/01\/geo\/wgs84_pos#lat>/);
  const ids = [...ttl.matchAll(/<https:\/\/ns\.eccenca\.com\/sparnatural\/config\/([^>]+)> sh:path/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^[A-Za-z][A-Za-z0-9_]*$/);
});

test('labels cannot carry HTML into Sparnatural (it renders labels as HTML): markup characters are replaced', () => {
  const s = sample();
  s.classes[0].label = '<img src=x onerror=alert(1)> "A" & \'B\'';
  s.propertyLabels.set(P, '<b>has p</b>');
  const ttl = config.toTurtle(config.buildModel(s, [], { shapes: 'auto' }), 'en');
  assert.doesNotMatch(ttl, /<img|<b>|onerror=alert\(1\)>/);
  assert.match(ttl, /＜img src=x onerror=alert\(1\)＞ ＂A＂ ＆ ’B’/);
  assert.match(ttl, /＜b＞has p＜\/b＞/);
});

test('volipi:iconName must look like CSS class names, otherwise the default icon is used', () => {
  const shapeA = { id: 'http://s/A', targetClass: A, name: 'A', icon: 'fa-solid" onmouseover="x', depiction: null, order: 1, properties: [] };
  const shapeB = { id: 'http://s/B', targetClass: B, name: 'B', icon: 'fa-solid fa-star', depiction: null, order: 2, properties: [] };
  const ttl = config.toTurtle(config.buildModel(sample(), [shapeA, shapeB], { shapes: 'auto' }), 'en');
  assert.doesNotMatch(ttl, /onmouseover/);
  assert.match(ttl, /volipi:iconName "fa-solid fa-cube"/);
  assert.match(ttl, /volipi:iconName "fa-solid fa-star"/);
});
