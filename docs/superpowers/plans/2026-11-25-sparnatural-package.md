# Sparnatural for CMEM — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A CMEM project package that delivers Sparnatural as a standalone page in the integrations module of its own
application view, configured automatically per context graph from statistics or from the central CMEM shapes catalog.

**Architecture:** Static files only, served from a Build project's resources. Plain browser JS modules with no build
step and no npm runtime dependencies (UMD style as in `ecc-bpmn-service-project-package/src/bpmn-converter.js`:
`window.CmemSparnatural.<module>` in the browser, `module.exports` in node). Pure logic (params, links, statistics,
shapes, config generation, cache, theme) is unit-tested with `node --test` on fixtures recorded from docker.localhost;
the page glue is verified in the browser with Playwright.

**Tech Stack:** Sparnatural 14.1.0 + Sparnatural-yasgui-plugins (TableX) + Yasr, vendored; node ≥ 20 for tests;
Taskfile; cmemc ≥ 26.2.3 (cmem-client 1.4.3); copier template `gh:eccenca/cmem-package-template`.

**Spec:** `docs/superpowers/specs/2026-11-25-sparnatural-package-design.md` (read it; this plan argues from it).

## Global Constraints

- Package id `ecc-sparnatural-service-project`, repo dir `ecc-sparnatural-service-project-package`, Build project id
  `sparnatural-service`, view id `sparnatural`, page `sparnatural.html`.
- Page URL: `/dataintegration/workspace/projects/sparnatural-service/browse/sparnatural.html`.
- SPARQL endpoint `/dataplatform/proxy/default/sparql`, `fetch(..., { credentials: 'same-origin' })`, POST form
  `query=…`, scoped with `default-graph-uri=<graph>` (endpoint expands the `owl:imports` closure).
- Shapes come only from the central catalog `https://vocab.eccenca.com/shacl/` (queried with
  `default-graph-uri=https://vocab.eccenca.com/shacl/`). All or nothing: ≥ 1 applicable node shape → shapes mode for
  the whole graph.
- CMEM inverse paths: `shui:inversePath true` (`https://vocab.eccenca.com/shui/inversePath`).
- User identity: `GET /dataplatform/userinfo` → `{"accountName", "uri", "isRoot"}`.
- Explore link: `/{view}/explore?graph={graph}&resource={resource}`; BKE link (verified live):
  `/{view}/bke/new?graph={graph}&resourceIri={resource}`.
- Cache: `localStorage`, key over (page version, user URI, graph or `store`, `shapes` param, lang), max age 24h,
  structure only, never widget values.
- License: package Apache-2.0; Sparnatural (LGPL-3.0) vendored unmodified in its own files under
  `resources/vendor/sparnatural/` with `LICENSE-LGPL-3.0`, `LICENSE-GPL-3.0` and a NOTICE.
- Manifest rules: graph/file names `^[0-9a-z][0-9a-z-_.]{1,29}\.(ttl|zip|png)$`, tags
  `^[a-z][a-z0-9-]*( [a-z][a-z0-9-]+)*$`, ≥ 1 agent, a `file_role: license` file, icon PNG 166×166, marketplace
  images 1920×1080 ≤ 5 MiB.
- No secrets, no tokens; never read token storage.

## Review Focus

1. **Graph without typed resources** (empty graph, or only untyped triples): the page shows "No typed resources in
   this graph" with the picker and Rebuild, not an empty Sparnatural. → test in Task 6 (`buildModel` on empty stats).
2. **IRIs and labels with quotes, backslashes, `>` or non-ASCII** in the generated Turtle: must be escaped, the config
   must still parse. → test in Task 6 (`toTurtle` escaping).
3. **Statistics query fails or times out** (large store, 5xx): generation rejects with a readable message, page shows
   it with Rebuild; no endless spinner. → test in Task 4 (`collectStats` rejects with `StatsError`).
4. **Shapes catalog not readable** by a restricted user (403/empty): falls back to statistics mode, not an error.
   → test in Task 5 (`loadShapes` resolves `[]` on 403).
5. **`localStorage` unavailable or full** (private mode, quota): page works without cache. → test in Task 7.

---

### Task 1: Package scaffold, view file and build pipeline

