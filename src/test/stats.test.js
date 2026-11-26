'use strict';
// Fixtures: results of classesQuery/propertiesQuery/labelsQuery for http://ld.company.org/prod-inst/
// on docker.localhost (product data demo package), recorded with scripts/record-fixtures.sh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const stats = require('../lib/stats.js');
const { makeExecutor, SparqlError } = require('../lib/sparql.js');

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name + '.json'), 'utf8'));
const PV = 'http://ld.company.org/prod-vocab/';
const isNoise = (iri) => stats.NOISE_NAMESPACES.some((ns) => iri.startsWith(ns));

test('parseClasses: sorted by count, highest first, no noise classes', () => {
  const classes = stats.parseClasses(fixture('prod-inst-classes'));
  assert.ok(classes.length > 3);
  assert.equal(classes[0].iri, PV + 'Price'); // 1009 instances, Hardware 1000
  assert.ok(classes[0].count > 0);
  for (let i = 1; i < classes.length; i++) assert.ok(classes[i - 1].count >= classes[i].count);
  assert.equal(classes.filter((c) => isNoise(c.iri)).length, 0);
});

test('parseClasses: keeps noise classes when nothing else is there', () => {
  const json = { head: { vars: ['c', 'n'] }, results: { bindings: [
    { c: { type: 'uri', value: 'http://www.w3.org/2002/07/owl#Class' }, n: { type: 'literal', value: '3' } },
  ] } };
  assert.deepEqual(stats.parseClasses(json).map((c) => c.iri), ['http://www.w3.org/2002/07/owl#Class']);
});

test('parseClasses: local name as label until labels are applied', () => {
  const classes = stats.parseClasses(fixture('prod-inst-classes'));
  assert.equal(classes.find((c) => c.iri === PV + 'Hardware').label, 'Hardware');
  assert.equal(stats.localName('urn:x:a:b'), 'b');
  assert.equal(stats.localName('http://x/a#b'), 'b');
});

test('parseProperties: one entry per domain and path, merged ranges, no rdf:type', () => {
  const props = stats.parseProperties(fixture('prod-inst-properties'));
  const keys = props.map((p) => p.domain + ' ' + p.path);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(props.filter((p) => p.path === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type').length, 0);
  const supplier = props.find((p) => p.domain === PV + 'Hardware' && p.path === PV + 'hasSupplier');
  assert.deepEqual(supplier.objectClasses, [PV + 'Supplier']);
  assert.deepEqual(supplier.datatypes, []);
  const width = props.find((p) => p.domain === PV + 'Hardware' && p.path === PV + 'width_mm');
  assert.deepEqual(width.datatypes, ['http://www.w3.org/2001/XMLSchema#integer']);
  assert.ok(width.count > 0);
});

test('applyLabels: labels from the labels query, local name otherwise', () => {
  const s = stats.applyLabels(
    { classes: stats.parseClasses(fixture('prod-inst-classes')), properties: stats.parseProperties(fixture('prod-inst-properties')) },
    fixture('prod-inst-labels'), 'en');
  const hw = s.classes.find((c) => c.iri === PV + 'Hardware');
  assert.ok(hw.label.length > 0);
  assert.ok(s.propertyLabels instanceof Map);
});

test('collectStats: runs the three queries scoped to the graph and reports progress', async () => {
  const calls = [];
  const steps = [];
  const exec = async (query, opts) => {
    calls.push(opts.graph);
    if (/COUNT\(DISTINCT \?s\)/.test(query)) return fixture('prod-inst-classes');
    if (/\?oc/.test(query)) return fixture('prod-inst-properties');
    return fixture('prod-inst-labels');
  };
  const s = await stats.collectStats(exec, 'http://ld.company.org/prod-inst/', 'en', (step) => steps.push(step));
  assert.ok(s.classes.length > 0 && s.properties.length > 0);
  assert.ok(calls.every((g) => g === 'http://ld.company.org/prod-inst/'));
  assert.deepEqual(steps.slice(0, 3), ['classes', 'properties', 'labels']);
});

test('collectStats: a failing query rejects with StatsError naming the step', async () => {
  const exec = async (query) => {
    if (/\?oc/.test(query)) throw new SparqlError(500, 'boom');
    return fixture('prod-inst-classes');
  };
  await assert.rejects(stats.collectStats(exec, null, 'en'), (err) => {
    assert.ok(err instanceof stats.StatsError);
    assert.equal(err.step, 'properties');
    assert.match(err.message, /boom/);
    return true;
  });
});

test('labelsQuery: VALUES over the IRIs, label properties, language filter', () => {
  const q = stats.labelsQuery(['http://x/a', 'http://x/b>'], 'de');
  assert.match(q, /VALUES \?x \{ <http:\/\/x\/a> <http:\/\/x\/b\\u003E> \}/);
  assert.match(q, /rdfs:label\|skos:prefLabel\|sh:name/);
  assert.match(q, /"de"/);
});

test('makeExecutor: POSTs the form with default-graph-uri, SparqlError on non-2xx', async () => {
  let seen;
  const ok = makeExecutor(async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ results: { bindings: [] } }) }; });
  await ok('SELECT * WHERE {?s ?p ?o}', { graph: 'http://g/' });
  assert.equal(seen.url, '/dataplatform/proxy/default/sparql');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.credentials, 'same-origin');
  assert.match(String(seen.init.body), /default-graph-uri=http%3A%2F%2Fg%2F/);
  await ok('SELECT * WHERE {?s ?p ?o}', { graph: null });
  assert.doesNotMatch(String(seen.init.body), /default-graph-uri/);

  const bad = makeExecutor(async () => ({ ok: false, status: 500, text: async () => 'server down' }));
  await assert.rejects(bad('SELECT 1 {}', { graph: null }), (err) => err instanceof SparqlError && err.status === 500 && /server down/.test(err.message));
});

