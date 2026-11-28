// Tracé bleu partiellement vu à travers un voile sombre (bouton lecture d'une vidéo) : il doit rester entier.
// Usage : node tests/voile_test.js
const { Core } = require('../src/core.js');
const w = 600, h = 1200, d = new Uint8ClampedArray(w * h * 4);
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  let c = [225, 228, 195];
  if (y >= 100 && y <= 1100 && Math.abs(x - (300 + 60 * Math.sin(y / 30))) <= 8 * Math.hypot(1, 2 * Math.cos(y / 30))) c = [29, 70, 182];
  if (y > 460 && y < 700) c = c.map(v => v / 2);   // voile à 50 % sur le milieu du tracé (un quart de sa hauteur)
  d.set([...c, 255], (y * w + x) * 4);
}
const r = Core.extractRoute(d, w, h, Core.autoColor(d, w, h));
const ys = r.route.map(p => p[1]), ok = Math.min(...ys) < 130 && Math.max(...ys) > 1070 && Core.plen(r.route) > 1580;
console.log(ok ? 'OK' : 'ÉCHEC', 'y', Math.min(...ys), '→', Math.max(...ys), 'longueur', Core.plen(r.route).toFixed(0));
process.exit(ok ? 0 : 1);
