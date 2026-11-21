/* ===== État, entités, géométrie, commandes ===== */
let G = null;
const idx = (x, y) => y * G.W + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < G.W && y < G.H;

function newState(opts) {
  return {
    opts, time: 0, nextId: 1, list: [], units: [], blds: [], ress: [], byId: new Map(),
    pl: [], ai: [], proj: [], fx: [], parts: [], zones: [], timers: [], pathQ: [],
    sel: [], speed: 1, paused: false, over: false, fogT: 0, vicT: 1, dirty: false, autoT: 45,
    hints: 0, groups: {}, cam: { x: 0, y: 0, z: 1 }, revealAll: false, fogDirty: true,
  };
}
function makePlayer(i, patron, ai, diff, name) {
  return {
    i, patron, ai, diff, name, color: TEAM[i], res: { food: 300, wood: 250, gold: 150, foi: 0 }, tech: {}, cd: {},
    defeated: false, popUsed: 0, popCap: 0, alertT: -99,
    stats: { gathered: 0, trained: 0, lost: 0, kills: 0, bBuilt: 0, bLost: 0, bKilled: 0 },
  };
}
function addEnt(e) {
  e.id = G.nextId++; e.dead = false;
  G.list.push(e); G.byId.set(e.id, e);
  (e.k === 'u' ? G.units : e.k === 'b' ? G.blds : G.ress).push(e);
  return e;
}
function unitMhp(pl, t) {
  const d = U[t]; let h = d.hp;
  if (t === 'villager' && pl.patron === 'odin') h *= 1.2;
  if (d.cls === 'myth' && pl.tech.blood) h *= 1.3;
  return Math.round(h);
}
function makeUnit(t, o, x, y) {
  const pl = G.pl[o]; const mhp = unitMhp(pl, t);
  return addEnt({
    k: 'u', t, o, x, y, hp: mhp, mhp, st: 'idle', tgt: 0, cmd: false, amove: false, dest: null, goal: null, path: null, pi: 0, needPath: false,
    cd: 0, face: Math.random() < 0.5 ? -1 : 1, anim: Math.random() * 10, carry: { type: null, amt: 0 }, gt: null, sub: null, lastType: null, dropId: 0,
    frozen: 0, shield: 0, buff: 0, expire: 0, scanT: Math.random() * 0.5, stuckT: 0, lastX: x, lastY: y, stuck: 0, repT: 0,
    atkAnim: 0, work: 0, hitT: -9, moving: false, helpT: 0, resume: null, skin: SKINS[(G.nextId * 7 + o) % SKINS.length],
  });
}
function bldMhp(pl, t) { return Math.round(B[t].hp * (pl.tech.walls ? 1.4 : 1)); }
function makeBuilding(t, o, tx, ty, built) {
  const d = B[t], pl = G.pl[o], s = d.size, mhp = bldMhp(pl, t);
  const b = addEnt({
    k: 'b', t, o, tx, ty, size: s, x: (tx + s / 2) * T, y: (ty + s / 2) * T, hp: built ? mhp : Math.max(1, mhp * 0.05), mhp,
    built: !!built, prog: built ? 1 : 0, q: [], rally: null, cd: 0, farmer: 0, hitT: -9,
  });
  setFootprint(b, true);
  return b;
}
function makeRes(t, tx, ty, amt) {
  const s = t === 'gold' ? 2 : 1;
  const r = addEnt({ k: 'r', t, o: -1, tx, ty, size: s, x: (tx + s / 2) * T, y: (ty + s / 2) * T, amt, max: amt });
  setFootprint(r, true);
  return r;
}
function setFootprint(e, on) {
  for (let dy = 0; dy < e.size; dy++) for (let dx = 0; dx < e.size; dx++) {
    const x = e.tx + dx, y = e.ty + dy; if (!inb(x, y)) continue;
    const i = idx(x, y);
    if (on) G.occ[i] = e.id; else if (G.occ[i] === e.id) G.occ[i] = 0;
    updBlk(i);
  }
}
function updBlk(i) {
  let b = G.ter[i] === 1 || G.tree[i] > 0;
  if (!b && G.occ[i]) { const e = G.byId.get(G.occ[i]); if (e && !(e.k === 'b' && B[e.t].walk)) b = true; }
  const nb = b ? 1 : 0;
  if (G.blk[i] !== nb) { G.blk[i] = nb; G.compDirty = true; }
}
/* Composantes connexes des cases praticables (évite les recherches impossibles) */
function ensureComp(force) {
  const W = G.W, H = G.H, N = W * H;
  if (!G.comp || G.comp.length !== N) { G.comp = new Int32Array(N); G.compQ = new Int32Array(N); G.compDirty = true; G.compT = -99; }
  if (!G.compDirty) return;
  if (!force && G.time - G.compT < 1) return;
  const blk = G.blk, comp = G.comp, q = G.compQ; comp.fill(0); let label = 0;
  for (let s = 0; s < N; s++) {
    if (blk[s] || comp[s]) continue;
    label++; let qh = 0, qt = 0; q[qt++] = s; comp[s] = label;
    while (qh < qt) {
      const c = q[qh++], x = c % W, y = (c / W) | 0;
      for (let k = 0; k < 8; k++) {
        const D = DIRS[k], nx = x + D[0], ny = y + D[1];
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx; if (blk[ni] || comp[ni]) continue;
        if (k >= 4 && (blk[y * W + nx] || blk[ny * W + x])) continue;
        comp[ni] = label; q[qt++] = ni;
      }
    }
  }
  G.compDirty = false; G.compT = G.time;
}
function compAt(x, y) { const tx = clamp(Math.floor(x / T), 0, G.W - 1), ty = clamp(Math.floor(y / T), 0, G.H - 1); return G.comp ? G.comp[idx(tx, ty)] : 0; }
function rectReachable(tx, ty, w, h, c) {
  if (!c || !G.comp) return true;
  for (let y = ty - 1; y <= ty + h; y++) for (let x = tx - 1; x <= tx + w; x++) {
    if (x >= tx && x < tx + w && y >= ty && y < ty + h) continue;
    if (inb(x, y) && G.comp[idx(x, y)] === c) return true;
  }
  return false;
}

