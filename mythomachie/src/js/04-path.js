/* ===== Recherche de chemin (A* sur la grille, 8 directions) ===== */
const PF = { n: 0, g: null, came: null, seen: null, closed: null, sid: 0, hN: null, hF: null, hLen: 0 };
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
function pfInit() {
  const n = G.W * G.H; PF.n = n;
  PF.g = new Float32Array(n); PF.came = new Int32Array(n); PF.seen = new Uint32Array(n); PF.closed = new Uint32Array(n); PF.sid = 0;
  PF.hN = new Int32Array(n * 8 + 16); PF.hF = new Float32Array(n * 8 + 16);
}
function hPush(node, f) {
  let i = PF.hLen++; const N = PF.hN, F = PF.hF;
  while (i > 0) { const p = (i - 1) >> 1; if (F[p] <= f) break; N[i] = N[p]; F[i] = F[p]; i = p; }
  N[i] = node; F[i] = f;
}
function hPop() {
  const N = PF.hN, F = PF.hF; const top = N[0]; const len = --PF.hLen;
  if (len > 0) {
    const ln = N[len], lf = F[len]; let i = 0;
    for (;;) {
      let l = 2 * i + 1; if (l >= len) break;
      const r = l + 1; if (r < len && F[r] < F[l]) l = r;
      if (F[l] >= lf) break;
      N[i] = N[l]; F[i] = F[l]; i = l;
    }
    N[i] = ln; F[i] = lf;
  }
  return top;
}
function astar(sx, sy, goal, hx, hy, maxExp) {
  const W = G.W, H = G.H, blk = G.blk; const sid = ++PF.sid; PF.hLen = 0;
  const start = sy * W + sx;
  const hf = (x, y) => { const dx = Math.abs(x - hx), dy = Math.abs(y - hy); return dx + dy + (SQ2 - 2) * Math.min(dx, dy); };
  PF.seen[start] = sid; PF.g[start] = 0; PF.came[start] = -1; hPush(start, hf(sx, sy));
  let best = start, bestH = 1e9, exp = 0, found = -1;
  while (PF.hLen > 0) {
    const cur = hPop();
    if (PF.closed[cur] === sid) continue;
    PF.closed[cur] = sid;
    const cx = cur % W, cy = (cur / W) | 0;
    if (goal(cx, cy)) { found = cur; break; }
    const h = hf(cx, cy); if (h < bestH) { bestH = h; best = cur; }
    if (++exp > maxExp) break;
    const gc = PF.g[cur];
    for (let k = 0; k < 8; k++) {
      const D = DIRS[k]; const nx = cx + D[0], ny = cy + D[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (blk[ni] || PF.closed[ni] === sid) continue;
      if (k >= 4 && (blk[cy * W + nx] || blk[ny * W + cx])) continue;
      const ng = gc + D[2];
      if (PF.seen[ni] !== sid || ng < PF.g[ni]) { PF.seen[ni] = sid; PF.g[ni] = ng; PF.came[ni] = cur; hPush(ni, ng + hf(nx, ny) * 1.001); }
    }
  }
  const end = found >= 0 ? found : best;
  const out = []; let c = end;
  while (c !== start && c >= 0) { out.push(c); c = PF.came[c]; }
  out.reverse();
  return { tiles: out, found: found >= 0 };
}
function walkableAt(x, y) {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= G.W || ty >= G.H) return false;
  return !G.blk[ty * G.W + tx];
}
function los(x0, y0, x1, y1, r) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy); const n = Math.ceil(d / 8);
  for (let i = 1; i <= n; i++) {
    const t = i / n, x = x0 + dx * t, y = y0 + dy * t;
    if (!walkableAt(x - r, y - r) || !walkableAt(x + r, y - r) || !walkableAt(x - r, y + r) || !walkableAt(x + r, y + r)) return false;
  }
  return true;
}
function smoothPath(x0, y0, pts) {
  const out = []; let cx = x0, cy = y0, i = 0; const n = pts.length;
  while (i < n) {
    let j = i; const lim = Math.min(n - 1, i + 10);
    for (let k = lim; k > i; k--) { if (los(cx, cy, pts[k][0], pts[k][1], 6)) { j = k; break; } }
    out.push(pts[j]); cx = pts[j][0]; cy = pts[j][1]; i = j + 1;
  }
  return out;
}
function requestPath(u, goal) {
  u.goal = goal;
  if (!u.needPath) { u.needPath = true; G.pathQ.push(u.id); }
}
const nowMs = (typeof performance !== 'undefined' && performance.now) ? () => performance.now() : () => Date.now();
function processPaths() {
  let budget = 24; const t0 = nowMs();
  while (budget > 0 && G.pathQ.length && nowMs() - t0 < 5) {
    const id = G.pathQ.shift(); const u = G.byId.get(id);
    if (!u || u.dead || !u.needPath) continue;
    u.needPath = false; computePath(u); budget--;
  }
}
function computePath(u) {
  const g = u.goal; u.pi = 0;
  if (!g) { u.path = null; return; }
  const W = G.W;
  const sx = clamp(Math.floor(u.x / T), 0, G.W - 1), sy = clamp(Math.floor(u.y / T), 0, G.H - 1);
  let goalFn, hx, hy, finalPt = null;
  let k = g.k, rect = null;
  if (k === 'ent') {
    const e = G.byId.get(g.id); if (!e) { u.path = null; return; }
    if (e.k === 'u') { k = 'near'; g.x = e.x; g.y = e.y; } else { k = 'rect'; rect = [e.tx, e.ty, e.size, e.size]; }
  }
  if (k === 'rect') rect = rect || [g.tx, g.ty, g.w, g.h];
  if (k === 'in') rect = [g.tx, g.ty, g.w, g.h];
  if (U[u.t].fly) {
    let fx, fy;
    if (k === 'pt' || k === 'near') { fx = g.x; fy = g.y; }
    else { fx = clamp(u.x, rect[0] * T - 8, (rect[0] + rect[2]) * T + 8); fy = clamp(u.y, rect[1] * T - 8, (rect[1] + rect[3]) * T + 8); }
    u.path = [[clamp(fx, 8, G.W * T - 8), clamp(fy, 8, G.H * T - 8)]]; return;
  }
  if (k === 'pt' || k === 'near') {
    let gx = clamp(Math.floor(g.x / T), 0, G.W - 1), gy = clamp(Math.floor(g.y / T), 0, G.H - 1);
    if (G.blk[gy * W + gx]) { const f = nearestFree(gx, gy, 10); if (f) { gx = f[0]; gy = f[1]; } finalPt = [gx * T + T / 2, gy * T + T / 2]; }
    else finalPt = [g.x, g.y];
    if (k === 'near') goalFn = (x, y) => Math.abs(x - gx) <= 1 && Math.abs(y - gy) <= 1;
    else goalFn = (x, y) => x === gx && y === gy;
    hx = gx; hy = gy;
  } else if (k === 'rect') {
    const [tx, ty, w, h] = rect;
    goalFn = (x, y) => x >= tx - 1 && x <= tx + w && y >= ty - 1 && y <= ty + h;
    hx = tx + (w - 1) / 2; hy = ty + (h - 1) / 2;
  } else if (k === 'in') {
    const [tx, ty, w, h] = rect;
    goalFn = (x, y) => x >= tx && x < tx + w && y >= ty && y < ty + h;
    hx = tx + (w - 1) / 2; hy = ty + (h - 1) / 2;
    finalPt = [(tx + w / 2) * T + (g.fx || 0), (ty + h / 2) * T + (g.fy || 0)];
  }
  // cible inaccessible depuis cette composante : inutile de chercher
  ensureComp();
  const sc = G.comp[sy * W + sx];
  u.noPath = false;
  if (sc && (k === 'rect' || k === 'in' || k === 'near')) {
    let ok = false;
    if (k === 'near') { const gx = clamp(Math.floor(g.x / T), 0, G.W - 1), gy = clamp(Math.floor(g.y / T), 0, G.H - 1); for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1; dx++) { const x = gx + dx, y = gy + dy; if (inb(x, y) && G.comp[idx(x, y)] === sc) { ok = true; break; } } }
    else if (k === 'in') { for (let y = rect[1]; y < rect[1] + rect[3] && !ok; y++) for (let x = rect[0]; x < rect[0] + rect[2]; x++) if (G.comp[idx(x, y)] === sc) { ok = true; break; } }
    else ok = rectReachable(rect[0], rect[1], rect[2], rect[3], sc);
    if (!ok) { u.path = []; u.noPath = true; return; }
  }
  const res = astar(sx, sy, goalFn, hx, hy, 9000);
  const pts = res.tiles.map(i => [(i % W) * T + T / 2, ((i / W) | 0) * T + T / 2]);
  if (finalPt && res.found) { if (pts.length) pts[pts.length - 1] = finalPt; else pts.push(finalPt); }
  u.path = pts.length ? smoothPath(u.x, u.y, pts) : [];
}