**Files:**
- Create (copier): `ecc-sparnatural-service-project-package/` (keep the existing `docs/`)
- Create: `ecc-sparnatural-service-project/views/sparnatural.json`
- Create: `ecc-sparnatural-service-project/projects/sparnatural-service/` (`config.xml`, `tags.xml`, `variables.xml`)
- Create: `src/Taskfile.yml`, `src/scripts/embed-build-metadata.sh`, `src/sparnatural.html` (placeholder: "Sparnatural service __BUILD_ID__")
- Modify: `ecc-sparnatural-service-project/cpa-manifest.json`, `Taskfile.yaml` (`build-project`, `test` like bpmn), `.gitlab-ci.yml` (cmemc pin)

**Interfaces:**
- Produces: `task build-project` copies `src/dist/*` and `src/vendor/` into `projects/sparnatural-service/resources/`;
  `task test` runs `node --test 'test/*.test.js'` in `src/`; `task build` produces `dist/ecc-sparnatural-service-project-*.cpa`.

- [ ] **Step 1:** Delete the spike project: `cmemc -c docker.localhost-admin project delete sparnatural-spike`. Expected: "done".
- [ ] **Step 2:** Run `copier copy gh:eccenca/cmem-package-template ecc-sparnatural-service-project-package` with
  `package_type=project`, `package_id=ecc-sparnatural-service-project`, `package_name="Sparnatural Query Builder"`,
  `package_description="Visual query builder for domain users, configured automatically from your data and shapes"`.
  Then `git init`, commit "chore: scaffold from cmem-package-template" (includes `docs/`).
