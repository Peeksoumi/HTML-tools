// Teste les fonctions pures de meteo-radar/index.html (bloc ==CORE==). Usage : node tests/test_core.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const core = html.split('// ==CORE==')[1].split('// ==/CORE==')[0];
const { STEP, latestCandidates, windToDisplacement, interpWind, wmsUrl, buildFrames, rainTileUrl, buildRainFrames, metersToPixels } =
  new Function(core + '; return { STEP, latestCandidates, windToDisplacement, interpWind, wmsUrl, buildFrames, rainTileUrl, buildRainFrames, metersToPixels };')();
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, a + ' ≠ ' + b);

// candidats : alignés sur 10 min, décroissants, en retard d'au moins 12 min
const now = Date.UTC(2026, 10, 17, 7, 14);
const c = latestCandidates(now, 3);
assert.strictEqual(new Date(c[0]).toISOString(), '2026-11-17T07:00:00.000Z');
assert.strictEqual(c[0] - c[1], STEP);
assert.ok(c[0] <= now - 12 * 60e3);

// vent d'ouest (venant de 270°) 10 m/s pendant 600 s : nuages vers l'est de 6 km
let d = windToDisplacement(10, 270, 600);
near(d.dx, 6000); near(d.dy, 0, 1e-9);
// vent du sud (180°) : nuages vers le nord
d = windToDisplacement(10, 180, 600);
near(d.dx, 0, 1e-9); near(d.dy, 6000);

// interpolation horaire
const t0 = Date.UTC(2026, 10, 17, 7), t1 = t0 + 3600e3;
let w = interpWind([t0, t1], [10, 10], [270, 270], t0 + 1800e3);
near(w.speed, 10); near(w.dirFrom, 270, 1e-9);
w = interpWind([t0, t1], [10, 20], [270, 270], t0 + 1800e3);
near(w.speed, 15);
w = interpWind([t0, t1], [10, 20], [270, 270], t0 - 5e6); // avant la série : première valeur
near(w.speed, 10);
w = interpWind([t0, t1], [10, 20], [270, 270], t1 + 5e6); // après : dernière valeur
near(w.speed, 20);

// URL WMS
const u = wmsUrl('https://x/wms', 'mtg_fd:ir105_hrfi', [1, 2, 3, 4], 100, 50, Date.UTC(2026, 10, 17, 7));
assert.ok(u.includes('crs=EPSG%3A3857') && u.includes('bbox=1.0,2.0,3.0,4.0') && u.includes('time=2026-11-17T07%3A00%3A00.000Z'), u);

// images : 6 observées puis 2 estimées
const f = buildFrames(c[0], now);
assert.strictEqual(f.length, 8);
assert.deepStrictEqual(f.map(x => x.kind), ['obs', 'obs', 'obs', 'obs', 'obs', 'obs', 'est', 'est']);
assert.strictEqual(f[5].t, c[0]);
assert.strictEqual(f[7].t - f[6].t, STEP);

// pluie : 6 dernières images radar + 2 estimées à partir de la dernière
const past = Array.from({ length: 12 }, (_, i) => ({ time: 1000 + i * 600, path: '/v2/radar/h' + i }));
const rf = buildRainFrames(past, now);
assert.strictEqual(rf.length, 8);
assert.deepStrictEqual(rf.map(x => x.kind), ['obs', 'obs', 'obs', 'obs', 'obs', 'obs', 'est', 'est']);
assert.strictEqual(rf[0].path, '/v2/radar/h6');
assert.strictEqual(rf[5].t, (1000 + 11 * 600) * 1000);
assert.strictEqual(rf[6].path, '/v2/radar/h11'); assert.strictEqual(rf[7].path, '/v2/radar/h11');
assert.strictEqual(rainTileUrl('https://h', '/v2/radar/x'), 'https://h/v2/radar/x/512/{z}/{x}/{y}/2/1_1.png');

// mètres → pixels : à l'équateur, zoom 0, 156543 m/px ; vers l'est = +x ; vers le nord = −y
let o = metersToPixels(156543.03392, 156543.03392, 0, 0);
near(o.px, 1, 1e-6); near(o.py, -1, 1e-6);
o = metersToPixels(1000, 0, 8, 60); // cos 60° = 0,5 → 39,1 m/px
near(o.px, 1000 / (156543.03392 * 0.5 / 256), 1e-6);
console.log('OK');
