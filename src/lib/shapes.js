/*
 * Node and property shapes of the central CMEM shapes catalog for the classes of the context graph.
 * Runs in the browser (window.CmemSparnatural.shapes) and in node (module.exports).
 */
(function (root, factory) {
  const sparql = typeof module === 'object' && module.exports ? require('./sparql.js') : root.CmemSparnatural.sparql;
  const api = factory(sparql);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).shapes = api;
})(typeof self !== 'undefined' ? self : this, function (sparql) {
  'use strict';

  const CATALOG = 'https://vocab.eccenca.com/shacl/';
  const CHUNK = 100;

  function shapesQuery(classIris) {
    return `PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX shui: <https://vocab.eccenca.com/shui/>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX volipi: <http://data.sparna.fr/ontologies/volipi#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?ns ?tc ?nsName ?nsLabel ?icon ?dep ?nsOrder ?ps ?path ?inv ?psName ?psOrder ?cls ?dt WHERE {
  VALUES ?tc { ${classIris.map(sparql.iriRef).join(' ')} }
  ?ns a sh:NodeShape ; sh:targetClass ?tc .
  OPTIONAL { ?ns sh:name ?nsName }
  OPTIONAL { ?ns rdfs:label ?nsLabel }
  OPTIONAL { ?ns volipi:iconName ?icon }
  OPTIONAL { ?ns foaf:depiction ?dep }
  OPTIONAL { ?ns sh:order ?nsOrder }
  OPTIONAL {
    ?ns sh:property ?ps .
    ?ps sh:path ?path .
    FILTER(isIRI(?path))
    OPTIONAL { ?ps shui:inversePath ?inv }
    OPTIONAL { ?ps sh:name ?psName }
    OPTIONAL { ?ps sh:order ?psOrder }
    OPTIONAL { ?ps sh:class ?cls }
    OPTIONAL { ?ps sh:datatype ?dt }
  }
}`;
  }

  /** Keeps the literal that best matches lang (lang > untagged > en > any). */
  function better(cur, lit, lang) {
    if (!lit) return cur;
    const tag = (lit['xml:lang'] || '').toLowerCase().split('-')[0];
    const score = tag === lang ? 0 : tag === '' ? 1 : tag === 'en' ? 2 : 3;
    return !cur || score < cur.score ? { score, value: lit.value } : cur;
  }
  const num = (lit) => (lit && Number.isFinite(Number(lit.value)) ? Number(lit.value) : null);

  function parseShapes(json, lang = 'en') {
    const l = String(lang).toLowerCase();
    const byShape = new Map();
    for (const r of sparql.rows(json)) {
      if (!r.ns || !r.tc) continue;
      const id = r.ns.value + ' ' + r.tc.value;
      let s = byShape.get(id);
      if (!s) {
        s = { id: r.ns.value, targetClass: r.tc.value, _name: null, _label: null, icon: null, depiction: null, order: null, _props: new Map() };
        byShape.set(id, s);
      }
      s._name = better(s._name, r.nsName, l);
      s._label = better(s._label, r.nsLabel, l);
      if (r.icon) s.icon = r.icon.value;
      if (r.dep && !s.depiction) s.depiction = r.dep.value;
      if (s.order === null) s.order = num(r.nsOrder);
      if (r.ps && r.path) {
        const inverse = !!(r.inv && r.inv.value === 'true');
        const key = r.ps.value;
        let p = s._props.get(key);
        if (!p) {
          p = { path: r.path.value, inverse, _name: null, order: null, class: null, datatype: null };
          s._props.set(key, p);
        }
        p._name = better(p._name, r.psName, l);
        if (p.order === null) p.order = num(r.psOrder);
        if (r.cls && !p.class) p.class = r.cls.value;
        if (r.dt && !p.datatype) p.datatype = r.dt.value;
      }
    }
    return [...byShape.values()].map((s) => {
      const seen = new Set();
      const properties = [];
      for (const p of s._props.values()) {
        const key = p.path + (p.inverse ? '^' : '');
        if (seen.has(key)) continue;
        seen.add(key);
        properties.push({ path: p.path, inverse: p.inverse, name: p._name ? p._name.value : null, order: p.order, class: p.class, datatype: p.datatype });
      }
      const name = s._name || s._label;
      return { id: s.id, targetClass: s.targetClass, name: name ? name.value : null, icon: s.icon, depiction: s.depiction, order: s.order, properties };
    });
  }

  async function loadShapes(exec, classIris, lang = 'en') {
    if (!classIris.length) return [];
    const all = [];
    try {
      for (let i = 0; i < classIris.length; i += CHUNK) {
        all.push(...parseShapes(await exec(shapesQuery(classIris.slice(i, i + CHUNK)), { graph: CATALOG }), lang));
      }
    } catch (err) {
      if (err && (err.status === 401 || err.status === 403)) return [];
      throw err;
    }
    return all;
  }

  /** Like loadShapes, but any other error falls back to no shapes (statistics) with a note for the page. */
  async function loadShapesOrNote(exec, classIris, lang = 'en') {
    try {
      return { shapes: await loadShapes(exec, classIris, lang), note: null };
    } catch (err) {
      return { shapes: [], note: 'The shapes could not be read (' + (err && err.message ? err.message : err) + '); showing all data.' };
    }
  }

  return { CATALOG, shapesQuery, parseShapes, loadShapes, loadShapesOrNote };
});
