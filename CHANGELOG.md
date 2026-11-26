<!-- markdownlint-disable MD012 MD013 MD024 MD033 -->
# Change Log

All notable changes to this Corporate Memory marketplace package will be documented in this file.
If the package contains content from external sources, the release notes of these sources are not copied here.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/)

## [14.1.0-2] 2026-11-26

### Added

- *Open in query editor* link above the results: opens the generated query (with `FROM <graph>`) in the query module
- query module enabled in the *Search* application view


## [14.1.0-1] 2026-11-26

First release, based on Sparnatural 14.1.0.

### Added

- application view *Search* with the query builder as first screen (integrations module), Explore and BKE
- Sparnatural 14.1.0 page, served from the Build project *Sparnatural Service*
- zero configuration: types, properties, labels from the data of the chosen graph (incl. `owl:imports`)
- shapes win: node and property shapes of the CMEM Shapes Catalog define what is offered (all or nothing)
- icons from `foaf:depiction` of shapes and classes
- result links to Explore (and optional further targets such as BKE) in the current application view
- modes *Shaped* (shapes win, default) and *Raw* (all data, shapes ignored), selectable in the header
- graph picker as an `owl:imports` tree, system graphs last; per-user configuration cache with *Rebuild*, optional SPARQL view
- maps: *Map* results tab for WKT and lat/long results, area filter for `geo:wktLiteral` properties (GeoSPARQL)
- CMEM look (colors taken from the surrounding CMEM page)
