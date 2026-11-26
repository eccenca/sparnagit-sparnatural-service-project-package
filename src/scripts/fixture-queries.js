// Writes the fixture queries (with FROM <graph>) as .rq files into the given directory.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const stats = require('../lib/stats.js');
const sparql = require('../lib/sparql.js');
const [graph, dir] = process.argv.slice(2);
const from = (q, g) => q.replace(/\nSELECT|^SELECT/, (m) => m).replace(/WHERE \{/, `FROM ${sparql.iriRef(g)} WHERE {`);
const write = (name, q) => fs.writeFileSync(path.join(dir, name + '.rq'), q);
write('prod-inst-classes', from(stats.classesQuery(), graph));
write('prod-inst-properties', from(stats.propertiesQuery(), graph));
// labels of the classes and paths found in the recorded data: computed from a live run is not possible
// here without results, so use the classes and property fixtures if they exist already.
const fx = (n) => path.join(__dirname, '..', 'test', 'fixtures', n + '.json');
if (fs.existsSync(fx('prod-inst-classes')) && fs.existsSync(fx('prod-inst-properties'))) {
  const classes = stats.parseClasses(JSON.parse(fs.readFileSync(fx('prod-inst-classes'))));
  const props = stats.parseProperties(JSON.parse(fs.readFileSync(fx('prod-inst-properties'))));
  const iris = [...new Set([...classes.map((c) => c.iri), ...props.map((p) => p.path)])].slice(0, 200);
  write('prod-inst-labels', from(stats.labelsQuery(iris, 'en'), graph));
}
if (fs.existsSync(path.join(__dirname, '..', 'lib', 'shapes.js')) && fs.existsSync(fx('prod-inst-classes'))) {
  const shapes = require('../lib/shapes.js');
  const classes = stats.parseClasses(JSON.parse(fs.readFileSync(fx('prod-inst-classes'))));
  write('catalog-shapes-prod', from(shapes.shapesQuery(classes.map((c) => c.iri)), shapes.CATALOG));
}
