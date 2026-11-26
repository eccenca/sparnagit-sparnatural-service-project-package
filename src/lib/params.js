/*
 * Page parameters: hash (#a=b) wins over query (?a=b).
 * Runs in the browser (window.CmemSparnatural.params) and in node (module.exports).
 */
(function (root, factory) {
  const links = typeof module === 'object' && module.exports ? require('./links.js') : root.CmemSparnatural.links;
  const api = factory(links);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).params = api;
})(typeof self !== 'undefined' ? self : this, function (links) {
  'use strict';

  const DEFAULT_LIMIT = 1000;
  const truthy = (v) => v === 'true' || v === '1';

  function readParams(search, hash, browserLang) {
    const p = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    for (const [k, v] of new URLSearchParams(String(hash || '').replace(/^#/, ''))) p.set(k, v);

    const graph = p.get('graph') || null;
    const limit = Number.parseInt(p.get('limit'), 10);
    const lang = (p.get('lang') || String(browserLang || 'en').split('-')[0] || 'en').toLowerCase();
    const parsedLinks = links.parseLinks(p.get('links') || '');
    return {
      graph,
      picker: p.has('picker') ? truthy(p.get('picker')) : graph === null,
      // shaped: shapes win (default); raw: everything found in the data. shapes=off is the older alias of raw.
      mode: p.has('mode') ? (p.get('mode') === 'raw' ? 'raw' : 'shaped') : (p.get('shapes') === 'off' ? 'raw' : 'shaped'),
      sparql: truthy(p.get('sparql')),
      lang,
      limit: Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
      links: parsedLinks.length ? parsedLinks : links.parseLinks(links.DEFAULT_LINKS),
    };
  }

  return { readParams, DEFAULT_LIMIT };
});
