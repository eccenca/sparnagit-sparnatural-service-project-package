/*
 * Sparnatural configuration from statistics and shapes: a model, then SHACL Turtle in Sparnatural's vocabulary
 * (see vendor/NOTICE.md). Runs in the browser (window.CmemSparnatural.config) and in node (module.exports).
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const sparql = isNode ? require('./sparql.js') : root.CmemSparnatural.sparql;
  const stats = isNode ? require('./stats.js') : root.CmemSparnatural.stats;
  const api = factory(sparql, stats);
  if (isNode) module.exports = api;
  else (root.CmemSparnatural = root.CmemSparnatural || {}).config = api;
})(typeof self !== 'undefined' ? self : this, function (sparql, stats) {
  'use strict';

  const XSD = 'http://www.w3.org/2001/XMLSchema#';
  const CONFIG_NS = 'https://ns.eccenca.com/sparnatural/config/';
  const WKT = 'http://www.opengis.net/ont/geosparql#wktLiteral';
  const LIST_THRESHOLD = 50;
  const DEFAULT_ICON = 'fa-solid fa-cube';
  const LABEL_PATHS = ['http://www.w3.org/2000/01/rdf-schema#label', 'http://www.w3.org/2004/02/skos/core#prefLabel'];
  const NUMERIC = new Set(['integer', 'int', 'long', 'short', 'byte', 'decimal', 'double', 'float',
    'nonNegativeInteger', 'positiveInteger', 'negativeInteger', 'nonPositiveInteger',
    'unsignedInt', 'unsignedLong', 'unsignedShort', 'unsignedByte'].map((n) => XSD + n));
  const WIDGETS = {
    autocomplete: 'core:AutocompleteProperty', list: 'core:ListProperty', search: 'core:SearchProperty',
    date: 'core:TimeProperty-Date', number: 'core:NumberProperty', boolean: 'core:BooleanProperty', map: 'core:MapProperty',
  };

  function widgetFor(range, rangeInstanceCount) {
    if (range.kind === 'entity') return rangeInstanceCount <= LIST_THRESHOLD ? 'list' : 'autocomplete';
    const dt = range.datatype;
    if (dt === XSD + 'date' || dt === XSD + 'dateTime') return 'date';
    if (NUMERIC.has(dt)) return 'number';
    if (dt === XSD + 'boolean') return 'boolean';
    if (dt === WKT) return 'map'; // filter by an area drawn on a map (GeoSPARQL geof:sfWithin)
    return 'search';
  }

  function buildModel(st, shapeList, opts = {}) {
    const classes = st.classes || [];
    if (!classes.length) return { mode: 'empty', entities: [] };
    const count = new Map(classes.map((c) => [c.iri, c.count]));
    const classLabel = new Map(classes.map((c) => [c.iri, c.label]));
    const propLabel = (p) => (st.propertyLabels && st.propertyLabels.get(p)) || stats.localName(p);
    const props = st.properties || [];
    const classDepiction = (iri) => (st.classDepictions && st.classDepictions.get(iri)) || null;
    const forward = (cls, path) => props.find((p) => p.domain === cls && p.path === path);
    const inverseDomains = (cls, path) => props.filter((p) => p.path === path && p.objectClasses.includes(cls)).map((p) => p.domain);

    const applicable = opts.shapes === 'off' ? [] : (shapeList || []).filter((s) => count.has(s.targetClass));
    const mode = applicable.length ? 'shapes' : 'statistics';

    let entities;
    if (mode === 'statistics') {
      entities = classes.map((c, i) => ({ id: '', class: c.iri, label: c.label, icon: null, depiction: classDepiction(c.iri), order: i + 1, count: c.count, properties: [] }));
    } else {
      const byClass = new Map();
      const sorted = [...applicable].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.id.localeCompare(b.id));
      for (const s of sorted) {
        let e = byClass.get(s.targetClass);
        if (!e) {
          e = { id: '', class: s.targetClass, label: null, icon: null, depiction: null, order: s.order ?? 1e9, count: count.get(s.targetClass), properties: [], _shapeProps: [] };
          byClass.set(s.targetClass, e);
        }
        e.label = e.label || s.name;
        e.icon = e.icon || s.icon;
        e.depiction = e.depiction || s.depiction || null;
        e._shapeProps.push(...s.properties);
      }
      entities = [...byClass.values()]
        .map((e) => ({ ...e, label: e.label || classLabel.get(e.class), depiction: e.depiction || classDepiction(e.class) }))
        .sort((a, b) => a.order - b.order || b.count - a.count)
        .map((e, i) => ({ ...e, order: i + 1 }));
    }
    const offered = new Set(entities.map((e) => e.class));
    const offeredOnly = (list) => [...new Set(list)].filter((c) => offered.has(c));
    const entityRange = (list) => (list.length ? { kind: 'entity', classes: list } : null);
    const literalRange = (dts) => (dts.length ? { kind: 'literal', datatype: dts[0] } : null);
    const rangeCount = (range) => (range.kind === 'entity' ? range.classes.reduce((n, c) => n + (count.get(c) || 0), 0) : 0);
    const finish = (base, range) => ({ ...base, range, widget: widgetFor(range, rangeCount(range)), labelRole: false });

    for (const e of entities) {
      const out = [];
      if (mode === 'statistics') {
        props.filter((p) => p.domain === e.class).forEach((p, i) => {
          const range = entityRange(offeredOnly(p.objectClasses)) || literalRange(p.datatypes);
          if (range) out.push(finish({ path: p.path, inverse: false, label: propLabel(p.path), order: i + 1 }, range));
        });
      } else {
        const seen = new Set();
        e._shapeProps.forEach((sp, i) => {
          const key = sp.path + (sp.inverse ? '^' : '');
          if (seen.has(key)) return;
          let observed;
          let datatypes = [];
          if (sp.inverse) {
            const domains = inverseDomains(e.class, sp.path);
            if (!domains.length) return;
            observed = domains;
          } else {
            const f = forward(e.class, sp.path);
            if (!f) return;
            observed = f.objectClasses;
            datatypes = f.datatypes;
          }
          let range = null;
          if (sp.class) range = entityRange(offered.has(sp.class) ? [sp.class] : offeredOnly(observed));
          else if (sp.datatype) range = { kind: 'literal', datatype: sp.datatype };
          else range = entityRange(offeredOnly(observed)) || (sp.inverse ? null : literalRange(datatypes));
          if (!range) return;
          seen.add(key);
          out.push(finish({ path: sp.path, inverse: sp.inverse, label: sp.name || propLabel(sp.path), order: sp.order ?? 1000 + i }, range));
        });
        delete e._shapeProps;
      }
      // Label role: an existing label property, or a hidden one when the data has labels for this class.
      const existing = out.find((p) => !p.inverse && LABEL_PATHS.includes(p.path));
      if (existing) existing.labelRole = true;
      else {
        const labelPath = LABEL_PATHS.find((lp) => forward(e.class, lp));
        if (labelPath) {
          out.push({ path: labelPath, inverse: false, label: propLabel(labelPath), order: 9999,
            range: { kind: 'literal', datatype: (forward(e.class, labelPath).datatypes[0]) || XSD + 'string' }, widget: null, labelRole: true });
        }
      }
      e.properties = out.sort((a, b) => a.order - b.order);
    }
    return { mode, entities };
  }

  /** SPARQL-variable-safe local names (Sparnatural derives variable names from them), unique per model. */
  function safeName(s, fallback) {
    let base = String(s || '').normalize('NFKD').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || fallback;
    if (!/^[A-Za-z]/.test(base)) base = 'C' + base;
    return base;
  }
  function unique(used, base) {
    let id = base;
    for (let n = 2; used.has(id); n++) id = base + '_' + n;
    used.add(id);
    return id;
  }
  function assignIds(entities, used) {
    return entities.map((e) => unique(used, safeName(stats.localName(e.class), 'Entity')));
  }
  /** Property shape ids carry the path's local name (the Map results plugin finds lat/long columns by it). */
  function propertyId(used, entityId, p) {
    return unique(used, entityId + '_' + safeName(stats.localName(p.path), 'p') + (p.inverse ? '_of' : ''));
  }

  /** Shape images (foaf:depiction) as icons: Sparnatural only takes CSS classes, so each gets a generated class. */
  const depictionClass = (i) => 'fa-cmem-dep-' + (i + 1); // must start with "fa": Sparnatural renders other icon values as <img src>
  function safeUrl(url) {
    const u = String(url || '').trim();
    if (!/^(https?:\/\/|\/(?!\/))/i.test(u)) return null;
    return u.replace(/["\\{}<>\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
  }
  /** foaf:depiction is the canonical CMEM icon; volipi:iconName (Font Awesome) only without one. Sparnatural writes
   * the icon into a class attribute, so only class-name-like values are accepted. */
  function iconOf(e, i) {
    if (safeUrl(e.depiction)) return 'fa-cmem-dep ' + depictionClass(i);
    return e.icon && /^[A-Za-z0-9 _-]+$/.test(e.icon) ? e.icon : DEFAULT_ICON;
  }

  const displayText = sparql.displayText; // labels go into Sparnatural's HTML unescaped
  function depictionCss(model) {
    return model.entities
      .map((e, i) => (!safeUrl(e.depiction) ? '' : `.${depictionClass(i)}::before { content: ""; background-image: url("${safeUrl(e.depiction)}"); }`))
      .filter(Boolean)
      .join('\n');
  }

  function toTurtle(model, lang) {
    const l = String(lang || 'en').toLowerCase().replace(/[^a-z-]/g, '') || 'en';
    const lit = (s) => sparql.stringLiteral(displayText(s)) + '@' + l;
    const iri = sparql.iriRef;
    const node = (id) => iri(CONFIG_NS + id);
    const used = new Set();
    const ids = assignIds(model.entities, used);
    const out = [
      '@prefix sh: <http://www.w3.org/ns/shacl#> .',
      '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .',
      '@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .',
      '@prefix dash: <http://datashapes.org/dash#> .',
      '@prefix core: <http://data.sparna.fr/ontologies/sparnatural-config-core#> .',
      '@prefix volipi: <http://data.sparna.fr/ontologies/volipi#> .',
      '',
    ];
    model.entities.forEach((e, i) => {
      const id = ids[i];
      const propIds = e.properties.map((p) => propertyId(used, id, p));
      const lines = [
        `${node(id)} a sh:NodeShape`,
        `  sh:targetClass ${iri(e.class)}`,
        `  rdfs:label ${lit(e.label)}`,
        `  sh:order ${Number(e.order) || 0}`,
        `  volipi:iconName ${sparql.stringLiteral(iconOf(e, i))}`,
      ];
      if (propIds.length) lines.push(`  sh:property ${propIds.map(node).join(', ')}`);
      out.push(lines.join(' ;\n') + ' .', '');
      e.properties.forEach((p, j) => {
        const pl = [`${node(propIds[j])} sh:path ${p.inverse ? `[ sh:inversePath ${iri(p.path)} ]` : iri(p.path)}`,
          `  sh:name ${lit(p.label)}`, `  sh:order ${Number(p.order) || 0}`];
        if (p.range.kind === 'entity') {
          pl.push('  sh:nodeKind sh:IRI');
          pl.push(p.range.classes.length === 1
            ? `  sh:class ${iri(p.range.classes[0])}`
            : `  sh:or ( ${p.range.classes.map((c) => `[ sh:class ${iri(c)} ]`).join(' ')} )`);
        } else {
          pl.push('  sh:nodeKind sh:Literal', `  sh:datatype ${iri(p.range.datatype)}`);
        }
        if (p.widget) pl.push(`  dash:searchWidget ${WIDGETS[p.widget]}`);
        if (p.labelRole) pl.push('  dash:propertyRole dash:LabelRole');
        out.push(pl.join(' ;\n') + ' .', '');
      });
    });
    return out.join('\n');
  }

  return { CONFIG_NS, LIST_THRESHOLD, DEFAULT_ICON, widgetFor, buildModel, toTurtle, depictionCss, displayText };
});