test('depictionsQuery and collectStats: foaf:depiction of the classes', async () => {
  assert.match(stats.depictionsQuery(['http://x/A']), /VALUES \?x \{ <http:\/\/x\/A> \}[\s\S]*foaf:depiction/);
  const exec = async (query) => {
    if (/foaf:depiction/.test(query)) return { results: { bindings: [{ x: { type: 'uri', value: PV + 'Hardware' }, d: { type: 'uri', value: 'https://img/hw.svg' } }] } };
    if (/COUNT\(DISTINCT \?s\)/.test(query)) return fixture('prod-inst-classes');
    if (/\?oc/.test(query)) return fixture('prod-inst-properties');
    return fixture('prod-inst-labels');
  };
  const s = await stats.collectStats(exec, null, 'en');
  assert.equal(s.classDepictions.get(PV + 'Hardware'), 'https://img/hw.svg');
});

test('describeError: missing knowledge graph login (401) gets a sign-in hint', () => {
  const { describeError, SparqlError } = require('../lib/sparql.js');
  const login = describeError(new stats.StatsError('classes', new SparqlError(401, 'HTTP 401: Full authentication is required')));
  assert.equal(login.needsLogin, true);
  assert.match(login.text, /sign in/i);
  const other = describeError(new stats.StatsError('properties', new SparqlError(500, 'HTTP 500: boom')));
  assert.equal(other.needsLogin, false);
  assert.equal(other.text, 'Could not read the graph (properties): HTTP 500: boom');
});

test('neutralizeLiterals: markup characters in literal values become look-alikes, IRIs stay (Sparnatural widgets render labels as HTML)', () => {
  const { neutralizeLiterals } = require('../lib/sparql.js');
  const json = { head: { vars: ['uri', 'label'] }, results: { bindings: [
    { uri: { type: 'uri', value: 'http://r/1?a=1&b=2' }, label: { type: 'literal', value: '<img src=x onerror=alert(1)> & "q"' } },
  ] } };
  const out = neutralizeLiterals(json);
  assert.equal(out.results.bindings[0].uri.value, 'http://r/1?a=1&b=2');
  assert.equal(out.results.bindings[0].label.value, '＜img src=x onerror=alert(1)＞ ＆ ＂q＂');
  assert.equal(json.results.bindings[0].label.value, '<img src=x onerror=alert(1)> & "q"'); // input untouched
  assert.equal(neutralizeLiterals({ boolean: true }).boolean, true); // ASK results pass through
});