- [ ] **Step 3:** Create the Build project `sparnatural-service` in CMEM (label "Sparnatural Service", description
  with a link to the page URL, as bpmn-service's `config.xml`), upload the placeholder page, export it into
  `projects/sparnatural-service/` with `task export` or `cmemc project export --extract`.
- [ ] **Step 4:** Create the view: start from `cmemc admin view export default --output-file -`, set `id: "sparnatural"`,
  labels `Search`/`Suche`/`Recherche`, `order: 20`; modules: `integrationsModuleConfiguration`
  `{ "id": "integrations", "enabled": true, "order": -10, "name": "Search", "tabs": [ { "name": "Search", "url": "/dataintegration/workspace/projects/sparnatural-service/browse/sparnatural.html" } ] }`,
  `exploreModuleConfiguration` and `bkeModuleConfiguration` enabled, `queryModuleConfiguration`, `annotationModuleConfiguration`,
  `linkRuleModuleConfiguration`, `reportsModuleConfiguration`, `thesaurusModuleConfiguration`, `trackingModuleConfiguration`,
  `chartsModuleConfiguration`, `taskModuleConfiguration` disabled; keep the rest as in default. Import with
  `cmemc admin view import`, re-export with `cmemc admin view export sparnatural --output-file views/sparnatural.json`,
  and store **the single object** (not the array) if `cmemc package build` requires that (check in Step 6).
- [ ] **Step 5:** Manifest `files`: project zip (`projects/sparnatural-service.zip`, `project_id: sparnatural-service`),
  `{"file_type": "view", "file_path": "views/sparnatural.json", "view_id": "sparnatural"}`, LICENSE/README/CHANGELOG roles;
  tags `query`, `search`, `sparnatural`, `visualization`, `service`; no dependencies.
- [ ] **Step 6:** Run `task build` then `cmemc -c docker.localhost-admin package install --replace --input dist/*.cpa`.
  Expected: install succeeds, `cmemc admin view list` shows `sparnatural`, and
  `http://docker.localhost/sparnatural/integrations` shows the placeholder page in the "Search" tab, opened first.
  If the view file type is rejected, stop and report the exact cmemc error (spec: minimum version check).
- [ ] **Step 7:** Set `.gitlab-ci.yml` `uv tool install --reinstall cmem-cmemc@<the version that passed Step 6>`. Commit "feat: package skeleton with application view".

### Task 2: Vendored Sparnatural with a hand-written config

**Files:**
- Create: `src/scripts/vendor.sh`, `src/vendor/sparnatural/` (+ `LICENSE-LGPL-3.0`, `LICENSE-GPL-3.0`, `NOTICE.md`), `src/vendor/yasr/`, `src/vendor/sparnatural-yasgui-plugins/`
- Create: `src/test/fixtures/hand-config.ttl`
- Modify: `src/sparnatural.html`

**Interfaces:**
- Produces: the exact Sparnatural SHACL vocabulary used by Task 6, written down in `src/vendor/sparnatural/NOTICE.md`
  under "Config vocabulary": prefixes and IRIs of widgets (search/autocomplete/list/date/number/boolean), icon property,
  inverse path support.

- [ ] **Step 1:** `vendor.sh` downloads `hello-sparnatural.zip` of Sparnatural release 14.1.0 (GitHub release asset) and
  copies the JS/CSS files its `index.html` loads (Sparnatural, Yasr/Yasgui, sparnatural-yasgui-plugins, their CSS) into
  `src/vendor/…`. It records each file's version and source URL in `NOTICE.md` and copies the license texts. It also
  records the yasgui plugins' and Yasr's license (spec: check them too).
- [ ] **Step 2:** From the release's `config.ttl` and the Sparnatural SHACL reference, write the config vocabulary into
  NOTICE.md. Expected (confirm, correct if different): `core: <http://data.sparna.fr/ontologies/sparnatural-config-core#>`,
  `dash:searchWidget` with `core:AutocompleteProperty`, `core:ListProperty`, `core:SearchProperty`,
  `core:TimeProperty-Date`, `core:NumberProperty`, `core:BooleanProperty`; `volipi:iconName`
  (`volipi: <http://data.sparna.fr/ontologies/volipi#>`); ranges via `sh:node` / `sh:or`; `sh:path [ sh:inversePath p ]`.
- [ ] **Step 3:** Write `hand-config.ttl` for `http://ld.company.org/prod-inst/` (two classes from the product demo with
  one object property, one inverse property, one date or number property) and wire `sparnatural.html` to load it with
  `endpoint="/dataplatform/proxy/default/sparql?default-graph-uri=http%3A%2F%2Fld.company.org%2Fprod-inst%2F"` and Yasr +
  TableX registered (default `table` plugin removed).
- [ ] **Step 4:** `task build-project`, upload/install, open the page in Playwright as admin. Expected: both classes
  selectable, a query runs, TableX shows labelled results. Commit "feat: vendor Sparnatural 14.1.0".

### Task 3: Page parameters and link templates

**Files:**
- Create: `src/lib/params.js`, `src/lib/links.js`
- Test: `src/test/params.test.js`, `src/test/links.test.js`

**Interfaces:**
- Produces:
  - `readParams(search: string, hash: string, browserLang: string) -> { graph: string|null, picker: boolean, shapes: 'auto'|'off', sparql: boolean, lang: string, limit: number, links: LinkTarget[] }` — hash wins over query.
  - `DEFAULT_LINKS = 'Explore=/{view}/explore?graph={graph}&resource={resource}'`
  - `parseLinks(spec: string) -> LinkTarget[]` with `LinkTarget = { name: string, template: string }`, pairs `|`-separated, split at the first `=`.
  - `expandLink(template: string, ctx: { view: string, graph: string|null, resource: string }) -> string` — values `encodeURIComponent`-ed; when `graph` is null the whole `key={graph}` query pair is removed.
  - `linkIconsHtml(resource: string, targets: LinkTarget[], ctx: { view: string, graph: string|null }) -> string` — anchors for `targets.slice(1)`, each `<a class="cmem-sn-link" target="_blank" rel="noopener" title="{name}" href="…">`, name HTML-escaped.

- [ ] **Step 1: Write failing tests**
  - `readParams('', '', 'de-DE')` → `{ graph: null, picker: true, shapes: 'auto', sparql: false, lang: 'de', limit: 1000 }` and `links` = parsed `DEFAULT_LINKS`.
  - `readParams('?graph=a', '#graph=b', 'en')`.graph → `'b'`; with a graph, `picker` → `false`; `#picker=true` → `true`.
  - `readParams('', '#shapes=off&sparql=true&limit=50&lang=fr', 'en')` → `shapes: 'off', sparql: true, limit: 50, lang: 'fr'`; `#limit=abc` → `1000`; `#shapes=xyz` → `'auto'`.
  - `expandLink(DEFAULT_LINKS_TEMPLATE, { view: 'sparnatural', graph: 'http://g/', resource: 'http://r/1?a=b' })` → `'/sparnatural/explore?graph=http%3A%2F%2Fg%2F&resource=http%3A%2F%2Fr%2F1%3Fa%3Db'`.
  - same with `graph: null` → `'/sparnatural/explore?resource=http%3A%2F%2Fr%2F1%3Fa%3Db'`.
  - `parseLinks("Explore=/{view}/explore?graph={graph}&resource={resource}|BKE=/{view}/bke/new?graph={graph}&resourceIri={resource}")` → two targets named `Explore`, `BKE` (template keeps its own `=`).
  - `linkIconsHtml("http://r/'x", targets, ctx)` contains one anchor (BKE), `href` has `%27`, no raw `'`.
- [ ] **Step 2:** `cd src && node --test test/params.test.js test/links.test.js` → FAIL (modules missing).
- [ ] **Step 3:** Implement both modules (UMD export).
- [ ] **Step 4:** Tests PASS. Commit "feat: page parameters and link templates".

### Task 4: Statistics of the context graph

**Files:**
- Create: `src/lib/sparql.js`, `src/lib/stats.js`
- Create: `src/test/fixtures/prod-inst-classes.json`, `prod-inst-properties.json`, `prod-inst-labels.json` (recorded with `cmemc query execute --accept application/sparql-results+json` against docker.localhost using the queries from `stats.js`)
- Test: `src/test/stats.test.js`

**Interfaces:**
- Produces:
  - `makeExecutor(fetchFn, endpoint = '/dataplatform/proxy/default/sparql') -> (query: string, opts: { graph: string|null, timeoutMs?: number }) => Promise<SparqlJson>`; POST form, `default-graph-uri` when graph set, `AbortController` timeout (default 60000), non-2xx → `SparqlError { status, message }`.
  - `NOISE_NAMESPACES = ['http://www.w3.org/2002/07/owl#', 'http://www.w3.org/2000/01/rdf-schema#', 'http://www.w3.org/ns/shacl#', 'https://vocab.eccenca.com/shui/', 'http://rdfs.org/ns/void#', 'https://vocab.eccenca.com/configuration/', 'https://vocab.eccenca.com/di/', 'http://www.w3.org/1999/02/22-rdf-syntax-ns#']`
  - `classesQuery(limit = 200) -> string`: `?c (COUNT(DISTINCT ?s) AS ?n)` over `?s a ?c`, `ORDER BY DESC(?n)`.
  - `propertiesQuery(limit = 5000) -> string`: per `?c ?p ?oc ?dt` with `COUNT(*)`, `?p != rdf:type`, `?oc` = type of IRI objects, `?dt` = `datatype(?o)` for literals (`rdf:langString` for language-tagged).
  - `labelsQuery(iris: string[], lang: string) -> string`: `VALUES ?x {…}`, `rdfs:label | skos:prefLabel | sh:name`, prefer `lang`, then untagged, then `en`.
  - `parseClasses(json) -> Stats['classes']` (labels = local name until `applyLabels`), `parseProperties(json) -> Stats['properties']`, `applyLabels(stats, labelsJson) -> Stats`.
  - `collectStats(exec, graph: string|null, lang: string, onProgress?: (step: string) => void) -> Promise<Stats>`; any query failure → rejects with `StatsError { step: 'classes'|'properties'|'labels', cause }`.
  - `Stats = { classes: Array<{ iri, label, count }>, properties: Array<{ domain, path, count, objectClasses: string[], datatypes: string[] }> }`; noise classes dropped unless nothing else remains; labels fall back to local name.

- [ ] **Step 1: Write failing tests** on the fixtures:
  - `parseClasses(fixture)` contains `http://ld.company.org/prod-vocab/Hardware` (or the class with the highest count in the fixture) first, with `count` > 0; no IRI from `NOISE_NAMESPACES` while non-noise classes exist.
  - `parseProperties(fixture)`: one entry per (domain, path), `objectClasses` and `datatypes` merged and de-duplicated; no `rdf:type`.
  - label fallback: an IRI without label → local name after the last `#` or `/`.
  - `collectStats` with an `exec` that rejects on the properties query → rejects with `StatsError` whose `step === 'properties'`. *(Review Focus 3)*
  - `makeExecutor` with a fake `fetchFn` returning 500 → `SparqlError` with `status 500`; with graph `http://g/` → body contains `default-graph-uri=http%3A%2F%2Fg%2F`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Record the fixtures with the final queries (if not done in Step 1), re-run tests, commit "feat: context graph statistics".

### Task 5: Shapes from the central catalog

**Files:**
- Create: `src/lib/shapes.js`
- Create: `src/test/fixtures/catalog-shapes-prod.json` (recorded for the class IRIs of the prod-inst fixture)
- Test: `src/test/shapes.test.js`

**Interfaces:**
- Consumes: `makeExecutor` (Task 4).
- Produces:
  - `CATALOG = 'https://vocab.eccenca.com/shacl/'`
  - `shapesQuery(classIris: string[]) -> string`: node shapes with `sh:targetClass` in `VALUES`, optional `sh:name`/`rdfs:label`, `volipi:iconName`, `sh:order`; their `sh:property` with `sh:path`, `shui:inversePath`, `sh:name`, `sh:order`, `sh:class`, `sh:datatype`.
  - `parseShapes(json) -> Shape[]`, `Shape = { id, targetClass, name|null, icon|null, order|null, properties: Array<{ path, inverse: boolean, name|null, order|null, class: string|null, datatype: string|null }> }`; one Shape per node shape; property rows de-duplicated.
  - `loadShapes(exec, classIris: string[]) -> Promise<Shape[]>`: runs with `graph: CATALOG`; resolves `[]` for an empty class list and on `SparqlError` 401/403. Other errors reject.

- [ ] **Step 1: Write failing tests**
  - `parseShapes(fixture)` returns ≥ 1 Shape whose `targetClass` is a prod-vocab class, with ≥ 1 property carrying its `sh:name` and `sh:order` from the fixture; a property with `shui:inversePath true` has `inverse === true`.
  - `loadShapes(execRejecting403, ['http://x/C'])` → `[]`. *(Review Focus 4)*
  - `loadShapes(exec, [])` → `[]` without calling `exec`.
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit "feat: shapes from the CMEM shapes catalog".

### Task 6: Config generator (model + Turtle)

**Files:**
- Create: `src/lib/config.js`
- Test: `src/test/config.test.js`

**Interfaces:**
- Consumes: `Stats` (Task 4), `Shape[]` (Task 5), config vocabulary from Task 2 NOTICE.md.
- Produces:
  - `buildModel(stats: Stats, shapes: Shape[], opts: { shapes: 'auto'|'off' }) -> Model`
  - `Model = { mode: 'shapes'|'statistics'|'empty', entities: Entity[] }`,
    `Entity = { id: string, class: string, label: string, icon: string|null, order: number, count: number, properties: Prop[] }`,
    `Prop = { path: string, inverse: boolean, label: string, order: number, range: { kind: 'entity', classes: string[] } | { kind: 'literal', datatype: string }, widget: 'autocomplete'|'list'|'search'|'date'|'number'|'boolean' }`
  - `widgetFor(range, rangeInstanceCount: number) -> Prop['widget']` — `LIST_THRESHOLD = 50`: entity ranges with ≤ 50 instances → `list`, else `autocomplete`; `xsd:date`/`xsd:dateTime` → `date`; xsd numeric types → `number`; `xsd:boolean` → `boolean`; other literals → `search`.
  - `toTurtle(model: Model, lang: string) -> string` — one `sh:NodeShape` per entity (`<urn:x-cmem-sparnatural:entity:{index}>`, `sh:targetClass`, `sh:name "label"@lang`, `sh:order`, `volipi:iconName` if set), property shapes with `sh:path` (inverse as `[ sh:inversePath <p> ]`), `sh:name`, `sh:order`, `sh:node`/`sh:or` to entity shapes or `sh:datatype`, `dash:searchWidget`. Default icon `fa-solid fa-circle`.
- Rules (spec steps 3–7): `opts.shapes === 'off'` or no shape with a `targetClass` in `stats.classes` → statistics mode; otherwise shapes mode with only shaped classes; a shaped property is kept only if `(domain, path)` occurs in `stats.properties` (inverse: path occurs with the entity's class among `objectClasses`); `class` range not offered → property dropped; no `class`/`datatype` → observed object classes ∩ offered entities. No classes at all → `mode: 'empty'`.

- [ ] **Step 1: Write failing tests**
  - statistics mode: stats with classes A(10), B(5), A –p→ B, A –q→ `xsd:date` → 2 entities ordered A, B; A has `p` (`entity [B]`, widget `list`) and `q` (`date`).
  - shapes mode: shapes for A only, with property `p` → `mode 'shapes'`, entities `[A]` only; `p` dropped because B is not offered; a shaped property absent from stats is dropped; labels/order from the shape.
  - `opts.shapes = 'off'` with shapes present → statistics mode.
  - inverse: shape property `{ path: p, inverse: true, class: A }` on B with stats A –p→ B → kept, `inverse: true`; Turtle contains `sh:inversePath <p>`.
  - empty stats → `mode: 'empty'`, `entities: []`. *(Review Focus 1)*
  - escaping: label `Say "hi" \ <x> äö` and IRI `http://x/a>b` → Turtle contains `"Say \"hi\" \\ <x> äö"@en` and `<http://x/a>b>`; the output parses with a minimal check (balanced `<…>`, every statement ends with ` .`). *(Review Focus 2)*
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Generate Turtle for the prod-inst fixtures, save as `src/test/fixtures/generated-prod-inst.ttl`, load it into the Task 2 page instead of `hand-config.ttl`, check in Playwright that Sparnatural shows the classes. Commit "feat: Sparnatural config generator".

### Task 7: Cache

**Files:**
- Create: `src/lib/cache.js`
- Test: `src/test/cache.test.js`

**Interfaces:**
- Produces:
  - `MAX_AGE_MS = 24 * 3600 * 1000`
  - `cacheKey({ version, user, graph, shapes, lang }) -> string` — `'cmem-sparnatural:' + JSON.stringify([version, user, graph ?? 'store', shapes, lang])`.
  - `readCache(storage, key, now: number) -> { turtle: string, builtAt: number, mode: string } | null` (null when missing, expired, unparsable or storage throws).
  - `writeCache(storage, key, entry, now: number) -> boolean` (false when storage throws, e.g. quota).
  - `dropCache(storage, key) -> void` (never throws).

- [ ] **Step 1: Write failing tests**
  - write → read within 24h returns the entry; at `builtAt + MAX_AGE_MS + 1` → `null`.
  - keys differ for different `user`, `graph` (`null` vs `'http://g/'`), `shapes`, `lang`, `version`.
  - storage whose `setItem` throws `QuotaExceededError` → `writeCache` returns `false`; storage whose every method throws → `readCache` `null`, `dropCache` doesn't throw. *(Review Focus 5)*
- [ ] **Step 2–4:** FAIL → implement → PASS. **Step 5:** Commit "feat: per-user config cache".

### Task 8: CMEM theme

**Files:**
- Create: `src/sparnatural-theme-cmem.css`, `src/lib/theme.js`
- Test: `src/test/theme.test.js`

**Interfaces:**
- Produces:
  - `TOKEN_NAMES: string[]` — the 13 `--eccgui-*` tokens of the spec's theme table plus `--eccgui-size-typo-text`.
  - `copyTokens(source: { getPropertyValue(name): string }, target: { style: { setProperty(name, value) } }, names = TOKEN_NAMES) -> number` — copies non-empty values, returns how many.
- CSS: `.Sparnatural, .SparnaturalForm, .select2-container--default, .tippy-box { --primary-color-main: var(--eccgui-color-primary, #f29100); … }` for every row of the spec table, plus Roboto 14px, TableX link color `var(--eccgui-color-accent, #0a6199)`, `.cmem-sn-link` icon styling, header bar styling.

- [ ] **Step 1: Write failing test:** `copyTokens` with a source returning `'#123456'` for `--eccgui-color-primary` and `''` for others → returns 1, target received exactly that one property.
- [ ] **Step 2–4:** FAIL → implement → PASS. Commit "feat: CMEM theme".

### Task 9: Page assembly

**Files:**
- Create: `src/sparnatural-app.js`
- Modify: `src/sparnatural.html`, `src/scripts/embed-build-metadata.sh` (stamp `__BUILD_ID__` in html and app, copy `lib/`, css), `src/Taskfile.yml` (`build-project` copies `dist/` and `vendor/`)

**Interfaces:**
- Consumes: all `lib/` modules (Tasks 3–8).
- Behavior (spec "Page parameters", "Results", "Theme", steps 8–9):
  1. `readParams(location.search, location.hash, navigator.language)`; `view` = first path segment of `window.parent.location.pathname` when same origin and not `dataintegration`, else `'default'`.
  2. `copyTokens(getComputedStyle(parent.document.documentElement), document.documentElement)` when same origin.
  3. Header: graph label/picker (`/dataplatform/graphs/list`, shown when `params.picker`; selecting sets `#graph=`), status hint `Configuration from {local time} · Rebuild`, Rebuild button.
  4. `GET /dataplatform/userinfo` → user URI (fallback `'anonymous'`); `cacheKey(...)` with version `__BUILD_ID__`.
  5. Cache hit → use; miss/Rebuild → `collectStats` → `loadShapes` (skipped when `shapes=off`) → `buildModel` → `toTurtle`, progress text per step; `writeCache`.
  6. `mode === 'empty'` → message "No typed resources in this graph." and no Sparnatural; `StatsError` → "Could not read the graph ({step}): {message}" + Rebuild.
  7. Create `<spar-natural>` with `src` = `URL.createObjectURL(new Blob([turtle], {type: 'text/turtle'}))`, `endpoint` with `default-graph-uri` when graph set, `lang`, `defaultLang`, `queryLang` = `params.lang`, `limit` = `params.limit`, `distinct="true"`.
  8. Yasr with only TableX; `TableX.config.uriHrefAdapter = (uri) => expandLink(links[0].template, { view, graph, resource: uri })`, `openIriInNewWindow: true`; `submit` → disable play button, run query via Sparnatural's `executeSparql`, show in Yasr, re-enable.
  9. `MutationObserver` on Yasr's results element: for each `a.iri` without a following `.cmem-sn-links`, insert `<span class="cmem-sn-links">` + `linkIconsHtml(...)` (resource = the anchor's original IRI: read from the binding, not from the rewritten `href`).
  10. YasQE (SPARQL view) only when `params.sparql`.

- [ ] **Step 1:** Implement, `task build-project`, install the package on docker.localhost.
- [ ] **Step 2: Browser check, shapes mode** (Playwright, admin): open `/sparnatural/integrations` with tab URL
  `…/sparnatural.html#graph=http://ld.company.org/prod-inst/`. Expected: hint says shapes mode was used (debug line in
  console), only shaped prod-vocab classes listed; run a query; results show labels; the cell link opens
  `/sparnatural/explore?graph=…&resource=…` in a new tab.
- [ ] **Step 3: Browser check, links:** add `&links=Explore=…|BKE=/{view}/bke/new?graph={graph}&resourceIri={resource}`.
  Expected: one BKE icon per resource cell, opening `/sparnatural/bke/new?…` in a new tab; icons survive paging and sorting.
- [ ] **Step 4: Browser check, statistics mode:** a graph without catalog shapes (e.g. `https://example.org/data/media/ig/`
  if it has none; else `#shapes=off`). Expected: classes sorted by instance count.
- [ ] **Step 5: Browser check, cache + Rebuild:** reload → no statistics queries in the network log (cache hit), hint
  shows the build time; Rebuild → queries run again, hint updates.
- [ ] **Step 6: Browser check, whole store + picker:** no `#graph` → picker visible, whole-store config builds with
  progress; choosing a graph rebuilds for that graph.
- [ ] **Step 7: Browser check, restricted user:** log in as a non-admin user (connection `docker.localhost-userab`):
  page works, graphs list only readable graphs, results contain no resources from unreadable graphs.
- [ ] **Step 8:** Commit "feat: assemble Sparnatural page".

### Task 10: Documentation, marketplace assets, release check

**Files:**
- Modify: `README.md`, `DOCUMENTATION.md`, `CHANGELOG.md`, `ecc-sparnatural-service-project/cpa-manifest.json`
- Create: `ecc-sparnatural-service-project/mp-1.png` … `mp-3.png` (1920×1080), icon PNG 166×166

- [ ] **Step 1:** DOCUMENTATION.md: what it does, the view, all page parameters (table from the spec incl. `links`
  with Explore and BKE examples), how to add the tab to another view with a preset graph, shapes vs statistics mode
  (all or nothing, central catalog only), cache and Rebuild, minimum CMEM/cmemc version, CDN hosts (Font Awesome,
  Roboto), third-party licenses (LGPL-3.0 notice).
- [ ] **Step 2:** Screenshots from Task 9 checks as marketplace images; icon.
- [ ] **Step 3:** `task test` → all pass; `task build`; `task check` against docker.localhost → install + uninstall
  succeed; after uninstall the view `sparnatural` and project `sparnatural-service` are gone.
- [ ] **Step 4:** Commit "docs: package documentation and marketplace assets".
