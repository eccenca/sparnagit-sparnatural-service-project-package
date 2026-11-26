/*
 * Statistics of the context graph: classes with instances, their properties and ranges, labels.
 * Runs in the browser (window.CmemSparnatural.stats) and in node (module.exports).
 */
(function (root, factory) {
  const sparql = typeof module === 'object' && module.exports ? require('./sparql.js') : root.CmemSparnatural.sparql;
  const api = factory(sparql);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).stats = api;
})(typeof self !== 'undefined' ? self : this, function (sparql) {
  'use strict';

  const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
  const RDF_LANGSTRING = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString';
  const NOISE_NAMESPACES = [
    'http://www.w3.org/2002/07/owl#',
    'http://www.w3.org/2000/01/rdf-schema#',
    'http://www.w3.org/ns/shacl#',
    'https://vocab.eccenca.com/shui/',
    'http://rdfs.org/ns/void#',
    'https://vocab.eccenca.com/configuration/',
    'https://vocab.eccenca.com/di/',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  ];
  const LABEL_CHUNK = 200;

  class StatsError extends Error {
    constructor(step, cause) {
      super(cause && cause.message ? cause.message : String(cause));
      this.name = 'StatsError';
      this.step = step;
      this.cause = cause;
    }
  }

  const isNoise = (iri) => NOISE_NAMESPACES.some((ns) => iri.startsWith(ns));

  function localName(iri) {
    const m = String(iri).match(/[^#/:]+$/);
    return m ? decodeURIComponentSafe(m[0]) : String(iri);
  }
  function decodeURIComponentSafe(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function classesQuery(limit = 200) {
    return `SELECT ?c (COUNT(DISTINCT ?s) AS ?n) WHERE { ?s a ?c . FILTER(isIRI(?c)) } GROUP BY ?c ORDER BY DESC(?n) LIMIT ${limit}`;
  }

  function propertiesQuery(limit = 5000) {
    return `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
SELECT ?c ?p ?oc ?dt (COUNT(*) AS ?n) WHERE {
  ?s a ?c ; ?p ?o .
  FILTER(isIRI(?c) && ?p != rdf:type)
  OPTIONAL { ?o a ?oc . FILTER(isIRI(?o) && isIRI(?oc)) }
  BIND(IF(isLiteral(?o), IF(lang(?o) != "", rdf:langString, datatype(?o)), ?unbound) AS ?dt)
} GROUP BY ?c ?p ?oc ?dt LIMIT ${limit}`;
  }

  function labelsQuery(iris, lang) {
    const l = String(lang || 'en').toLowerCase().replace(/[^a-z-]/g, '');
    return `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX sh: <http://www.w3.org/ns/shacl#>
SELECT ?x ?l WHERE {
  VALUES ?x { ${iris.map(sparql.iriRef).join(' ')} }
  ?x rdfs:label|skos:prefLabel|sh:name ?l .
  FILTER(isLiteral(?l) && (lang(?l) = "" || langMatches(lang(?l), "${l}") || langMatches(lang(?l), "en")))
}`;
  }

  /** foaf:depiction of classes: the canonical CMEM way to declare an icon (image URL). */
  function depictionsQuery(iris) {
    return `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?x ?d WHERE {
  VALUES ?x { ${iris.map(sparql.iriRef).join(' ')} }
  ?x foaf:depiction ?d .
}`;
  }

  function parseDepictions(json) {
    const m = new Map();
    for (const r of sparql.rows(json)) if (r.x && r.d && !m.has(r.x.value)) m.set(r.x.value, r.d.value);
    return m;
  }

  function parseClasses(json) {
    const all = sparql.rows(json)
      .filter((r) => r.c && r.c.type === 'uri')
      .map((r) => ({ iri: r.c.value, label: localName(r.c.value), count: Number(r.n && r.n.value) || 0 }))
      .sort((a, b) => b.count - a.count);
    const clean = all.filter((c) => !isNoise(c.iri));
    return clean.length ? clean : all;
  }

  function parseProperties(json) {
    const byKey = new Map();
    for (const r of sparql.rows(json)) {
      if (!r.c || !r.p || r.p.value === RDF_TYPE) continue;
      const key = r.c.value + ' ' + r.p.value;
      let e = byKey.get(key);
      if (!e) {
        e = { domain: r.c.value, path: r.p.value, count: 0, objectClasses: [], datatypes: [] };
        byKey.set(key, e);
      }
      e.count += Number(r.n && r.n.value) || 0;
      if (r.oc && !e.objectClasses.includes(r.oc.value)) e.objectClasses.push(r.oc.value);
      if (r.dt && !e.datatypes.includes(r.dt.value)) e.datatypes.push(r.dt.value);
    }
    return [...byKey.values()].sort((a, b) => b.count - a.count);
  }

  /** Picks one label per IRI: requested language, then untagged, then English. */
  function pickLabels(json, lang) {
    const rank = (tag) => (tag && tag.toLowerCase().split('-')[0] === lang ? 0 : !tag ? 1 : 2);
    const best = new Map();
    for (const r of sparql.rows(json)) {
      if (!r.x || !r.l) continue;
      const score = rank(r.l['xml:lang']);
      const cur = best.get(r.x.value);
      if (!cur || score < cur.score) best.set(r.x.value, { score, value: r.l.value });
    }
    return new Map([...best].map(([k, v]) => [k, v.value]));
  }

  function applyLabels(stats, labelsJson, lang) {
    const labels = labelsJson instanceof Map ? labelsJson : pickLabels(labelsJson, String(lang || 'en').toLowerCase());
    return {
      classes: stats.classes.map((c) => ({ ...c, label: labels.get(c.iri) || c.label })),
      properties: stats.properties,
      classDepictions: stats.classDepictions || new Map(),
      propertyLabels: new Map(stats.properties.map((p) => [p.path, labels.get(p.path) || localName(p.path)])),
    };
  }

  async function collectStats(exec, graph, lang, onProgress) {
    const step = async (name, fn) => {
      if (onProgress) onProgress(name);
      try { return await fn(); } catch (err) { throw new StatsError(name, err); }
    };
    const classes = parseClasses(await step('classes', () => exec(classesQuery(), { graph })));
    const known = new Set(classes.map((c) => c.iri));
    const properties = parseProperties(await step('properties', () => exec(propertiesQuery(), { graph })))
      .filter((p) => known.has(p.domain));
    const iris = [...new Set([...classes.map((c) => c.iri), ...properties.map((p) => p.path)])];
    const labels = new Map();
    const classDepictions = new Map();
    await step('labels', async () => {
      for (let i = 0; i < iris.length; i += LABEL_CHUNK) {
        const part = pickLabels(await exec(labelsQuery(iris.slice(i, i + LABEL_CHUNK), lang), { graph }), String(lang || 'en').toLowerCase());
        for (const [k, v] of part) labels.set(k, v);
      }
      const classIris = classes.map((c) => c.iri);
      for (let i = 0; i < classIris.length; i += LABEL_CHUNK) {
        for (const [k, v] of parseDepictions(await exec(depictionsQuery(classIris.slice(i, i + LABEL_CHUNK)), { graph }))) classDepictions.set(k, v);
      }
    });
    return applyLabels({ classes, properties, classDepictions }, labels, lang);
  }

  return {
    RDF_LANGSTRING, NOISE_NAMESPACES, StatsError, localName, isNoise,
    classesQuery, propertiesQuery, labelsQuery, depictionsQuery, parseDepictions, parseClasses, parseProperties, applyLabels, collectStats,
  };
});
