/*
 * Sparnatural page glue: parameters → user → cached or generated config → Sparnatural + Yasr (TableX).
 * Logic lives in lib/*.js (unit-tested); this file wires it to the DOM.
 */
(function () {
  'use strict';

  const CS = window.CmemSparnatural;
  const VERSION = 'dbb4564-dirty';
  const UI_LANGS = ['en', 'fr']; // languages of Sparnatural's own interface
  const $ = (id) => document.getElementById(id);

  const params = CS.params.readParams(location.search, location.hash, navigator.language);
  const uiLang = UI_LANGS.includes(params.lang) ? params.lang : 'en';
  const exec = CS.sparql.makeExecutor(window.fetch.bind(window));
  const view = currentView();
  const hrefToIri = new Map();
  let lastQuery = '';
  let sparnatural = null;
  let yasqe = null;

  // ---- surroundings -------------------------------------------------------------------------

  /** Application view id: first path segment of the CMEM page around us (same origin), else "default". */
  function currentView() {
    try {
      const seg = window.parent.location.pathname.split('/').filter(Boolean)[0];
      if (seg && seg !== 'dataintegration' && window.parent !== window) return seg;
    } catch (e) { /* not same origin */ }
    return 'default';
  }

  function adoptCmemTheme() {
    try {
      if (window.parent === window) return;
      CS.theme.copyTokens(window.parent.getComputedStyle(window.parent.document.documentElement), document.documentElement);
    } catch (e) { /* standalone or other origin: CSS fallbacks apply */ }
  }

  async function currentUser() {
    try {
      const res = await fetch('/dataplatform/userinfo', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (res.ok) {
        const u = await res.json();
        return u.uri || u.accountName || null;
      }
    } catch (e) { /* ignore */ }
    return null; // unknown user: the cache is not used (cache.cacheKey returns null)
  }

  // ---- header ---------------------------------------------------------------------------------

  function setStatus(text, busy) {
    const s = $('status');
    s.textContent = text;
    s.classList.toggle('cmem-sn-progress', !!busy);
    $('rebuild').disabled = !!busy;
  }

  function showMessage(text, isError) {
    const m = $('message');
    m.hidden = !text;
    m.textContent = text || '';
    m.className = 'cmem-sn-message' + (isError ? ' error' : '');
  }

  function setHashParams(values) {
    const h = new URLSearchParams(location.hash.replace(/^#/, ''));
    for (const [k, v] of Object.entries(values)) {
      if (v == null) h.delete(k); else h.set(k, v); // explicit values, so they win over ?query parameters
    }
    h.delete('shapes'); // older alias of mode
    location.hash = h.toString(); // hashchange reloads the page
  }

  function setGraphInHash(graph) {
    setHashParams({ graph: graph || '', picker: 'true', mode: params.mode });
  }

  /** Shaped: shapes win (default). Raw: everything found in the data, shapes ignored. */
  function renderModeArea() {
    const area = $('mode-area');
    const label = document.createElement('label');
    label.htmlFor = 'mode-select';
    label.textContent = 'Mode';
    const select = document.createElement('select');
    select.id = 'mode-select';
    select.title = 'Shaped: only what the shapes describe. Raw: every type, relation and value found in the data.';
    select.add(new Option('Shaped', 'shaped'));
    select.add(new Option('Raw (all data)', 'raw'));
    select.value = params.mode;
    select.addEventListener('change', () => setHashParams({ mode: select.value === 'raw' ? 'raw' : 'shaped' }));
    area.append(label, ' ', select);
  }

  async function renderGraphArea() {
    const area = $('graph-area');
    area.textContent = '';
    if (!params.picker) {
      area.innerHTML = '<label>Graph</label> ';
      const name = document.createElement('span');
      name.className = 'cmem-sn-graph';
      name.textContent = params.graph || 'All graphs';
      name.title = params.graph || '';
      area.appendChild(name);
      return;
    }
    // Custom picker: a native <select> uses a proportional font (tree lines can't align) and can't filter.
    area.innerHTML = `<label for="graph-button">Graph</label>
      <span class="cmem-sn-picker">
        <button type="button" id="graph-button" aria-haspopup="listbox" aria-expanded="false"></button>
        <span class="cmem-sn-picker-panel" hidden>
          <input type="search" id="graph-filter" placeholder="Search graphs…" autocomplete="off"
            role="combobox" aria-controls="graph-list" aria-expanded="true" aria-label="Search graphs">
          <ul id="graph-list" role="listbox" aria-label="Graphs" tabindex="-1"></ul>
        </span>
      </span>`;
    const button = $('graph-button');
    const panel = area.querySelector('.cmem-sn-picker-panel');
    const filter = $('graph-filter');
    const listEl = $('graph-list');
    const ALL = { iri: '', title: 'All graphs', prefix: '', depth: 0, parent: -1 };
    let rows = [];
    let shown = [];
    let active = -1;

    const titleOf = (iri) => (iri ? ((rows.find((r) => r.iri === iri) || {}).title || iri) : ALL.title);
    const setButton = () => { button.textContent = titleOf(params.graph); button.title = params.graph || ''; };
    setButton();

    function render() {
      shown = [ALL].concat(CS.graphs.filterTree(rows, filter.value));
      listEl.textContent = '';
      shown.forEach((r, i) => {
        const li = document.createElement('li');
        li.id = 'graph-opt-' + i;
        li.setAttribute('role', 'option');
        if (r.separator) {
          li.className = 'separator';
          li.textContent = 'System graphs';
          li.setAttribute('aria-disabled', 'true');
        } else {
          const tree = document.createElement('span');
          tree.className = 'tree';
          tree.textContent = r.prefix;
          const title = document.createElement('span');
          title.textContent = r.title;
          li.append(tree, title);
          li.title = r.iri;
          if ((r.iri || null) === (params.graph || null)) li.setAttribute('aria-selected', 'true');
          li.addEventListener('mousedown', (ev) => { ev.preventDefault(); choose(r); });
        }
        listEl.appendChild(li);
      });
      if (shown.length === 1 && filter.value) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No graph matches.';
        listEl.appendChild(li);
      }
      setActive(shown.findIndex((r) => !r.separator && (r.iri || null) === (params.graph || null)));
    }
    function setActive(i) {
      listEl.querySelectorAll('.active').forEach((el) => el.classList.remove('active'));
      active = i;
      const el = i >= 0 ? $('graph-opt-' + i) : null;
      if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'nearest' }); filter.setAttribute('aria-activedescendant', el.id); }
    }
    function move(delta) {
      for (let i = active + delta; i >= 0 && i < shown.length; i += delta) {
        if (!shown[i].separator) { setActive(i); return; }
      }
    }
    function open() {
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
      filter.value = '';
      render();
      filter.focus();
    }
    function close() {
      panel.hidden = true;
      button.setAttribute('aria-expanded', 'false');
    }
    function choose(r) {
      close();
      if ((r.iri || null) !== (params.graph || null)) setGraphInHash(r.iri || null);
    }
    button.addEventListener('click', () => (panel.hidden ? open() : close()));
    filter.addEventListener('input', render);
    filter.addEventListener('keydown', (ev) => {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); move(1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); move(-1); }
      else if (ev.key === 'Enter') { ev.preventDefault(); if (shown[active] && !shown[active].separator) choose(shown[active]); }
      else if (ev.key === 'Escape') { close(); button.focus(); }
    });
    document.addEventListener('mousedown', (ev) => { if (!panel.hidden && !area.contains(ev.target)) close(); });
    // keyboard: close when focus moves out of the picker (Tab / Shift+Tab)
    area.addEventListener('focusout', (ev) => { if (!panel.hidden && !area.contains(ev.relatedTarget)) close(); });

    try {
      const [res, importsJson] = await Promise.all([
        fetch('/dataplatform/graphs/list', { credentials: 'same-origin', headers: { Accept: 'application/json' } }),
        exec(CS.graphs.importsQuery(), { graph: null }).catch(() => null),
      ]);
      const list = (res.ok ? await res.json() : []).map((g) => ({
        iri: g.iri, title: ((g.label && g.label.title) || g.iri).trim(), system: !!(g.systemResource || g.diProjectGraph || g.projectInternal), // Build project internals count as system graphs
      }));
      rows = CS.graphs.graphTree(list, importsJson ? CS.graphs.parseImports(importsJson) : new Map());
    } catch (e) { /* only "All graphs" */ }
    if (params.graph && !rows.some((r) => r.iri === params.graph)) {
      rows.push({ iri: params.graph, title: params.graph, prefix: '', depth: 0, parent: -1 });
    }
    setButton();
    if (!panel.hidden) render();
  }

  // ---- configuration --------------------------------------------------------------------------

  const STEP_TEXT = {
    classes: 'Reading the types of the graph…',
    properties: 'Reading the properties…',
    labels: 'Reading labels…',
    shapes: 'Reading the shapes…',
  };

  async function obtainConfig(key, rebuild) {
    if (rebuild) CS.cache.dropCache(safeStorage(), key);
    const cached = CS.cache.readCache(safeStorage(), key, Date.now());
    if (cached) return cached;
    const st = await CS.stats.collectStats(exec, params.graph, params.lang, (step) => setStatus(STEP_TEXT[step] || step, true));
    let shapeList = [];
    let note = null;
    if (params.mode !== 'raw') {
      setStatus(STEP_TEXT.shapes, true);
      ({ shapes: shapeList, note } = await CS.shapes.loadShapesOrNote(exec, st.classes.map((c) => c.iri), params.lang));
    }
    const model = CS.config.buildModel(st, shapeList, { shapes: params.mode === 'raw' ? 'off' : 'auto' });
    const entry = { turtle: CS.config.toTurtle(model, uiLang), css: CS.config.depictionCss(model), mode: model.mode, builtAt: Date.now() };
    if (model.mode !== 'empty' && !note) CS.cache.writeCache(safeStorage(), key, entry, entry.builtAt);
    entry.note = note; // shown, not cached: the next load tries the shapes again
    return entry;
  }

  function safeStorage() {
    try { return window.localStorage; } catch (e) { return null; }
  }

  async function load(rebuild) {
    showMessage('');
    setStatus('Preparing…', true);
    destroyBuilder();
    const user = await currentUser();
    const key = CS.cache.cacheKey({ version: VERSION, user, graph: params.graph, shapes: params.mode, lang: params.lang });
    let entry;
    try {
      entry = await obtainConfig(key, rebuild);
    } catch (err) {
      const d = CS.sparql.describeError(err);
      showMessage(d.text, true);
      if (d.needsLogin) {
        const a = document.createElement('a');
        a.href = '/';
        a.target = '_top';
        a.textContent = ' Sign in';
        $('message').appendChild(a);
      }
      setStatus('', false);
      return;
    }
    if (entry.mode === 'empty') {
      showMessage('No typed resources in this graph.', false);
      setStatus('', false);
      return;
    }
    const time = new Date(entry.builtAt).toLocaleString(params.lang, { dateStyle: 'short', timeStyle: 'short' });
    const from = entry.mode === 'shapes' ? 'from shapes'
      : params.mode === 'raw' ? 'from all data' : 'from data (no shapes for this graph)';
    setStatus(`Configuration ${from}, built ${time}`, false);
    if (entry.note) showMessage(entry.note, false);
    console.info('[sparnatural] configuration mode:', entry.mode);
    applyDepictionCss(entry.css || '');
    createBuilder(entry.turtle);
  }

  /** Shape/class images (foaf:depiction) as icons, see config.depictionCss. */
  function applyDepictionCss(css) {
    let style = document.getElementById('cmem-sn-depictions');
    if (!style) {
      style = document.createElement('style');
      style.id = 'cmem-sn-depictions';
      document.head.appendChild(style);
    }
    style.textContent = css;
  }

  // ---- Sparnatural and results ----------------------------------------------------------------

  function endpointUrl() {
    return CS.sparql.ENDPOINT + (params.graph ? '?default-graph-uri=' + encodeURIComponent(params.graph) : '');
  }

  function destroyBuilder() {
    if (sparnatural) sparnatural.remove();
    sparnatural = null;
    lastQuery = '';
  }

  function createBuilder(turtle) {
    const src = URL.createObjectURL(new Blob([turtle], { type: 'text/turtle' }));
    const el = document.createElement('spar-natural');
    el.setAttribute('src', src);
    el.setAttribute('endpoint', endpointUrl());
    el.setAttribute('lang', uiLang);
    el.setAttribute('defaultLang', params.lang);
    el.setAttribute('queryLang', params.lang);
    el.setAttribute('limit', String(params.limit));
    el.setAttribute('distinct', 'true');
    // Sparnatural's own widgets (value lists, autocomplete, trees) insert result labels into HTML unescaped:
    // run their queries through our executor and neutralise markup in the literal values.
    el.customization = {
      sparqlHandler: {
        executeSparql: (query, callback, errorCallback) => {
          exec(query, { graph: params.graph })
            .then((json) => callback(CS.sparql.neutralizeLiterals(json)))
            .catch((err) => { if (errorCallback) errorCallback(err); else console.error('[sparnatural] widget query failed', err); });
        },
      },
    };
    el.addEventListener('init', (e) => {
      for (const p in yasr.plugins) if (yasr.plugins[p].notifyConfiguration) yasr.plugins[p].notifyConfiguration(e.detail.config);
    });
    el.addEventListener('queryUpdated', (e) => {
      try { lastQuery = el.expandSparql(e.detail.queryString); } catch (err) { lastQuery = e.detail.queryString; }
      if (yasqe) yasqe.setValue(lastQuery);
      for (const p in yasr.plugins) {
        if (!yasr.plugins[p].notifyQuery) continue;
        // the Map plugin still reads Sparnatural's older query JSON
        yasr.plugins[p].notifyQuery(p === 'Map' ? CS.mapquery.toV13Query(e.detail.queryJson) : e.detail.queryJson);
      }
    });
    el.addEventListener('reset', () => { lastQuery = ''; if (yasqe) yasqe.setValue(''); });
    el.addEventListener('submit', () => runQuery(el));
    $('builder').appendChild(el);
    sparnatural = el;
  }

  // Sparnatural's number widget sets min/max but no step, so browsers only accept whole numbers (e.g. not 0.95).
  new MutationObserver(() => {
    for (const input of $('builder').querySelectorAll('input[type="number"]:not([step])')) input.setAttribute('step', 'any');
  }).observe($('builder'), { childList: true, subtree: true });

  function runQuery(el) {
    if (!lastQuery) {
      showMessage('Complete the search first: pick a value or "Any" for the last item.', false);
      el.enablePlayBtn();
      return;
    }
    showMessage('');
    el.disablePlayBtn();
    const started = Date.now();
    // the search itself runs through our executor: raw values for the results table (which escapes them itself)
    exec(lastQuery, { graph: params.graph }).then((result) => {
      try {
        yasr.setResponse({ data: result, contentType: 'application/sparql-results+json', status: 200, executionTime: Date.now() - started });
      } catch (err) {
        console.error('[sparnatural] results display failed', err);
      } finally {
        el.enablePlayBtn(); // never leave the button spinning when a results plugin throws
      }
    }, (err) => {
      showMessage('The search failed: ' + (err && err.message ? err.message : err), true);
      el.enablePlayBtn();
    });
  }

  Yasr.registerPlugin('TableX', SparnaturalYasguiPlugins.TableX);
  // Map of results with geo:wktLiteral values or lat/long columns (tiles from tile.openstreetmap.org).
  Yasr.registerPlugin('Map', SparnaturalYasguiPlugins.MapPlugin);
  delete Yasr.plugins.table;
  const yasr = new Yasr($('yasr'), { pluginOrder: ['TableX', 'Map', 'response'], defaultPlugin: 'TableX', persistenceId: null });
  const tablex = yasr.plugins.TableX;
  tablex.config.openIriInNewWindow = true;
  tablex.config.lang = params.lang;
  tablex.config.bindingSetAdapter = CS.links.safeBindingSet; // TableX renders label bindings as HTML
  tablex.config.uriHrefAdapter = (iri) => {
    const href = CS.links.expandLink(params.links[0].template, { view, graph: params.graph, resource: iri }).replace(/'/g, '%27');
    hrefToIri.set(href, iri);
    return href;
  };

  // Extra link targets: chips after every resource link of the table.
  if (params.links.length > 1) {
    const decorate = () => {
      for (const a of $('yasr').querySelectorAll('a.iri')) {
        if (a.nextElementSibling && a.nextElementSibling.classList.contains('cmem-sn-links')) continue;
        const iri = hrefToIri.get(a.getAttribute('href'));
        if (!iri) continue;
        const span = document.createElement('span');
        span.className = 'cmem-sn-links';
        span.innerHTML = CS.links.linkIconsHtml(iri, params.links, { view, graph: params.graph });
        a.after(span);
      }
    };
    new MutationObserver(decorate).observe($('yasr'), { childList: true, subtree: true });
  }

  // Whole store: Explore and BKE need a graph, so look up one that holds the resource when a link is clicked.
  if (!params.graph) {
    $('yasr').addEventListener('click', async (ev) => {
      const a = ev.target.closest && ev.target.closest('a.iri, a.cmem-sn-link');
      if (!a || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      const isMain = a.classList.contains('iri');
      const main = isMain ? a : a.closest('.cmem-sn-links') && a.closest('.cmem-sn-links').previousElementSibling;
      const iri = main && hrefToIri.get(main.getAttribute('href'));
      const target = isMain ? params.links[0] : params.links.slice(1).find((l) => l.name === a.title);
      if (!iri || !target) return;
      ev.preventDefault();
      const win = window.open('about:blank', '_blank'); // synchronously, so the browser doesn't block it
      const graph = await CS.links.resolveGraph(exec, iri);
      const href = CS.links.expandLink(target.template, { view, graph, resource: iri });
      if (win) {
        win.opener = null;
        win.location.href = href;
      } else {
        window.open(href, '_blank', 'noopener');
      }
    }, true);
  }

  if (params.sparql) {
    $('yasqe').hidden = false;
    yasqe = new Yasqe($('yasqe'), { readOnly: true, persistenceId: null, showQueryButton: false, resizeable: true, editorHeight: '200px' });
  }

  $('rebuild').addEventListener('click', () => load(true));
  window.addEventListener('hashchange', () => location.reload());

  CS.cache.pruneCache(safeStorage(), VERSION, Date.now());
  adoptCmemTheme();
  renderGraphArea();
  renderModeArea();
  load(false);
})();
