/*
 * SPARQL execution against the CMEM endpoint with the session cookie, plus IRI/literal helpers.
 * Runs in the browser (window.CmemSparnatural.sparql) and in node (module.exports).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).sparql = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ENDPOINT = '/dataplatform/proxy/default/sparql';
  const DEFAULT_TIMEOUT_MS = 60000;

  class SparqlError extends Error {
    constructor(status, message) {
      super(message);
      this.name = 'SparqlError';
      this.status = status;
    }
  }

  /** Returns exec(query, { graph, timeoutMs }) -> Promise<SPARQL JSON results>. */
  function makeExecutor(fetchFn, endpoint = ENDPOINT) {
    return async function exec(query, opts = {}) {
      const body = new URLSearchParams({ query });
      if (opts.graph) body.append('default-graph-uri', opts.graph);
      const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs || DEFAULT_TIMEOUT_MS) : null;
      let res;
      try {
        res = await fetchFn(endpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/sparql-results+json' },
          body,
          signal: ctrl ? ctrl.signal : undefined,
        });
      } catch (err) {
        throw new SparqlError(0, err && err.name === 'AbortError' ? 'The query took too long and was stopped.' : String(err && err.message || err));
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (!res.ok) {
        let text = '';
        try { text = await res.text(); } catch (e) { /* ignore */ }
        throw new SparqlError(res.status, `HTTP ${res.status}${text ? ': ' + text.slice(0, 300) : ''}`);
      }
      return res.json();
    };
  }

  /** <iri> with characters that are not allowed in IRIREF written as \uXXXX (valid in SPARQL and Turtle). */
  function iriRef(iri) {
    return '<' + String(iri).replace(/[\u0000- <>"{}|^`\\]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')) + '>';
  }

  /** "string" with \ " and line breaks escaped (valid in SPARQL and Turtle). */
  function stringLiteral(s) {
    return '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
  }

  /** Markup characters as look-alikes: Sparnatural inserts labels into HTML without escaping, and entities would show
   * literally where it uses textContent. */
  function displayText(s) {
    return String(s).replace(/[<>&"']/g, (c) => ({ '<': '＜', '>': '＞', '&': '＆', '"': '＂', "'": '’' }[c]));
  }

  /** Copy of a SPARQL JSON result with displayText applied to all literal values (for Sparnatural's own widgets). */
  function neutralizeLiterals(json) {
    if (!json || !json.results || !Array.isArray(json.results.bindings)) return json;
    return { ...json, results: { ...json.results, bindings: json.results.bindings.map((b) => {
      const out = {};
      for (const k of Object.keys(b)) out[k] = b[k] && b[k].type !== 'uri' && b[k].type !== 'bnode' ? { ...b[k], value: displayText(b[k].value) } : b[k];
      return out;
    }) } };
  }

  /** Rows of a SPARQL JSON result as plain { var: value } objects. */
  function rows(json) {
    return ((json && json.results && json.results.bindings) || []).map((b) => {
      const r = {};
      for (const k of Object.keys(b)) r[k] = b[k];
      return r;
    });
  }

  /** User-facing text for a failed configuration step; 401 means the knowledge graph session is missing. */
  function describeError(err) {
    const cause = err && err.cause ? err.cause : err;
    if (cause && cause.status === 401) {
      return { needsLogin: true, text: 'You are not signed in to the knowledge graph. Please sign in to Corporate Memory, then reload this page.' };
    }
    const where = err && err.step ? ` (${err.step})` : '';
    return { needsLogin: false, text: `Could not read the graph${where}: ${err && err.message ? err.message : err}` };
  }

  return { ENDPOINT, SparqlError, describeError, displayText, neutralizeLiterals, makeExecutor, iriRef, stringLiteral, rows };
});
