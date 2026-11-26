# Third-party files

Downloaded by `scripts/vendor.sh` (pinned versions, checksums verified). The files are unmodified.

| Directory | Component | Version | License | Source |
|---|---|---|---|---|
| `sparnatural/` | Sparnatural (`sparnatural.js`, `sparnatural.css`) | 14.1.0 | LGPL-3.0 (`LICENSE-LGPL-3.0`, which supplements `LICENSE-GPL-3.0`) | https://github.com/sparna-git/Sparnatural/releases/tag/14.1.0 (source: https://github.com/sparna-git/Sparnatural/tree/14.1.0) |
| `sparnatural-yasgui-plugins/` | Sparnatural yasgui plugins (TableX) | as shipped in hello-sparnatural 14.1.0 | ISC | https://github.com/sparna-git/Sparnatural-yasgui-plugins |
| `yasgui/` | @triply/yasgui (Yasqe + Yasr) | 4.2.28 | MIT (`LICENSE.txt`) | https://www.npmjs.com/package/@triply/yasgui |
| `fontawesome/` | Font Awesome Free | 6.4.0 | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT | https://fontawesome.com/license/free |

Sparnatural is a library under the GNU LGPL-3.0. This package (Apache-2.0) only uses it; you may replace the files
in `sparnatural/` with another build of Sparnatural. Changes to Sparnatural itself would be LGPL-3.0.

## Config vocabulary (Sparnatural 14.1.0, from the release's `config.ttl` and `sparnatural.js`)

- Prefixes: `sh: <http://www.w3.org/ns/shacl#>`, `dash: <http://datashapes.org/dash#>`,
  `core: <http://data.sparna.fr/ontologies/sparnatural-config-core#>`, `volipi: <http://data.sparna.fr/ontologies/volipi#>`.
- Entity: `sh:NodeShape` with `sh:targetClass`, label `rdfs:label` (lang-tagged), `sh:order`, `volipi:iconName`
  (Font Awesome classes, e.g. `"fa-solid fa-car"`), `sh:description`, `sh:property`.
- Property: `sh:path` (IRI, or `[ sh:inversePath <p> ]`), `sh:name`, `sh:order`, range `sh:class <Class>` (a class
  with a node shape), several ranges `sh:or ( [ sh:class A ] [ sh:class B ] )`, literals `sh:datatype`,
  `sh:nodeKind sh:IRI|sh:Literal`, label property `dash:propertyRole dash:LabelRole`.
- Widgets `dash:searchWidget`: `core:AutocompleteProperty`, `core:ListProperty`, `core:SearchProperty`,
  `core:StringEqualsProperty`, `core:TimeProperty-Date`, `core:TimeProperty-Year`, `core:NumberProperty`,
  `core:BooleanProperty`, `core:LiteralListProperty`, `core:TreeProperty`, `core:MapProperty`,
  `core:NonSelectableProperty`.
- Options: `core:enableOptional`, `core:enableNegation` (`xsd:boolean`).