/* ----- Géométrie ----- */
function distToRect(x, y, tx, ty, s) {
  const x0 = tx * T, y0 = ty * T, x1 = x0 + s * T, y1 = y0 + s * T;
  const dx = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
  const dy = y < y0 ? y0 - y : y > y1 ? y - y1 : 0;
  return Math.sqrt(dx * dx + dy * dy);
}
function edgeDist(u, t) {
  if (t.k === 'u') return Math.hypot(u.x - t.x, u.y - t.y) - U[u.t].r - U[t.t].r;
  return distToRect(u.x, u.y, t.tx, t.ty, t.size) - U[u.t].r;
}
function forRing(cx, cy, r, fn) {
  if (r === 0) { fn(cx, cy); return; }
  for (let x = cx - r; x <= cx + r; x++) { fn(x, cy - r); fn(x, cy + r); }
  for (let y = cy - r + 1; y <= cy + r - 1; y++) { fn(cx - r, y); fn(cx + r, y); }
}
function nearestFree(tx, ty, maxR) {
  for (let r = 0; r <= maxR; r++) {
    let res = null, bd = 1e9;
    forRing(tx, ty, r, (x, y) => { if (inb(x, y) && !G.blk[idx(x, y)]) { const d = (x - tx) * (x - tx) + (y - ty) * (y - ty); if (d < bd) { bd = d; res = [x, y]; } } });
    if (res) return res;
  }
  return null;
}

