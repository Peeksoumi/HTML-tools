#!/usr/bin/env node
// Tests hors ligne du moteur de la page (réseau simulé) : node test_moteur.js
// Les résultats sont comparés à ceux de sources.py sur les mêmes données.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script id="moteur">([\s\S]*?)<\/script>/)[1];
const m = new Function(script + '\nreturn { SOURCES_TR, rechercheSources, geocoder, cache };')();

const LAT = 47.2184, LON = -1.5536;
const way = (name, tags, n = 20) => ({ type: 'way', tags: { highway: 'residential', name, ...tags },
  geometry: Array.from({ length: n }, (_, i) => ({ lat: LAT + 0.001, lon: LON + i * 0.0002 })) });
const node = (dlat, dlon, tags) => ({ type: 'node', lat: LAT + dlat, lon: LON + dlon, tags: { amenity: 'parking', ...tags } });
const OSM = [
  node(0.001, 0, { name: 'Parking du Stade', fee: 'no', capacity: '120' }),
  node(0.0035, 0, { name: 'Parking Relais Beaujoire', fee: 'no', capacity: '300' }),
  node(0.002, 0, { name: 'Parking Cathédrale', fee: 'yes' }),
  node(0.002, 0, { name: 'Parking privé', fee: 'no', access: 'private' }),
  node(0.002, 0, { name: 'Parking souterrain', parking: 'underground' }),
  node(0.0015, 0, { name: 'Parking sans info' }),
  node(0.0012, 0.005, { capacity: '2' }),
  node(0.0012, 0.008, { capacity: '60', 'addr:street': 'Rue Neuve' }),
  node(-0.004, 0, { parking: 'surface' }),                      // anonyme : géocodage inverse
  way('Rue Large', { 'parking:lane:both': 'parallel', 'parking:condition:both': 'free' }),
  way('Rue Payante', { 'parking:lane:both': 'parallel', 'parking:condition:both': 'ticket' }),
  way('Rue Épis', { 'parking:lane:right': 'perpendicular' }),
  way('Rue Bleue', { 'parking:lane:both': 'parallel', 'parking:condition:both': 'disc' }, 5),
];
const REPONSES = {
  overpass: { elements: OSM },
  nantesmetropole: { results: [{ grp_nom: 'Relais Beaujoire', grp_disponible: 42, grp_exploitation: 310,
    location: { lat: LAT + 0.00355, lon: LON } }] },
  reverse: { address: { road: 'Rue Verte', house_number: '8' } },
  search: [{ display_name: 'Nantes, France', lat: String(LAT), lon: String(LON) }],
};

const appels = [];
const simule = async (url, options) => {
  appels.push({ url, options, t: Date.now() });
  const cle = Object.keys(REPONSES).find(k => url.includes(k));
  if (!cle) throw new TypeError('réseau coupé');
  return { ok: true, json: async () => REPONSES[cle] };
};

const python = `
import json, sys
sys.path.insert(0, sys.argv[1])
import sources
rep = json.loads(sys.stdin.read())
sources.http_json = lambda url, data=None, **k: next(v for c, v in rep.items() if c in url)
print(json.dumps(sources.rechercher(${LAT}, ${LON}, 1000)))`;

(async () => {
  assert.deepStrictEqual(m.SOURCES_TR, JSON.parse(fs.readFileSync(path.join(__dirname, 'sources.json'))).sources);
  assert(!/api\/(recherche|geocode)/.test(html), 'la page ne doit plus appeler le serveur maison');

  global.fetch = simule;
  const g = await m.geocoder('Nantes');
  assert.strictEqual(g[0].lat, LAT);
  const js = await m.rechercheSources(LAT, LON, 1000);
  const py = JSON.parse(execFileSync('python3', ['-B', '-I', '-c', python, __dirname], { input: JSON.stringify(REPONSES) }));
  assert(js.parkings.some(p => p.nom === 'Parking 8 Rue Verte'));
  assert.strictEqual(js.totaux.libres_temps_reel, 42);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(js)), py);

  const nomi = appels.filter(a => a.url.includes('nominatim'));
  for (let i = 1; i < nomi.length; i++) assert(nomi[i].t - nomi[i - 1].t >= 1000, 'Nominatim : 1 requête/s');

  m.cache.clear();
  global.fetch = async () => { throw new TypeError('coupé'); };
  const panne = await m.rechercheSources(10, 10, 500);
  assert(!panne.sources[0].ok);
  assert.strictEqual(panne.totaux.parkings_gratuits, 0);
  console.log('OK');
})().catch(e => { console.error(e); process.exit(1); });
