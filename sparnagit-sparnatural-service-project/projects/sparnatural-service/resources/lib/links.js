/*
 * Link targets per result resource: URL templates with {view}, {graph} and {resource}.
 * Runs in the browser (window.CmemSparnatural.links) and in node (module.exports).
 */
(function (root, factory) {
  const sparql = typeof module === 'object' && module.exports ? require('./sparql.js') : root.CmemSparnatural.sparql;
  const api = factory(sparql);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).links = api;
})(typeof self !== 'undefined' ? self : this, function (sparql) {
  'use strict';

  const DEFAULT_LINKS = 'Explore=/{view}/explore?graph={graph}&resource={resource}|BKE=/{view}/bke/new?graph={graph}&resourceIri={resource}';

  /** "Name=template|Name=template" -> [{ name, template }]; split at the first "=". */
  function parseLinks(spec) {
    return String(spec || '')
      .split('|')
      .map((pair) => {
        const i = pair.indexOf('=');
        return i > 0 ? { name: pair.slice(0, i).trim(), template: pair.slice(i + 1).trim() } : null;
      })
      // only local paths and http(s) URLs: a link must never run script (javascript:, data:) or leave via //host
      .filter((l) => l && l.name && /^(\/(?!\/)|https?:\/\/)/i.test(l.template));
  }

  /** Fills a template; values are URL-encoded. Without a graph, the "key={graph}" query pair is removed. */
  function expandLink(template, ctx) {
    let t = template;
    if (ctx.graph == null) {
      t = t.replace(/([?&])[^?&=#]+=\{graph\}(&?)/, (m, sep, amp) => (amp ? sep : ''));
    }
    return t
      .replace(/\{view\}/g, encodeURIComponent(ctx.view))
      .replace(/\{graph\}/g, encodeURIComponent(ctx.graph == null ? '' : ctx.graph))
      .replace(/\{resource\}/g, encodeURIComponent(ctx.resource));
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /** Icon links for all targets after the first one (the first is the cell's own link). */
  function linkIconsHtml(resource, targets, ctx) {
    return targets
      .slice(1)
      .map((t) => {
        const href = expandLink(t.template, { view: ctx.view, graph: ctx.graph, resource })
          .replace(/'/g, '%27');
        return `<a class="cmem-sn-link" target="_blank" rel="noopener" title="${escapeHtml(t.name)}" href="${escapeHtml(href)}">${escapeHtml(t.name)}</a>`;
      })
      .join('');
  }

  /** TableX inserts label bindings (x_label) into HTML without escaping: escape them before it renders. */
  function safeBindingSet(binding) {
    const out = {};
    for (const k of Object.keys(binding)) {
      const b = binding[k];
      out[k] = /_label$/.test(k) && b && typeof b.value === 'string' ? { ...b, value: escapeHtml(b.value) } : b;
    }
    return out;
  }

  /** A graph that has the resource as subject; graphs with its rdf:type first (Explore needs a graph). */
  function graphOfQuery(iri) {
    return `SELECT ?g ?typed WHERE {
  GRAPH ?g { ${sparql.iriRef(iri)} ?p ?o }
  BIND(IF(?p = <http://www.w3.org/1999/02/22-rdf-syntax-ns#type>, 1, 0) AS ?typed)
} ORDER BY DESC(?typed) LIMIT 1`;
  }

  async function resolveGraph(exec, iri) {
    try {
      const row = sparql.rows(await exec(graphOfQuery(iri), { graph: null }))[0];
      return row && row.g ? row.g.value : null;
    } catch (e) {
      return null;
    }
  }

  return { DEFAULT_LINKS, parseLinks, expandLink, linkIconsHtml, escapeHtml, safeBindingSet, graphOfQuery, resolveGraph };
});