/* ----- Ressources des joueurs ----- */
function afford(pl, cost, reserve) {
  for (const k in cost) if (pl.res[k] - ((reserve && reserve[k]) || 0) < cost[k]) return false;
  return true;
}
function pay(pl, cost) { for (const k in cost) pl.res[k] -= cost[k]; }
function refund(pl, cost, f) { for (const k in cost) pl.res[k] += cost[k] * (f == null ? 1 : f); }
function mythOf(pl) { return P[pl.patron].myth; }
function trainList(b) { const pl = G.pl[b.o]; return (B[b.t].trains || []).map(t => t === '$myth' ? mythOf(pl) : t); }

/* ----- Modificateurs ----- */
function atkOf(u) {
  const d = U[u.t], pl = G.pl[u.o]; let a = d.atk;
  if (d.cls !== 'vill') { if (pl.tech.iron) a += 2; if (pl.patron === 'zeus') a *= 1.1; }
  if (d.cls === 'myth' && pl.tech.blood) a *= 1.2;
  if (u.buff > G.time) a *= 1.3;
  return a;
}
function armorOf(u) {
  const d = U[u.t], pl = G.pl[u.o]; let ar = d.armor;
  if (pl.tech.shields && d.cls !== 'vill' && d.cls !== 'myth') ar += 2;
  return ar;
}
function gatherRate(u, rtype, farm) {
  const pl = G.pl[u.o];
  let r = farm ? 0.55 : rtype === 'food' ? 0.75 : rtype === 'wood' ? 0.6 : 0.55;
  if (pl.tech.tools) r *= 1.2;
  if (pl.patron === 'odin') r *= 1.15;
  if (pl.ai) r *= DIFF[pl.diff].gather;
  return r;
}
function foiMult(pl) { let m = 1; if (pl.tech.rites) m *= 1.6; if (pl.patron === 'ra') m *= 1.3; return m; }
function spd(u) { return U[u.t].speed * T; }

/* ----- Grille spatiale des unités ----- */
const CELL = 64;
function rebuildSpatial() {
  const cw = Math.ceil(G.W * T / CELL), ch = Math.ceil(G.H * T / CELL);
  if (!G.cells || G.cells.length !== cw * ch) { G.cells = []; for (let i = 0; i < cw * ch; i++) G.cells.push([]); G.cw = cw; G.ch = ch; }
  for (const c of G.cells) c.length = 0;
  for (const u of G.units) {
    if (u.dead) continue;
    const cx = clamp((u.x / CELL) | 0, 0, cw - 1), cy = clamp((u.y / CELL) | 0, 0, ch - 1);
    G.cells[cy * cw + cx].push(u);
  }
}
function unitsNear(x, y, r, fn) {
  const cw = G.cw, ch = G.ch;
  const x0 = clamp(((x - r) / CELL) | 0, 0, cw - 1), x1 = clamp(((x + r) / CELL) | 0, 0, cw - 1);
  const y0 = clamp(((y - r) / CELL) | 0, 0, ch - 1), y1 = clamp(((y + r) / CELL) | 0, 0, ch - 1);
  const r2 = r * r;
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const c = G.cells[cy * cw + cx];
    for (let k = 0; k < c.length; k++) {
      const u = c[k]; if (u.dead) continue;
      const dx = u.x - x, dy = u.y - y;
      if (dx * dx + dy * dy <= r2) fn(u);
    }
  }
}
function isEnemy(a, b) { return a !== b && a >= 0 && b >= 0; }

/* ----- Production ----- */
function enqueue(b, k, id) {
  const pl = G.pl[b.o]; const cost = k === 'u' ? U[id].cost : R[id].cost;
  if (b.q.length >= 6) return 'full';
  if (k === 'r' && (pl.tech[id] || G.blds.some(x => !x.dead && x.o === b.o && x.q.some(it => it.k === 'r' && it.id === id)))) return 'done';
  if (!afford(pl, cost)) return 'cost';
  pay(pl, cost); b.q.push({ k, id, p: 0, started: false });
  return 'ok';
}
function dequeue(b, i) {
  const it = b.q[i]; if (!it) return;
  refund(G.pl[b.o], it.k === 'u' ? U[it.id].cost : R[it.id].cost);
  b.q.splice(i, 1);
}
function hasTemple(pl) { for (const b of G.blds) if (!b.dead && b.o === pl.i && b.t === 'temple' && b.built) return true; return false; }
function countB(o, t) { let n = 0; for (const b of G.blds) if (!b.dead && b.o === o && b.t === t) n++; return n; }

