<!-- markdownlint-disable MD013 MD041 -->
<!--
    This Markdown DOCUMENTATION is shipped with the package.

    Start this Markdown with additional package details, not with the package
    name or description. The marketplace frontend already displays `package_name`
    and `package_description` before this content.
-->

This package brings [Sparnatural](https://sparnatural.eu/), a visual query builder for knowledge graphs, into
Corporate Memory. Domain users find resources by their types, properties and relations, step by step, without
writing SPARQL. Nobody has to write a Sparnatural configuration: the query builder configures itself from the data
of the chosen graph, and from the CMEM shapes wherever they exist.

The package installs:

- **Application view *Search*** (`sparnatural`): the query builder is the first screen (integrations module first),
  next to Explore and the Business Knowledge Editor (BKE).
- **Build project *Sparnatural Service*** (`sparnatural-service`): serves the page
  `/dataintegration/workspace/projects/sparnatural-service/browse/sparnatural.html` and the libraries it needs. No
  server-side component, no Python plugin.

## How it works

1. Pick a **graph** (or keep *All graphs*). A graph includes the graphs it imports (`owl:imports`), as everywhere in
   Corporate Memory; the picker shows this as a tree (imported graphs below their importing graph), with system and
   Build project graphs at the end.
2. The page reads which **types** (classes) have resources in the graph, which **properties** connect them, and
   their labels and icons.
3. **Mode *Shaped* (default) — shapes win:** if the central *CMEM Shapes Catalog* (`https://vocab.eccenca.com/shacl/`
   and its imports) has a node shape for at least one of these types, the query builder offers exactly the shaped
   types and their property shapes (names, order and ranges from the shapes) and hides everything else. Without
   applicable shapes it offers every type and property found in the data.
   **Mode *Raw*:** ignores the shapes and offers every type, relation and value property found in the data — useful
   when the shapes are incomplete. Switch with the *Mode* selector in the header.
4. **Icons** come from `foaf:depiction` (image URL) of the node shape, else of the class — the usual CMEM way to
   declare icons. A Sparnatural `volipi:iconName` (Font Awesome class) is used when there is no depiction.
5. Value properties (text, numbers, dates, yes/no) are listed under the pseudo-types *Text*, *Number*, *Date* … in
   the second dropdown: for example *Hardware → Number → width (mm)*.
6. Results show **labels**; every resource links to **Explore**, with a **BKE** button next to it (new tab, same
   application view, same graph).

Everything runs in the browser with the session of the logged-in user, so Corporate Memory's access rules apply to
the configuration and to every result.

### Maps

- **Map of results:** the *Map* tab next to *Table* shows results that contain geometries:
  - values of type `geo:wktLiteral` (GeoSPARQL WKT, e.g. via `geo:asWKT`), or
  - a latitude and a longitude column (properties whose name contains *lat* / *long*, e.g. `wgs84_pos:lat` and
    `wgs84_pos:long`).

  Add these properties to the search (e.g. *Supplier → Text → lat* and, with *And*, *Supplier → Text → long*, each
  with *Any*) and make them visible with the eye icon, then open *Map*.
- **Filter by area:** properties with `geo:wktLiteral` values appear as the type *Location*; *Open Map* lets you draw
  a rectangle or polygon, and the search keeps only geometries within it (GeoSPARQL `geof:sfWithin`). This needs a
  store with GeoSPARQL support (GraphDB: GeoSPARQL plugin enabled).
- The background maps are loaded from `tile.openstreetmap.org`. In networks without internet access the map shows
  the geometries without background tiles.

### Configuration cache and *Rebuild*

The generated configuration is kept in the browser for 24 hours, per user, graph and language. The header shows when
it was built. Click **Rebuild** after data or shapes have changed.

## Use it in your own application view

Add a tab to the integrations module of any application view and point it to the page. Parameters go after `#`
(query parameters `?…` work as well):

```text
/dataintegration/workspace/projects/sparnatural-service/browse/sparnatural.html#graph=http://example.org/my-graph/
```

| Parameter | Default | Effect |
|---|---|---|
| `graph` | none (all graphs) | Context graph. With a graph, the graph picker is hidden. |
| `picker` | `true` without `graph`, else `false` | Show the graph picker. |
| `mode` | `shaped` | `raw`: ignore the shapes, configure from all data (`shapes=off` works as well). |
| `sparql` | `false` | `true`: show the generated SPARQL query. |
| `lang` | browser language | Language of labels (the Sparnatural interface itself exists in English and French). |
| `limit` | `1000` | Maximum number of results. |
| `links` | Explore and BKE (see below) | Link targets per result, see below. |

Set the integrations module's `order` to a negative number (for example `-10`) to make the query builder the first
screen of the view.

### Several links per result

`links` is a `|`-separated list of `Name=URL template` pairs with the placeholders `{view}` (current application
view), `{graph}` and `{resource}`. The first target is the link of the result itself, the others are shown as small
buttons next to it. The default is Explore plus a *BKE* button for the Business Knowledge Editor (encode the value in a
URL; use only the Explore part in views without BKE):

```text
links=Explore=/{view}/explore?graph={graph}&resource={resource}|BKE=/{view}/bke/new?graph={graph}&resourceIri={resource}
```

With *All graphs*, a link looks up a graph that contains the resource when it is clicked, because Explore and BKE need
a graph.

## Requirements and notes

- The page uses the Corporate Memory sign-in. Opened directly (not in the *Search* view) without an active knowledge
  graph session, it asks you to sign in to Corporate Memory first.
- Corporate Memory 26.2 or later (application views in packages), `cmemc` 26.2.3 or later to install.
- Everything the page needs is part of the package (works in closed networks), except the map background tiles
  (`tile.openstreetmap.org`). Icons declared with `foaf:depiction` are loaded from wherever their URL points to.
- Large stores: the first configuration of *All graphs* reads statistics over the whole store; each query stops after
  60 seconds with a message. Choose a graph to get a smaller, faster configuration.

## Credits

[Sparnatural](https://github.com/sparna-git/Sparnatural) is developed by [Sparna](https://sparna.fr/), mainly by
[Thomas Francart](https://github.com/tfrancart) and [Tarek Bouzelat](https://github.com/BouzelatTarek). This package
integrates it into Corporate Memory. The package version follows Sparnatural's version plus a package revision
(e.g. `14.1.0-1`).

## Third-party software

The project resources contain unmodified copies of:

| Component | Version | License |
|---|---|---|
| [Sparnatural](https://github.com/sparna-git/Sparnatural) | 14.1.0 | GNU LGPL-3.0 |
| [Sparnatural yasgui plugins](https://github.com/sparna-git/Sparnatural-yasgui-plugins) | as shipped with Sparnatural 14.1.0 | ISC |
| [@triply/yasgui](https://www.npmjs.com/package/@triply/yasgui) | 4.2.28 | MIT |
| [Font Awesome Free](https://fontawesome.com/) | 6.4.0 | Icons CC BY 4.0, fonts SIL OFL 1.1, code MIT |

Sparnatural is a library under the GNU Lesser General Public License 3.0. This package (Apache-2.0) uses it
unchanged, in its own files under `vendor/sparnatural/` with the license texts; you may replace these files with
another build of Sparnatural. The source code is available at
[github.com/sparna-git/Sparnatural/tree/14.1.0](https://github.com/sparna-git/Sparnatural/tree/14.1.0).
