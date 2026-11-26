# Sparnatural for Corporate Memory — design

Status: draft for approval · 2026-11-25

## Intent

Give **domain users** a visual query builder over their knowledge graph inside Corporate Memory (CMEM), without SPARQL
and without anyone writing a Sparnatural configuration. The package ships
[Sparnatural](https://github.com/sparna-git/Sparnatural) as a static page, and an application view that opens it as the
first screen. The query builder adapts itself to the chosen context graph: it is generated from the data, and curated
CMEM shapes take over wherever they exist.

## Goals

- A domain user who opens the application view lands directly in the query builder (the integrations module first).
- Zero config: works on any graph without preparation; no Sparnatural config files are maintained by anyone.
- Shapes-driven when shapes exist: CMEM SHACL shapes for the classes in the context graph define what is offered
  (classes, properties, labels, order); unshaped classes and properties are then hidden.
- Context-graph scoped: one optional context (integration) graph, whose `owl:imports` closure is queried; whole store
  if none is given.
- Every resource in the results opens in Explore in a new tab, inside the same application view.
- Looks like CMEM (colors, font, sizes taken from CMEM design tokens).

## Non-goals

- No server-side component, Python plugin or proxy: static files only.
- No editing of data, no saving/sharing of queries in this first version.
- No hand-maintained Sparnatural config shipped by the package.
- No precomputed config graphs (approach B), possibly later as an optional cache.

## Anti-goals (failure even if it technically works)

- Domain users see IRIs, technical class names or the SPARQL editor by default.
- The page shows classes or properties the user can't find instances for (empty dropdowns), or, when shapes exist,
  things the shape authors deliberately left out.
- The first load of a typical graph takes so long that users give up without feedback.
- Results expose data the user is not allowed to see (it must use the user's own access rights).

## Verified constraints (spike, docker.localhost, CMEM v26.2)

| Fact | Evidence |
|---|---|
| A page served from a Build project (`/dataintegration/workspace/projects/<p>/browse/<file>`) can call the DataPlatform SPARQL endpoint `/dataplatform/proxy/default/sparql` with the session cookie only (`credentials: 'same-origin'`), GET and POST. No token handling. | Probe page: 200, 341,010 triples |
| `FROM <g>` and `?default-graph-uri=<g>` both scope the query. | 8,608 triples for the shapes catalog |
| The endpoint expands `FROM <g>` to the `owl:imports` closure of `g`. | `prod-inst` alone: 29 triples via `GRAPH`, 36,632 via `FROM` |
| `/dataplatform/graphs/list` lists the readable graphs with labels (for the graph picker). | 200 JSON |
| CMEM shapes catalog `https://vocab.eccenca.com/shacl/` is global: it imports the shapes graphs of all installed packages. | `owl:imports` of the catalog graph |
| CMEM property shapes use `sh:path` (always an IRI) + `shui:inversePath true` for inverse paths; ranges via `sh:class` / `sh:datatype` / `sh:nodeKind`; labels via `sh:name`; order via `sh:order`; grouping via `sh:group`. | Predicate statistics over all property shapes |
| Explore URLs carry the view id: `/<view-id>/explore?graph=<g>&resource=<r>`. | Live URL |
| CMEM UI exposes design tokens as `--eccgui-*` CSS custom properties on `:root` (e.g. `--eccgui-color-primary: #f29100`, `--eccgui-color-accent: #0a6199`, 14px Roboto). | Computed style of Explore |
| Sparnatural reads a SHACL config from `src` (URL, multiple space-separated URLs), scopes via `endpoint` URL, themes via a CSS file overriding its `--primary-color-*` / `--secondary-color-*` etc. variables, results via YasR (TableX plugin with `uriHrefAdapter`). | Sparnatural docs |

Untested so far: behavior for a user with restricted graph access (expected: same rules as everywhere else in CMEM,
since the same session and endpoint are used).

## Approaches considered

- **A. Generate the config live in the browser (picked).** On load the page queries statistics of the context graph
  and the relevant CMEM shapes, and writes a Sparnatural SHACL config in memory (passed as a `blob:` URL), cached per
  context graph in the browser. Always current, zero install, works for any graph a view points at. Cost: the first load
  on big graphs; mitigated with query limits, progress feedback and a cache.
- **B. Precompute per graph with a Build workflow.** Fast loads and an inspectable config, but stale until rerun,
  someone must run it for each graph, and extra graphs end up in the store. Breaks "zero config". Possible later as an
  optional cache layered on A.
- **C. Pass CMEM shapes to Sparnatural unchanged.** No conversion code, but CMEM shapes carry `shui:` semantics Sparnatural
  doesn't know (`shui:inversePath`, ranges without a node shape), and it doesn't cover the no-shapes case. It becomes
  one input of A, not an approach of its own.

The user picked A, with the explicit requirement that the configuration depends on the context graph.

## Design

### Package

Project package `ecc-sparnatural-service-project` (naming follows bpmn/map/mermaid/viz service packages; created from
`gh:eccenca/cmem-package-template`, same repo layout and build tasks as `ecc-bpmn-service-project-package`).

Integration differs from bpmn/map service: those embed their page into Explore resource views through a shape
widget (`shui:WidgetIntegration` + `<embed>` in a table report). This package ships **no shapes and no widget**: the page
is a full standalone application, shown as a tab of the integrations module of its own application view.

```
ecc-sparnatural-service-project-package/
  src/                         # page sources, tests, Taskfile (build-html, build-project, test)
    sparnatural.html           # the page (entry point)
    cmem-sparnatural.js        # config generator + CMEM glue (testable module)
    sparnatural-theme-cmem.css
    vendor/                    # pinned Sparnatural + yasgui-plugins dist files (see "Third-party files")
    test/
  ecc-sparnatural-service-project/
    cpa-manifest.json
    projects/sparnatural-service/  # Build project; resources/ filled by `task build-project`
    views/sparnatural.json         # application view (file_type "view", view_id "sparnatural")
    mp-*.png, icon, README.md, CHANGELOG.md, LICENSE
```

Manifest files: the project zip, the view (`{"file_type": "view", "file_path": "views/sparnatural.json", "view_id":
"sparnatural"}`), images, texts. No graphs and no dependencies are needed for the core feature.

### Application view (`views/sparnatural.json`)

Created in CMEM and exported with `cmemc admin view export`, then committed. Content:

- id `sparnatural`, label "Search" (en) (final label: builder's call, see open items).
- `integrationsModuleConfiguration`: `enabled: true`, `order: -10` (opens first), one tab "Search" with
  `url: /dataintegration/workspace/projects/sparnatural-service/browse/sparnatural.html`.
- Explore module enabled (result links must open in this view).
- Other modules: as few as useful for domain users (builder's call, keep Explore).

Customers reuse the page in their own domain views by adding the same tab URL with a preset graph
(`…/sparnatural.html#graph=<iri>`); the README documents this.

### Page parameters

Hash parameters (`#a=b&c=d`), with query parameters as a fallback (the same parameter convention as bpmn-service; only the
convention is shared, not its shape-widget integration):

| Parameter | Default | Effect |
|---|---|---|
| `graph` | none | Context graph IRI. Without it: whole store, graph picker shown. |
| `picker` | `true` without `graph`, else `false` | Show the graph picker. |
| `shapes` | `auto` | `auto`: shapes supersede statistics if any apply; `off`: statistics only. |
| `sparql` | `false` | Show the generated SPARQL (YasQE) for power users. |
| `lang` | browser language, fallback `en` | Sparnatural `lang` / `queryLang`. |
| `limit` | `1000` | Sparnatural result `limit`. |
| `links` | `Explore=/{view}/explore?graph={graph}&resource={resource}` | Link targets per resource (see Results). |

The page passes the chosen graph on as `endpoint = /dataplatform/proxy/default/sparql?default-graph-uri=<graph>`; the
imports closure is included by the endpoint. Whole store = plain endpoint.

### Configuration generator (per context graph)

Input: the context graph `G` (or none). Output: one Sparnatural SHACL config (Turtle string → `blob:` URL → `src`).

1. **Statistics of G** (scoped with `default-graph-uri=G`):
   - classes with instance counts (`?s a ?c`), with `rdfs:label`/`skos:prefLabel` in the user's language;
   - per class, outgoing properties with counts, and per property the object kind: classes of the IRI objects
     (`?o a ?c2`), or literal datatypes/language tags;
   - noise filter: drop `rdf:type`, and drop classes and properties of system vocabularies (owl, rdfs, sh, shui,
     void, cmem config) unless they are the only data.
   - Limits per query (timeout and `LIMIT`), and the queries run with progress shown in the page.
2. **Shapes for G**: node shapes of the central CMEM shapes catalog only (`https://vocab.eccenca.com/shacl/` and its
   `owl:imports` closure, i.e. exactly the shapes Explore uses) whose `sh:targetClass` has instances in G (from step 1).
   Shapes that live elsewhere (e.g. in G's own closure but not imported into the catalog) are ignored. *(User decision.)*
3. **Mode decision, all or nothing**: if step 2 found at least one applicable node shape → **shapes mode** for the
   whole graph, else **statistics mode**. (`shapes=off` forces statistics mode.) *(User decision; accepted consequence:
   a catalog shape for a class with instances in G switches the whole graph to shapes mode.)*
4. **Shapes mode**:
   - entities = classes with an applicable node shape; label `sh:name` → `rdfs:label` → local name; order by shape
     order, then instance count;
   - properties = the shape's property shapes whose path is used in G (count > 0, step 1). The path is
     `sh:path`, inverted when `shui:inversePath true` (Sparnatural gets `sh:inversePath`); label `sh:name`;
     order `sh:order`;
   - range: `sh:class` → that class's entity if it is offered, else drop the property; `sh:datatype` → literal widget by
     datatype; neither → the classes seen in G's statistics, restricted to offered entities;
   - classes without an applicable shape and properties without a property shape are **not offered**.
5. **Statistics mode**: entities = all non-noise classes with instances, labelled and sorted by count; properties =
   observed properties, range = observed object classes (or a literal widget by observed datatype).
6. **Widgets** (both modes): IRI ranges → autocomplete search widget over labels (list widget when the range class has
   few instances, threshold builder's call); `xsd:date`/`dateTime` → date widget; numbers → number widget;
   `xsd:boolean` → boolean widget; strings/langStrings → search widget. Labels are queried with `rdfs:label`,
   `skos:prefLabel`, `sh:name`, local-name fallback.
7. **Icons**: neutral default icon per entity; a shape can set its own via `volipi:iconName` (Font Awesome class).
8. **Cache**: the generated Turtle is cached in `localStorage`, keyed by
   `(page version, user URI, context graph or "store", mode, lang)`. The user URI comes from `/dataplatform/userinfo`
   (works with the session cookie: `{"accountName":…,"uri":…}`), so users sharing a browser never get a config built
   from someone else's access rights. Only the structure (classes, properties, labels) is cached, never widget values.
   Entries expire after a fixed time (builder's call, e.g. 24h), because the page can't detect data changes cheaply.
9. **Rebuild / reload button** *(user decision)*: always visible in the page header, next to the graph (picker);
   it drops the cache entry for the current key, regenerates the config and reloads Sparnatural, with the same
   progress feedback as the first load. A small hint shows when the current config was built ("Configuration from
   today 10:42 · Rebuild").

The generator is a standalone module (`cmem-sparnatural.js`) with the SPARQL execution injected, so the mapping
rules (steps 3 to 7) are unit-tested on fixture query results without a CMEM instance (as `bpmn-converter.js` is).

### Results

- YasR with the TableX plugin only; label columns hide IRIs.
- **Several links per resource** *(user decision: approach A)*. TableX supports one `href` per resource
  (`uriHrefAdapter(uri) => string`, no cell renderer, no draw event; verified in
  `Sparnatural-yasgui-plugins/src/sparnatural-yasr-tablex-plugin/index.ts`). So:
  - the main link of a cell is set by `uriHrefAdapter` to the **first** link target (Explore by default), opened in
    a new tab (`openIriInNewWindow: true`);
  - a `MutationObserver` on the results element adds a compact row of icon links after every `a.iri` for the
    **remaining** link targets (each `target="_blank" rel="noopener"`), CMEM-themed, with the target name as tooltip.
    This depends on TableX's markup, which is acceptable because the version is pinned; a unit or e2e test guards it.
- **Link targets** are a list of URL templates with `{view}`, `{graph}`, `{resource}` (URL-encoded on insertion, which
  also avoids TableX's unescaped `href` attribute), e.g.
  `Explore=/{view}/explore?graph={graph}&resource={resource}`. Default list: Explore only. A page parameter
  `links=` (`name=template` pairs, `|`-separated) replaces the list, so a view can add BKE and others without code
  changes. The BKE URL pattern is taken from a live instance during the build and documented in the README as an
  example. Templates with `{graph}` drop the `graph` parameter when no context graph is set.
- `{view}` is read from the parent frame's path (same origin), falling back to `default` when the page runs standalone.
- Submit button disabled while a query runs; errors shown in plain words.

### Theme

`sparnatural-theme-cmem.css` loaded after Sparnatural's CSS, mapping Sparnatural variables onto CMEM tokens with hex
fallbacks:

| Sparnatural | CMEM token | Fallback |
|---|---|---|
| `--primary-color-main` | `--eccgui-color-primary` | `#f29100` |
| `--primary-color-important` | `--eccgui-color-palette-layout-amber-900` | `#c77400` |
| `--primary-color-medium` | `--eccgui-color-palette-identity-brand-500` | `#f6b966` |
| `--primary-color-light` | `--eccgui-color-primary-contrast` | `#fbead9` |
| `--secondary-color-main` | `--eccgui-color-accent` | `#0a6199` |
| `--secondary-color-important` | `--eccgui-color-palette-layout-petrol-900` | `#0c5678` |
| `--secondary-color-light` | `--eccgui-color-palette-identity-accent-500` | `#77abca` |
| `--ternary-color-main` | `--eccgui-color-palette-layout-petrol-700` | `#437c97` |
| `--ternary-color-light` | `--eccgui-color-accent-contrast` | `#e5f4fb` |
| `--silver-color-main` | `--eccgui-color-palette-extra-silver-900` | `#a8a8a8` |
| `--silver-color-light` | `--eccgui-color-palette-extra-silver-300` | `#dedede` |
| `--default-text-color` | `--eccgui-color-palette-identity-text-900` | `#090909` |
| `--focus-color` | `--eccgui-a11y-outline-color` | `#8c1656` |

At load the page copies the parent frame's `--eccgui-*` values onto its own `:root` (same origin), so customer branding
and future CMEM palettes carry over; standalone it uses the fallbacks. Font Roboto 14px, rounded inputs and link color
are applied to Sparnatural and TableX with a few overrides.

### Third-party files

Sparnatural, its CSS and `sparnatural-yasgui-plugins` are pinned to one release and **vendored** into the project
resources (no runtime CDN for the core), so the page works in closed networks and doesn't change under us. Font Awesome
(icons) and Roboto may come from a CDN, as map-service already does for its libraries; the README lists the hosts.
Version: Sparnatural **14.1.0** (current `package.json`), and the matching `sparnatural-yasgui-plugins` release.

License *(user decision: bundle)*: Sparnatural is **LGPL-3.0**; the package stays **Apache-2.0**. LGPL covers the library
and changes to it, not the code using it. Obligations met by the package:
- vendored files stay separate and unmodified under `resources/vendor/sparnatural/` (replaceable by the user), never
  merged into our own JS;
- the library's copyright notices kept, `LICENSE-LGPL-3.0` and `LICENSE-GPL-3.0` texts placed next to the vendored
  files, plus a `NOTICE` / README section naming the LGPL files, their version and a link to the exact source release;
- if Sparnatural is ever patched, the patch is LGPL-3.0 and published with it.
The same check is done for the yasgui plugins' license during the build.

### Packaging requirements

No sibling package ships a `"view"` file yet. The first build step verifies that `cmemc package build` / `install`
accept it with the local cmemc (v26.2.3, cmem-client 1.4.3); the CI `cmemc` pin is raised to that version and the
README states the minimum CMEM version.

### Tests

- Unit tests (node `--test`) for the generator: statistics mode, shapes mode, hiding of unshaped classes/properties,
  `shui:inversePath`, range resolution, cache key (incl. user), link template expansion and encoding.
- A DOM test that the extra link icons appear next to TableX's `a.iri` cells (guards the markup dependency).
- Rebuild button: drops the cache entry and regenerates.
- Manual/Playwright check on docker.localhost against `ecc-product-data-project` (`http://ld.company.org/prod-inst/`,
  has shapes in `http://ld.company.org/prod-vocab-shapes/`) for shapes mode, and a shape-less graph for statistics mode.
- One run as a restricted user.

## Left to the builder

- Exact SPARQL for the statistics, limits and timeouts; progress UI.
- Widget thresholds, cache expiry, final labels and texts, which modules besides Explore the view enables.
- The Sparnatural version to pin, after checking the release.
- README/DOCUMENTATION content and marketplace images.

## Cleanup

The spike project `sparnatural-spike` on docker.localhost (probe page + KG dataset) is throwaway and is deleted before
the build starts.