/* ----- Placement ----- */
function canPlace(t, o, tx, ty, strict) {
  const s = B[t].size;
  if (tx < 1 || ty < 1 || tx + s > G.W - 1 || ty + s > G.H - 1) return false;
  for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) {
    const i = idx(x, y);
    if (G.ter[i] === 1 || G.tree[i] > 0 || G.occ[i]) return false;
    if (o === 0 && !G.ex[i]) return false;
  }
  if (strict) { // l'IA laisse un couloir libre autour de ses bâtiments
    for (let y = ty - 1; y <= ty + s; y++) for (let x = tx - 1; x <= tx + s; x++) {
      if (x >= tx && x < tx + s && y >= ty && y < ty + s) continue;
      if (!inb(x, y)) return false;
      const i = idx(x, y); const e = G.occ[i] ? G.byId.get(G.occ[i]) : null;
      if (e && e.k === 'b') return false;
      if (G.ter[i] === 1) return false;
    }
  }
  return true;
}
function placeBuilding(pl, t, tx, ty) {
  if (!afford(pl, B[t].cost)) return null;
  pay(pl, B[t].cost);
  return makeBuilding(t, pl.i, tx, ty, false);
}

/* ----- Commandes ----- */
function clearTask(u) {
  if (u.gt && u.gt.kind === 'ent') { const f = G.byId.get(u.gt.id); if (f && f.farmer === u.id) f.farmer = 0; }
  u.gt = null; u.sub = null; u.tgt = 0; u.path = null; u.stuck = 0; u.stuckT = 0; u.lastX = u.x; u.lastY = u.y;
  u.amove = false; u.dest = null; u.cmd = false; u.resume = null;
}
function formation(units, x, y) {
  const n = units.length; if (n === 1) return [[x, y]];
  let maxR = 7; for (const u of units) maxR = Math.max(maxR, U[u.t].r);
  const sp = Math.max(18, maxR * 2.3); const cols = Math.ceil(Math.sqrt(n)); const rows = Math.ceil(n / cols);
  const slots = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    let sx = x + (c - (cols - 1) / 2) * sp, sy = y + (r - (rows - 1) / 2) * sp;
    const tx = clamp((sx / T) | 0, 0, G.W - 1), ty = clamp((sy / T) | 0, 0, G.H - 1);
    if (G.blk[idx(tx, ty)]) { const f = nearestFree(tx, ty, 4); if (f) { sx = f[0] * T + T / 2; sy = f[1] * T + T / 2; } }
    slots.push([sx, sy]);
  }
  // attribution gloutonne : chaque unité prend la case libre la plus proche
  const order = units.map((u, k) => k).sort((a, b) => Math.hypot(units[a].x - x, units[a].y - y) - Math.hypot(units[b].x - x, units[b].y - y));
  const used = new Array(n).fill(false); const out = new Array(n);
  for (const k of order) {
    const u = units[k]; let bi = -1, bd = 1e18;
    for (let s = 0; s < n; s++) if (!used[s]) { const d = (slots[s][0] - u.x) ** 2 + (slots[s][1] - u.y) ** 2; if (d < bd) { bd = d; bi = s; } }
    used[bi] = true; out[k] = slots[bi];
  }
  return out;
}
function cmdMove(units, x, y, amove) {
  units = units.filter(u => u && !u.dead);
  if (!units.length) return;
  const slots = formation(units, x, y);
  units.forEach((u, k) => {
    const [px, py] = slots[k];
    clearTask(u);
    u.st = 'move'; u.amove = !!amove; u.dest = { x: px, y: py }; u.cmd = true;
    requestPath(u, { k: 'pt', x: px, y: py });
  });
}
function canTarget(u, t) {
  if (!t || t.dead || t.k === 'r' || !isEnemy(u.o, t.o)) return false;
  if (U[u.t].onlyB && t.k !== 'b') return false;
  return true;
}
function setAttack(u, t, cmd) {
  u.st = 'attack'; u.tgt = t.id; u.cmd = !!cmd; u.path = null; u.repT = 0; u.stuck = 0; u.stuckT = 0; u.lastX = u.x; u.lastY = u.y;
}
function cmdAttack(units, t) {
  for (const u of units) {
    if (!u || u.dead) continue;
    clearTask(u);
    if (!canTarget(u, t)) { u.st = 'move'; u.dest = { x: t.x, y: t.y }; u.cmd = true; requestPath(u, { k: 'pt', x: t.x, y: t.y }); continue; }
    setAttack(u, t, true);
  }
}
function specType(spec) {
  if (!spec) return null;
  if (spec.kind === 'tree') return 'wood';
  const e = G.byId.get(spec.id); if (!e) return null;
  if (e.k === 'r') return e.t === 'gold' ? 'gold' : 'food';
  if (e.k === 'b' && e.t === 'farm') return 'food';
  return null;
}
function gatherGoal(spec) {
  if (spec.kind === 'tree') return { k: 'rect', tx: spec.tx, ty: spec.ty, w: 1, h: 1 };
  const e = G.byId.get(spec.id); if (!e) return null;
  if (e.k === 'b') return { k: 'in', tx: e.tx, ty: e.ty, w: e.size, h: e.size, fx: (Math.random() - 0.5) * 30, fy: (Math.random() - 0.5) * 30 };
  return { k: 'rect', tx: e.tx, ty: e.ty, w: e.size, h: e.size };
}
function startGather(u, spec) {
  const rtype = specType(spec); if (!rtype) return false;
  if (spec.kind === 'ent') {
    const e = G.byId.get(spec.id);
    if (e && e.k === 'b') { if (!e.built || e.o !== u.o) return false; if (e.farmer && e.farmer !== u.id && G.byId.get(e.farmer)) return false; }
  }
  const resume = u.resume; clearTask(u); u.resume = resume;
  if (u.carry.amt > 0 && u.carry.type !== rtype) { u.carry.amt = 0; u.carry.type = null; }
  if (spec.kind === 'ent') { const e = G.byId.get(spec.id); if (e && e.k === 'b') e.farmer = u.id; }
  u.st = 'gather'; u.gt = spec; u.sub = 'go'; u.lastType = rtype; u.cmd = true;
  requestPath(u, gatherGoal(spec));
  return true;
}
function treeReachable(tx, ty) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue; const x = tx + dx, y = ty + dy;
    if (inb(x, y) && !G.blk[idx(x, y)]) return true;
  }
  return false;
}
function cmdGather(units, spec) {
  const vills = units.filter(u => u && !u.dead && u.t === 'villager');
  const others = units.filter(u => u && !u.dead && u.t !== 'villager');
  let k = 0;
  for (const u of vills) {
    let sp = spec;
    if (spec.kind === 'tree') {
      if (k > 0 || !treeReachable(spec.tx, spec.ty)) sp = nthTree(spec.tx, spec.ty, k) || spec;
    } else {
      const e = G.byId.get(spec.id);
      if (e && e.k === 'b' && e.t === 'farm' && e.farmer && e.farmer !== u.id && G.byId.get(e.farmer)) sp = findResource(u.o, 'food', e.x, e.y, 10) || null;
    }
    if (sp) startGather(u, sp);
    k++;
  }
  if (others.length) {
    let px, py; if (spec.kind === 'tree') { px = spec.tx * T + 16; py = spec.ty * T + 48; } else { const e = G.byId.get(spec.id); px = e ? e.x : 0; py = e ? e.y + e.size * T / 2 + 18 : 0; }
    cmdMove(others, px, py);
  }
}
function nthTree(tx, ty, n) {
  const found = [];
  for (let r = 0; r <= 6 && found.length <= n; r++) {
    forRing(tx, ty, r, (x, y) => { if (inb(x, y) && G.tree[idx(x, y)] > 0 && treeReachable(x, y)) found.push([x, y]); });
  }
  if (!found.length) return null;
  const f = found[Math.min(n, found.length - 1)];
  return { kind: 'tree', tx: f[0], ty: f[1] };
}
function cmdBuild(units, b) {
  for (const u of units) {
    if (!u || u.dead || u.t !== 'villager') continue;
    const resume = (u.st === 'gather' && u.gt) ? u.gt : (u.resume || null);
    clearTask(u);
    u.resume = resume;
    u.st = 'build'; u.tgt = b.id; u.cmd = true;
    requestPath(u, { k: 'rect', tx: b.tx, ty: b.ty, w: b.size, h: b.size });
  }
}
function cmdDeposit(units, b) {
  for (const u of units) {
    if (!u || u.dead || u.t !== 'villager' || u.carry.amt <= 0) continue;
    clearTask(u); u.st = 'gather'; u.sub = 'drop'; u.dropId = b.id; u.cmd = true;
    requestPath(u, { k: 'rect', tx: b.tx, ty: b.ty, w: b.size, h: b.size });
  }
}
function cmdStop(units) { for (const u of units) { if (!u || u.dead) continue; clearTask(u); u.st = 'idle'; u.scanT = 0.6; } }

