/*
 * Graph picker as a tree of owl:imports: roots are graphs no other listed graph imports.
 * Runs in the browser (window.CmemSparnatural.graphs) and in node (module.exports).
 */
(function (root, factory) {
  const sparql = typeof module === 'object' && module.exports ? require('./sparql.js') : root.CmemSparnatural.sparql;
  const api = factory(sparql);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).graphs = api;
})(typeof self !== 'undefined' ? self : this, function (sparql) {
  'use strict';

  const NB = ' '; // <option> text collapses normal spaces
  const MAX_DEPTH = 8;

  function importsQuery() {
    return `PREFIX owl: <http://www.w3.org/2002/07/owl#>
SELECT DISTINCT ?g ?i WHERE { GRAPH ?g { ?g owl:imports ?i } FILTER(isIRI(?i)) }`;
  }

  function parseImports(json) {
    const m = new Map();
    for (const r of sparql.rows(json)) {
      if (!r.g || !r.i || r.g.value === r.i.value) continue;
      if (!m.has(r.g.value)) m.set(r.g.value, []);
      if (!m.get(r.g.value).includes(r.i.value)) m.get(r.g.value).push(r.i.value);
    }
    return m;
  }

  /**
   * graphs: [{ iri, title, system }], imports: Map(iri -> [iri]).
   * Returns [{ iri, label, disabled? }] in display order, label with ├─ └─ │ prefixes.
   */
  function graphTree(graphs, imports) {
    const byIri = new Map(graphs.map((x) => [x.iri, x]));
    const byTitle = (a, b) => a.title.localeCompare(b.title) || a.iri.localeCompare(b.iri);
    const childrenOf = (iri) => (imports.get(iri) || []).filter((c) => byIri.has(c) && c !== iri).map((c) => byIri.get(c)).sort(byTitle);
    const imported = new Set();
    for (const x of graphs) for (const c of childrenOf(x.iri)) imported.add(c.iri);

    const rows = [];
    const seen = new Set();
    const visit = (node, indent, branch, path, parent) => {
      seen.add(node.iri);
      const index = rows.length;
      rows.push({ iri: node.iri, title: node.title, prefix: indent + branch, label: indent + branch + node.title, depth: path.length - 1, parent, system: !!node.system });
      if (path.length >= MAX_DEPTH) return;
      const kids = childrenOf(node.iri).filter((k) => !path.includes(k.iri)); // cut cycles
      const childIndent = indent + (branch === '' ? '' : branch.startsWith('└') ? NB + NB + NB : '│' + NB + NB);
      kids.forEach((k, i) => visit(k, childIndent, (i === kids.length - 1 ? '└─' : '├─') + NB, path.concat(k.iri), index));
    };
    const section = (list) => {
      list.filter((x) => !imported.has(x.iri)).sort(byTitle).forEach((r) => visit(r, '', '', [r.iri], -1));
    };
    const user = graphs.filter((x) => !x.system);
    const system = graphs.filter((x) => x.system);
    section(user);
    // graphs only reachable through a cycle become roots, too
    user.filter((x) => !seen.has(x.iri)).sort(byTitle).forEach((r) => visit(r, '', '', [r.iri], -1));
    const sys = system.filter((x) => !seen.has(x.iri));
    if (sys.length) {
      rows.push({ iri: '', title: '', prefix: '', label: '── System graphs ──', disabled: true, separator: true, depth: 0, parent: -1 });
      section(sys);
      sys.filter((x) => !seen.has(x.iri)).sort(byTitle).forEach((r) => visit(r, '', '', [r.iri], -1));
    }
    return rows;
  }

  /** Rows whose title or IRI contains the query, plus their ancestors (for context), in tree order. */
  function filterTree(rows, query) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return rows;
    const keep = new Set();
    rows.forEach((r, i) => {
      if (r.separator) return;
      if (r.title.toLowerCase().includes(q) || r.iri.toLowerCase().includes(q)) {
        for (let j = i; j !== -1 && !keep.has(j); j = rows[j].parent) keep.add(j);
      }
    });
    const sep = rows.findIndex((r) => r.separator);
    if (sep !== -1 && [...keep].some((i) => i > sep)) keep.add(sep);
    return rows.filter((r, i) => keep.has(i));
  }

  return { importsQuery, parseImports, graphTree, filterTree };
});
