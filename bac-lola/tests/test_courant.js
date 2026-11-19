// Test du calcul de changement de courant : node tests/test_courant.js
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
// 1. le bloc inliné est à jour avec courant-loire et le wrapper
const cl = path.join(__dirname, '..', '..', 'courant-loire', 'src');
const attendu = fs.readFileSync(path.join(cl, 'stations-data.js'), 'utf8') + '\n' + fs.readFileSync(path.join(cl, 'core.js'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, '..', 'src', 'courant-wrapper.js'), 'utf8');
assert(script.includes(attendu), "bloc COURANT périmé : lancer python3 inject_courant.py");
console.log('ok - bloc inliné identique à courant-loire/src + src/courant-wrapper.js');
// 2. exécution du bloc seul
const bloc = script.match(/\/\*COURANT-DEBUT[\s\S]*?\/\*COURANT-FIN\*\//)[0];
const ctx = { Math, Date, Object, Array, Number, String, Set, JSON, isFinite };
vm.createContext(ctx); vm.runInContext(bloc + '\nthis.C=COURANT;', ctx);
const C = ctx.C;
// 3. renverses mesurées par la trajectoire du bac (UTC) : écart au calcul
const mesures = [['2026-11-13T19:18','jusant'],['2026-11-14T07:29','jusant'],['2026-11-14T19:47','jusant'],['2026-11-15T08:08','jusant'],['2026-11-16T08:54','jusant'],['2026-11-16T16:32','flot'],['2026-11-17T09:51','jusant'],['2026-11-17T17:58','flot'],['2026-11-18T06:28','flot'],['2026-11-18T11:26','jusant'],['2026-11-19T06:59','flot'],['2026-11-19T13:11','jusant']];
const ecarts = mesures.map(([d, type]) => {
  const t = Date.parse(d + ':00Z');
  const r = C.renverses(t).filter((x) => x.type === type).reduce((b, x) => (Math.abs(x.t - t) < Math.abs(b.t - t) ? x : b));
  return Math.abs(r.t - t) / 60000;
});
const mae = ecarts.reduce((s, x) => s + x, 0) / ecarts.length;
console.log('écarts (min) :', ecarts.map(Math.round).join(' '), '· moyenne', mae.toFixed(1));
assert(mae < 18, 'écart moyen trop grand : ' + mae);
assert(Math.max(...ecarts) < 55, 'écart max trop grand');
console.log('ok - 12 renverses mesurées : écart moyen ' + mae.toFixed(0) + ' min (< 18), max ' + Math.round(Math.max(...ecarts)) + ' min (< 55)');
// 4. alternance flot / jusant et phases
const now = Date.parse('2026-11-19T12:00:00Z');
const L = C.renverses(now);
assert(L.length >= 6, 'au moins 6 renverses sur 54 h');
for (let i = 1; i < L.length; i++) { assert(L[i].type !== L[i - 1].type, 'alternance flot/jusant'); const h = (L[i].t - L[i - 1].t) / 3.6e6; assert(h > 3.5 && h < 9.5, 'intervalle plausible : ' + h.toFixed(1) + ' h'); }
console.log('ok - renverses alternées, intervalles entre 3,5 h et 9,5 h');
const r = L.find((x) => x.t > now), U = r.incert * 60000;
const phase = (t) => C.etatCourant(t).phase;
assert.strictEqual(phase(r.t - 85 * 60000), 'avant'); assert.strictEqual(phase(r.t - 10 * 60000), 'en_cours'); assert.strictEqual(phase(r.t + 10 * 60000), 'en_cours');
assert.strictEqual(phase(r.t + U + 10 * 60000), 'apres'); assert.strictEqual(phase(r.t + 60 * 60000), 'calme');
assert.strictEqual(C.etatCourant(r.t - 10 * 60000).sens, r.type === 'flot' ? 'jusant' : 'flot');
assert(C.renverseProche(r.t + 5 * 60000, now) && !C.renverseProche(r.t + 60 * 60000, now));
console.log('ok - phases avant / en cours / après / calme et sens du courant');

// 5. équation : débit mensuel par la date, coefficient de marée, valeurs de référence
const d0 = (iso) => C.debitDuMois(Date.parse(iso));
assert(d0('2027-01-15T12:00:00Z') === 1450 && d0('2026-08-15T12:00:00Z') === 246 && d0('2026-11-30T12:00:00Z') === 775 && d0('2026-12-01T12:00:00Z') === 1160);
const lag = C.lagRenverse;
// Q = 308, C = 50 : flot 30,2 − 7,4 + 8,2 = 31,0 ; jusant 34,3 + 4,2 − 4,8 = 33,7
assert(Math.abs(lag('flot', 308, 50) - 31.0) < 0.1 && Math.abs(lag('jusant', 308, 50) - 33.7) < 0.1);
// plus le débit est fort, plus le flot est précoce et le jusant tardif ; plus le coefficient est fort, plus le flot est tardif et le jusant précoce
assert(lag('flot', 1400, 70) < lag('flot', 300, 70) && lag('jusant', 1400, 70) > lag('jusant', 300, 70));
assert(lag('flot', 600, 95) > lag('flot', 600, 45) && lag('jusant', 600, 95) < lag('jusant', 600, 45));
for (const d of ['2027-01-15T12:00:00Z', '2027-07-15T12:00:00Z']) {
  const Lr = C.renverses(Date.parse(d));
  assert(Lr.length >= 6);
  for (let i = 1; i < Lr.length; i++) { assert(Lr[i].type !== Lr[i - 1].type); const h = (Lr[i].t - Lr[i - 1].t) / 3.6e6; assert(h > 3 && h < 10, d + ' intervalle ' + h.toFixed(1) + ' h'); }
  assert(Lr.every((x) => x.Q === d0(d) && x.incert === (x.Q <= 1000 ? 20 : 30)));
}
// 6. sens du courant à un instant donné
const n6 = Date.parse('2026-11-19T12:00:00Z'), L6 = C.renverses(n6), r6 = L6.find((x) => x.t > n6);
assert.strictEqual(C.sensA(r6.t + 20 * 60000, n6), r6.type);
assert.strictEqual(C.sensA(r6.t - 20 * 60000, n6), r6.type === 'flot' ? 'jusant' : 'flot');
console.log('ok - équation : débit mensuel par la date, coefficient, sens du courant');