/* Recherche de ressources */
function findResource(o, type, x, y, maxR, avoid, from) {
  const cx = clamp((x / T) | 0, 0, G.W - 1), cy = clamp((y / T) | 0, 0, G.H - 1);
  ensureComp();
  const c = from ? compAt(from.x, from.y) : compAt(x, y);
  if (type === 'wood') {
    let best = null, bd = 1e9;
    for (let r = 0; r <= maxR; r++) {
      forRing(cx, cy, r, (tx, ty) => {
        if (!inb(tx, ty)) return; const i = idx(tx, ty);
        if (G.tree[i] <= 0 || !treeReachable(tx, ty) || !rectReachable(tx, ty, 1, 1, c)) return;
        if (avoid && avoid.kind === 'tree' && avoid.tx === tx && avoid.ty === ty) return;
        const d = Math.hypot(tx * T + 16 - x, ty * T + 16 - y);
        if (d < bd) { bd = d; best = { kind: 'tree', tx, ty }; }
      });
      if (best && r * T > bd + T) break;
    }
    return best;
  }
  let best = null, bd = maxR * T;
  for (const e of G.ress) {
    if (e.dead) continue;
    if (type === 'gold' ? e.t !== 'gold' : e.t !== 'berry') continue;
    if (avoid && avoid.kind === 'ent' && avoid.id === e.id) continue;
    const d = distToRect(x, y, e.tx, e.ty, e.size);
    if (d < bd && rectReachable(e.tx, e.ty, e.size, e.size, c)) { bd = d; best = { kind: 'ent', id: e.id }; }
  }
  if (type === 'food') for (const b of G.blds) {
    if (b.dead || b.o !== o || b.t !== 'farm' || !b.built) continue;
    if (b.farmer && G.byId.get(b.farmer)) continue;
    if (avoid && avoid.kind === 'ent' && avoid.id === b.id) continue;
    const d = distToRect(x, y, b.tx, b.ty, b.size) + 2 * T;
    if (d < bd) { bd = d; best = { kind: 'ent', id: b.id }; }
  }
  return best;
}
function nearestDrop(o, x, y) {
  let best = null, bd = 1e12;
  for (const b of G.blds) {
    if (b.dead || b.o !== o || !b.built || !B[b.t].drop) continue;
    const d = distToRect(x, y, b.tx, b.ty, b.size);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}
