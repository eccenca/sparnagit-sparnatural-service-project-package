/*
 * The Map results plugin (sparnatural-yasgui-plugins) still reads Sparnatural's older query JSON
 * ({ branches: [{ line: { s, p, o }, children }] }); Sparnatural 14 emits a SPARQL-like structure
 * (subject / predicateObjectPairs). This converts the new structure for that plugin.
 * Runs in the browser (window.CmemSparnatural.mapquery) and in node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).mapquery = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SKIP = new Set(['variable', 'subject', 'predicate', 'filters', 'variables', 'solutionModifiers']);

  /** Branches of every subject/predicateObjectPairs pattern found in node (depth-first, in order). */
  function collect(node, implicitSubject) {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap((n) => collect(n, implicitSubject));
    const subject = node.subject && node.subject.value ? node.subject.value : implicitSubject;
    if (Array.isArray(node.predicateObjectPairs) && subject) {
      const own = node.predicateObjectPairs.map((pair) => {
        const o = pair.object && pair.object.variable ? pair.object.variable.value : undefined;
        return {
          line: { s: subject, p: pair.predicate ? pair.predicate.value : undefined, o },
          children: pair.object ? collect(pair.object, o) : [],
        };
      });
      const rest = Object.keys(node).filter((k) => !SKIP.has(k) && k !== 'predicateObjectPairs').flatMap((k) => collect(node[k], undefined));
      return own.concat(rest);
    }
    return Object.keys(node).filter((k) => !SKIP.has(k)).flatMap((k) => collect(node[k], undefined));
  }

  function toV13Query(json) {
    if (json && Array.isArray(json.branches)) return json;
    if (!json) return { branches: [] };
    return { branches: collect(json.where || json, undefined) };
  }

  return { toV13Query };
});
