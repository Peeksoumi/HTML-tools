// Simulation sans navigateur : une partie IA contre IA de 20 minutes doit rester cohérente.
// Usage : node tests/sim_test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const dir = path.join(__dirname, '..', 'src', 'js');
const files = fs.readdirSync(dir).filter(f => /^0[0-6]-.*\.js$/.test(f)).sort();
const ctx = { console, Date, btoa, atob, performance };
vm.createContext(ctx);
vm.runInContext(files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n'), ctx);
vm.runInContext("setupGame({ map: 'medium', ais: 1, diff: 'normal', patron: 'zeus', seed: 12345 }); G.headless = true; G.ai.unshift(aiCreate(G.pl[0]));", ctx);
const t0 = Date.now();
vm.runInContext('var AGE_T = G.pl.map(() => [0, null, null]);', ctx);
for (let s = 0; s < 20 * 60 * 20 && !vm.runInContext('G.over', ctx); s++) {
  vm.runInContext('tick(0.05)', ctx);
  if (s % 20 === 0) vm.runInContext('G.pl.forEach((p, i) => { const a = ageOf(p); if (AGE_T[i][a] == null) AGE_T[i][a] = Math.round(G.time); });', ctx);
}
const r = vm.runInContext(`({ t: G.time, over: G.over, bad: G.units.filter(u => !isFinite(u.x) || !isFinite(u.y) || !isFinite(u.hp)).length,
  waves: G.ai.reduce((n, a) => n + a.waveN, 0), kills: G.pl.reduce((n, p) => n + p.stats.kills, 0), gathered: G.pl.map(p => Math.round(p.stats.gathered)),
  ages: AGE_T, tech: G.pl.map(p => Object.keys(p.tech).length), trained: G.pl.map(p => p.stats.trained) })`, ctx);
console.log(JSON.stringify(r), ((Date.now() - t0) / 1000).toFixed(1) + ' s');
// Chaque IA doit passer à l'Âge des Cités ; l'une au moins doit atteindre l'Âge des Prodiges.
const agesOk = r.ages.every(a => a[1] != null && a[1] < 600) && r.ages.some(a => a[2] != null && a[2] < 1100);
if (r.bad || r.waves < 2 || r.kills < 10 || r.gathered.some(g => g < 3000) || !agesOk) { console.error('ÉCHEC'); process.exit(1); }
console.log('OK');
