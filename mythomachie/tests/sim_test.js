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
for (let s = 0; s < 20 * 60 * 20 && !vm.runInContext('G.over', ctx); s++) vm.runInContext('tick(0.05)', ctx);
const r = vm.runInContext(`({ t: G.time, over: G.over, bad: G.units.filter(u => !isFinite(u.x) || !isFinite(u.y) || !isFinite(u.hp)).length,
  waves: G.ai.reduce((n, a) => n + a.waveN, 0), kills: G.pl.reduce((n, p) => n + p.stats.kills, 0), gathered: G.pl.map(p => Math.round(p.stats.gathered)) })`, ctx);
console.log(JSON.stringify(r), ((Date.now() - t0) / 1000).toFixed(1) + ' s');
if (r.bad || r.waves < 2 || r.kills < 10 || r.gathered.some(g => g < 3000)) { console.error('ÉCHEC'); process.exit(1); }
console.log('OK');
