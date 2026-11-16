// Tests du moteur : node tests/test_core.js   (aucune dépendance)
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const core = require('../src/core.js');
const STATIONS = new Function(fs.readFileSync(path.join(__dirname, '../src/stations-data.js'), 'utf8') + '; return STATIONS;')();
const L = (y, mo, d, hh, mm, off) => Date.UTC(y, mo - 1, d, hh - off, mm); // heure locale Paris -> ms UTC
let ok = 0;
const test = (nom, fn) => { fn(); ok++; console.log('ok -', nom); };

// Horaires publiés (SHOM, relevés sur maree.info / meteoconsult / tidesatlas), heure locale.
const SN = [
  [2026, 8, 5, 2, 'BM', 3, 51], [2026, 8, 5, 2, 'PM', 9, 11], [2026, 8, 5, 2, 'BM', 16, 15], [2026, 8, 5, 2, 'PM', 21, 44],
  [2026, 11, 11, 1, 'PM', 5, 2], [2026, 11, 11, 1, 'BM', 11, 57], [2026, 11, 11, 1, 'PM', 17, 19],
  [2027, 4, 21, 2, 'PM', 5, 26], [2027, 4, 21, 2, 'BM', 12, 12], [2027, 4, 21, 2, 'PM', 17, 41],
];
const NANTES = [ // Nantes (Chantenay), non utilisés pour le calage
  [2026, 8, 5, 2, 'BM', 5, 48], [2026, 8, 5, 2, 'PM', 10, 9], [2026, 8, 5, 2, 'BM', 18, 6],
  [2026, 11, 10, 1, 'BM', 1, 8], [2026, 11, 10, 1, 'PM', 5, 55], [2026, 11, 10, 1, 'BM', 13, 26],
  [2027, 10, 15, 2, 'BM', 1, 40], [2027, 10, 15, 2, 'PM', 6, 20], [2027, 10, 15, 2, 'BM', 14, 2], [2027, 10, 15, 2, 'PM', 18, 41],
];
const plusProche = (liste, type, cible) => liste.filter((x) => x.type === type).sort((a, b) => Math.abs(a.t - cible) - Math.abs(b.t - cible))[0];

test('marée harmonique de Saint-Nazaire à ± 20 min des horaires SHOM', () => {
  const st = core.makeStation(STATIONS.saintNazaire.c);
  for (const [y, mo, d, off, type, hh, mm] of SN) {
    const cible = L(y, mo, d, hh, mm, off);
    const e = plusProche(core.extremes(st, cible - 4 * core.HOUR, cible + 4 * core.HOUR), type, cible);
    assert(Math.abs(e.t - cible) <= 20 * core.MIN, `${y}-${mo}-${d} ${type} ${hh}:${mm} écart ${(e.t - cible) / core.MIN} min`);
  }
});

test('étales de Nantes calées à ± 15 min des horaires publiés (jours hors calage)', () => {
  for (const [y, mo, d, off, type, hh, mm] of NANTES) {
    const t0 = L(y, mo, d, 0, 0, off);
    const r = core.calculSite('nantes', STATIONS, t0, t0 + 24 * core.HOUR, 300);
    const cible = L(y, mo, d, hh, mm, off);
    const e = plusProche(r.marees, type, cible);
    assert(Math.abs(e.t - cible) <= 15 * core.MIN, `${y}-${mo}-${d} ${type} ${hh}:${mm} écart ${(e.t - cible) / core.MIN} min`);
  }
});

test('coefficient de marée proche des valeurs publiées (± 5)', () => {
  const brest = core.makeStation(STATIONS.brest.c);
  const c = core.coefficientAt(brest, L(2026, 11, 11, 5, 2, 1));
  assert(Math.abs(c - 80) <= 5, `coef ${c}`);
  const c2 = core.coefficientAt(brest, L(2027, 4, 21, 5, 26, 2));
  assert(Math.abs(c2 - 95) <= 5, `coef ${c2}`);
});

test('table 5 : valeurs lues aux points de la grille', () => {
  const a = core.table5At('nantes', 'jusant', 70, 200);
  assert.deepStrictEqual([a.min, a.max, a.v], [20, 30, 2.0]);
  const b = core.table5At('cordemais', 'flot', 95, 1000);
  assert.deepStrictEqual([b.min, b.max, b.v], [30, 50, 2.6]);
});

test('table 5 : interpolation entre deux coefficients et deux débits', () => {
  const a = core.table5At('nantes', 'jusant', 82.5, 200); // entre 70 (20-30 min) et 95 (15-30 min)
  assert(a.min > 15 && a.min < 20, `min ${a.min}`);
  assert.strictEqual(a.max, 30);
  const m = core.table5At('nantes', 'flot', 70, 600); // entre 200 et 1000
  assert(m.v > 1.6 && m.v < 2.2);
});

test('crue (3 000 m³/s) : plus de flot à Nantes ; à 300 m³/s il existe', () => {
  const t0 = L(2026, 11, 16, 0, 0, 1);
  const n = core.calculSite('nantes', STATIONS, t0, t0 + 24 * core.HOUR, 3000);
  assert(n.renverses.filter((r) => r.type === 'flot').every((r) => r.absent));
  const n0 = core.calculSite('nantes', STATIONS, t0, t0 + 24 * core.HOUR, 300);
  assert(n0.renverses.some((r) => r.type === 'flot' && !r.absent));
});

test('les renverses alternent flot / jusant et suivent les étales', () => {
  const t0 = L(2026, 11, 20, 0, 0, 1);
  for (const id of ['lola', 'nantes']) {
    const r = core.calculSite(id, STATIONS, t0, t0 + 72 * core.HOUR, 400);
    const ev = r.renverses.filter((x) => !x.absent).sort((a, b) => a.t - b.t);
    assert(ev.length >= 8, `${id}: ${ev.length} renverses`);
    ev.forEach((e, i) => { if (i) assert.notStrictEqual(e.type, ev[i - 1].type, `${id} renverses consécutives de même sens`); });
    for (const e of ev) {
      const etale = r.marees.filter((m) => m.type === (e.type === 'flot' ? 'BM' : 'PM')).sort((a, b) => Math.abs(a.t - e.t) - Math.abs(b.t - e.t))[0];
      assert(e.t - etale.t >= -35 * core.MIN && e.t - etale.t <= 130 * core.MIN, `${id} ${e.type}: ${(e.t - etale.t) / core.MIN} min après l'étale`);
    }
  }
});

test('Lola précède Nantes (la marée arrive d\'abord à Lola)', () => {
  const t0 = L(2026, 11, 20, 0, 0, 1);
  const a = core.calculSite('lola', STATIONS, t0, t0 + 48 * core.HOUR, 400).marees;
  const b = core.calculSite('nantes', STATIONS, t0, t0 + 48 * core.HOUR, 400).marees;
  for (const m of a) {
    const n = plusProche(b, m.type, m.t);
    assert(n.t - m.t >= 0 && n.t - m.t <= 60 * core.MIN, `${m.type}: Nantes ${(n.t - m.t) / core.MIN} min après Lola`);
  }
});

console.log(`\n${ok} tests réussis`);
