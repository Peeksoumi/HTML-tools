/* ===== Intelligence artificielle des adversaires ===== */
function aiCreate(pl) {
  const D = DIFF[pl.diff];
  return { p: pl.i, t: 1 + Math.random(), nextAttack: D.first * (0.9 + Math.random() * 0.2), wave: [], waveStart: 0, waveN: 0, hx: 0, hy: 0, reserve: null, defending: false, rebT: 60 };
}
function aiUpdate(ai, dt) {
  const pl = G.pl[ai.p]; if (pl.defeated || G.over) return;
  ai.t -= dt; if (ai.t > 0) return;
  const D = DIFF[pl.diff]; ai.t = D.think * (0.85 + Math.random() * 0.3);
  aiInfo(ai, pl);
  aiEconomy(ai, pl, D);
  aiBuild(ai, pl, D);
  aiMilitary(ai, pl, D);
  aiPowers(ai, pl, D);
}
function aiInfo(ai, pl) {
  const I = { vill: [], idleVill: [], mil: [], blds: {}, unbuilt: [], counts: {}, gath: { food: 0, wood: 0, gold: 0 }, qVill: 0, threats: [], builders: new Map() };
  for (const u of G.units) {
    if (u.dead || u.o !== pl.i) continue;
    I.counts[u.t] = (I.counts[u.t] || 0) + 1;
    if (u.t === 'villager') {
      I.vill.push(u);
      if (u.st === 'idle') I.idleVill.push(u);
      else if (u.st === 'gather' && u.lastType) I.gath[u.lastType]++;
      else if (u.st === 'build') I.builders.set(u.tgt, (I.builders.get(u.tgt) || 0) + 1);
    } else if (!U[u.t].summon) I.mil.push(u);
  }
  const own = [];
  for (const b of G.blds) {
    if (b.dead || b.o !== pl.i) continue;
    own.push(b);
    (I.blds[b.t] || (I.blds[b.t] = [])).push(b);
    if (!b.built) I.unbuilt.push(b);
    for (const it of b.q) if (it.k === 'u' && it.id === 'villager') I.qVill++;
  }
  const cities = I.blds.city || [];
  const city = cities.find(b => b.built) || cities[0] || own[0];
  if (city) { ai.hx = city.x; ai.hy = city.y; }
  else if (I.vill.length) { ai.hx = I.vill[0].x; ai.hy = I.vill[0].y; }
  const R2 = (13 * T) ** 2;
  for (const u of G.units) {
    if (u.dead || !isEnemy(pl.i, u.o) || G.pl[u.o].defeated) continue;
    for (const b of own) if ((u.x - b.x) ** 2 + (u.y - b.y) ** 2 < R2) { I.threats.push(u); break; }
  }
  ai.I = I;
}
function aiEconomy(ai, pl, D) {
  const I = ai.I;
  const nV = I.vill.length + I.qVill;
  if (nV < D.vill && pl.popUsed < pl.popCap) {
    for (const c of (I.blds.city || [])) if (c.built && c.q.length < 2 && afford(pl, U.villager.cost)) { enqueue(c, 'u', 'villager'); break; }
  }
  const hb = I.unbuilt.filter(b => b.t === 'house').length;
  const margin = 3 + Math.floor(pl.popUsed / 18);
  if (pl.popCap < POP_MAX && pl.popCap - pl.popUsed <= margin && hb < (pl.popUsed > 40 ? 2 : 1) && afford(pl, B.house.cost)) aiPlace(ai, pl, 'house');
  for (const v of I.idleVill) aiAssign(ai, pl, v);
  // rééquilibrage selon les stocks
  if (G.time > ai.rebT) {
    ai.rebT = G.time + 15;
    const r = pl.res, types = ['food', 'wood', 'gold'].sort((a, b) => r[a] - r[b]);
    const hi = types[2];
    if (r[hi] > 450) for (const lo of [types[0], types[1]]) {
      if (r[lo] >= 150) break;
      let n = 0;
      for (const v of I.vill) {
        if (n >= 3) break;
        if (v.st === 'gather' && v.lastType === hi && v.carry.amt < 4) {
          const f = aiFindRes(ai, pl, lo, v);
          if (f && f.spec && startGather(v, f.spec)) { v.cmd = false; n++; }
          else if (f && f.build) { cmdBuild([v], f.build); v.cmd = false; n++; }
          else if (!f) break;
        }
      }
      if (n) break;
    }
  }
}
function aiAssign(ai, pl, v) {
  const I = ai.I;
  for (const b of I.unbuilt) {
    const need = (b.t === 'house' || b.t === 'farm' || b.t === 'store') ? 1 : 2;
    if ((I.builders.get(b.id) || 0) < need) { cmdBuild([v], b); v.cmd = false; I.builders.set(b.id, (I.builders.get(b.id) || 0) + 1); return; }
  }
  const t = G.time;
  const want = t < 200 ? { food: 0.5, wood: 0.35, gold: 0.15 } : t < 540 ? { food: 0.4, wood: 0.3, gold: 0.3 } : { food: 0.38, wood: 0.24, gold: 0.38 };
  const tot = I.vill.length;
  const adj = k => (pl.res[k] < 100 ? 2 : 0) - (pl.res[k] > 600 ? 3 : 0);
  const order = ['food', 'wood', 'gold'].sort((a, b) => (want[b] * tot - I.gath[b] + adj(b)) - (want[a] * tot - I.gath[a] + adj(a)));
  for (const type of order) {
    const r = aiFindRes(ai, pl, type, v);
    if (!r) continue;
    if (r.spec) { if (startGather(v, r.spec)) { v.cmd = false; I.gath[type]++; return; } }
    else if (r.build) { cmdBuild([v], r.build); v.cmd = false; I.builders.set(r.build.id, 1); return; }
  }
}
function aiFindRes(ai, pl, type, v) {
  const hx = ai.hx, hy = ai.hy;
  if (type === 'food') {
    const s = findResource(pl.i, 'food', v.x, v.y, 16, null, v);
    if (s) { const e = G.byId.get(s.id); if (e && (e.k === 'b' || Math.hypot(e.x - hx, e.y - hy) < 16 * T)) return { spec: s }; }
    const fu = ai.I.unbuilt.filter(b => b.t === 'farm').length;
    if (fu < 2 && afford(pl, B.farm.cost)) { const b = aiPlace(ai, pl, 'farm', null, null, true); if (b) return { build: b }; }
    return s ? { spec: s } : null;
  }
  if (type === 'wood') {
    const drop = nearestDrop(pl.i, v.x, v.y) || { x: hx, y: hy };
    const s = findResource(pl.i, 'wood', drop.x, drop.y, 24, null, v);
    if (s) { aiMaybeStore(ai, pl, s.tx * T + 16, s.ty * T + 16); return { spec: s }; }
    return null;
  }
  let best = null, bd = 1e12;
  ensureComp(); const vc = compAt(v.x, v.y);
  for (const e of G.ress) { if (e.dead || e.t !== 'gold') continue; const d = Math.hypot(e.x - hx, e.y - hy); if (d < bd && rectReachable(e.tx, e.ty, e.size, e.size, vc)) { bd = d; best = e; } }
  if (best && bd < 32 * T) { aiMaybeStore(ai, pl, best.x, best.y); return { spec: { kind: 'ent', id: best.id } }; }
  return null;
}
function aiMaybeStore(ai, pl, x, y) {
  const d = nearestDrop(pl.i, x, y); const dd = d ? distToRect(x, y, d.tx, d.ty, d.size) : 1e9;
  if (dd < 7 * T) return;
  if (ai.I.unbuilt.some(b => b.t === 'store' || b.t === 'city')) return;
  if (!afford(pl, B.store.cost, ai.reserve)) return;
  aiPlace(ai, pl, 'store', x, y);
}
function aiPlace(ai, pl, type, nx, ny, noAssign) {
  const s = B[type].size;
  const near = nx != null;
  const cx = Math.floor((near ? nx : ai.hx) / T), cy = Math.floor((near ? ny : ai.hy) / T);
  let minR = near ? 2 : (type === 'tower' ? 6 : 4), maxR = near ? 6 : (type === 'tower' ? 11 : 15);
  if (type === 'farm' && !near) { minR = 3; maxR = 10; }
  let aim = null;
  if (type === 'tower') {
    let bd = 1e18;
    for (const b of G.blds) if (!b.dead && isEnemy(pl.i, b.o) && b.t === 'city') { const d = Math.hypot(b.x - ai.hx, b.y - ai.hy); if (d < bd) { bd = d; aim = b; } }
  }
  for (let r = minR; r <= maxR; r++) {
    const cand = []; forRing(cx, cy, r, (x, y) => cand.push([x, y]));
    if (aim) { const ax = ai.hx + (aim.x - ai.hx) / Math.hypot(aim.x - ai.hx, aim.y - ai.hy) * 8 * T, ay = ai.hy + (aim.y - ai.hy) / Math.hypot(aim.x - ai.hx, aim.y - ai.hy) * 8 * T; cand.sort((a, b) => Math.hypot(a[0] * T - ax, a[1] * T - ay) - Math.hypot(b[0] * T - ax, b[1] * T - ay)); }
    else shuffle(cand);
    for (const [x, y] of cand) {
      const tx = x - (s >> 1), ty = y - (s >> 1);
      if (!canPlace(type, pl.i, tx, ty, true)) continue;
      const b = placeBuilding(pl, type, tx, ty);
      if (b) { ai.I.unbuilt.push(b); if (!noAssign) aiAssignBuilders(ai, pl, b); }
      return b;
    }
  }
  return null;
}
function aiAssignBuilders(ai, pl, b) {
  const n = b.t === 'city' ? 3 : (b.t === 'house' || b.t === 'farm' || b.t === 'store') ? 1 : 2;
  const cands = ai.I.vill.filter(v => v.st !== 'build' && v.carry.amt < 7).sort((a, c) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(c.x - b.x, c.y - b.y));
  for (let i = 0; i < Math.min(n, cands.length); i++) { cmdBuild([cands[i]], b); cands[i].cmd = false; ai.I.builders.set(b.id, (ai.I.builders.get(b.id) || 0) + 1); }
}
function aiBuild(ai, pl, D) {
  const I = ai.I, n = t => (I.blds[t] || []).length, t = G.time, slow = pl.diff === 'easy' ? 1.4 : 1;
  ai.reserve = null;
  const plan = [];
  if (n('city') < 1 && I.vill.length > 0) plan.push('city');
  if (n('barracks') < 1 && t > 75 * slow) plan.push('barracks');
  if (n('temple') < 1 && t > 160 * slow) plan.push('temple');
  if (n('barracks') < D.barracks && t > 420) plan.push('barracks');
  if (n('tower') < D.towers && t > 330) plan.push('tower');
  if (pl.diff !== 'easy' && n('temple') < 2 && t > 620) plan.push('temple');
  if (pl.diff === 'hard' && n('city') < 2 && t > 900 && I.vill.length > 24) plan.push('city');
  for (const k of plan) {
    if (I.unbuilt.some(b => b.t === k)) continue;
    if (afford(pl, B[k].cost)) aiPlace(ai, pl, k);
    else ai.reserve = B[k].cost;
    break;
  }
  aiResearch(ai, pl);
}
const AI_RESEARCH = [['tools', 'city', 200], ['rites', 'temple', 320], ['iron', 'barracks', 480], ['shields', 'barracks', 560], ['blood', 'temple', 720], ['walls', 'city', 840]];
function aiResearch(ai, pl) {
  const slow = pl.diff === 'easy' ? 1.6 : pl.diff === 'hard' ? 0.8 : 1;
  for (const [id, at, tm] of AI_RESEARCH) {
    if (pl.tech[id] || G.time < tm * slow) continue;
    const bs = ai.I.blds[at] || [];
    if (bs.some(b => b.q.some(it => it.k === 'r' && it.id === id))) continue;
    const b = bs.find(x => x.built && x.q.length === 0);
    if (!b) continue;
    if (afford(pl, R[id].cost, ai.reserve)) { enqueue(b, 'r', id); return; }
    if (!ai.reserve && G.time > tm * slow + 60) { ai.reserve = R[id].cost; return; }
  }
}
function mergeReserve(a, b) { if (!a) return b; if (!b) return a; const r = Object.assign({}, a); for (const k in b) r[k] = (r[k] || 0) + b[k]; return r; }
function centroid(arr) { let x = 0, y = 0; for (const u of arr) { x += u.x; y += u.y; } return { x: x / arr.length, y: y / arr.length }; }
function aiPickUnit(ai, pl, D) {
  const I = ai.I;
  if ((I.counts.ram || 0) < (G.time > 900 ? 3 : 2) && I.mil.length >= 8 && G.time > 480 && Math.random() < 0.3 && afford(pl, U.ram.cost)) return 'ram';
  let w;
  if (!D.counters) w = { hoplite: 1, archer: 1, cavalier: 0.7 };
  else {
    let inf = 0, arch = 0, cav = 0, myth = 0;
    for (const u of G.units) {
      if (u.dead || !isEnemy(pl.i, u.o) || G.pl[u.o].defeated) continue;
      const c = U[u.t].cls; if (c === 'inf') inf++; else if (c === 'arch') arch++; else if (c === 'cav') cav++; else if (c === 'myth') myth++;
    }
    const tot = inf + arch + cav + myth + 2;
    w = { hoplite: 1 + 3 * cav / tot + myth / tot, archer: 1 + 3 * inf / tot, cavalier: 0.7 + 3 * arch / tot };
  }
  const keys = Object.keys(w).filter(k => afford(pl, U[k].cost)); if (!keys.length) return null;
  let s = 0; for (const k of keys) s += w[k];
  let r = Math.random() * s;
  for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
  return keys[0];
}
function aiPickTarget(ai, pl, x, y) {
  let best = null, bd = 1e18;
  for (const b of G.blds) {
    if (b.dead || !isEnemy(pl.i, b.o) || G.pl[b.o].defeated) continue;
    let d = Math.hypot(b.x - x, b.y - y);
    if (!G.pl[b.o].ai) d *= 0.8;
    if (b.t === 'tower') d *= 1.25;
    if (d < bd) { bd = d; best = b; }
  }
  if (best) return { x: best.x, y: best.y };
  for (const u of G.units) {
    if (u.dead || !isEnemy(pl.i, u.o) || G.pl[u.o].defeated) continue;
    const d = Math.hypot(u.x - x, u.y - y); if (d < bd) { bd = d; best = u; }
  }
  return best ? { x: best.x, y: best.y } : null;
}
function aiMilitary(ai, pl, D) {
  const I = ai.I;
  const vRes = (I.vill.length + I.qVill < D.vill) ? { food: 50 } : null;
  const reserve = mergeReserve(ai.reserve, vRes);
  const cap = D.armyBase + D.armyGrow * ai.waveN;
  if (G.time > D.milStart && I.mil.length < cap) for (const b of (I.blds.barracks || [])) {
    if (!b.built || b.q.length >= 2) continue;
    const type = aiPickUnit(ai, pl, D);
    if (type && afford(pl, U[type].cost, reserve)) enqueue(b, 'u', type);
  }
  const mt = mythOf(pl);
  for (const b of (I.blds.temple || [])) {
    if (!b.built || b.q.length >= 1) continue;
    const nM = I.counts[mt] || 0;
    if (nM < Math.min(4, 1 + Math.floor(I.mil.length / 6)) && pl.res.foi >= U[mt].cost.foi + 25 && afford(pl, U[mt].cost, reserve)) enqueue(b, 'u', mt);
  }
  ai.wave = ai.wave.filter(id => { const u = G.byId.get(id); return u && !u.dead; });
  // défense
  if (I.threats.length) {
    const c = centroid(I.threats);
    const waveSet = new Set(ai.wave);
    const strong = I.threats.length > ai.wave.length * 0.5 + 3;
    for (const u of I.mil) {
      if (waveSet.has(u.id) && !(strong && Math.hypot(u.x - ai.hx, u.y - ai.hy) < 25 * T)) continue;
      if (u.st === 'idle' || (u.st === 'move' && !u.amove)) { cmdMove([u], c.x, c.y, true); u.cmd = false; }
    }
    ai.defending = true;
  } else ai.defending = false;
  // vagues d'attaque
  if (ai.wave.length) {
    const units = ai.wave.map(id => G.byId.get(id));
    if (units.length < ai.waveStart * 0.3) {
      cmdMove(units, ai.hx, ai.hy + 3 * T, false); for (const u of units) u.cmd = false;
      ai.wave = []; ai.nextAttack = G.time + D.interval * 0.6;
    } else if (units.every(u => u.st === 'idle')) {
      const c = centroid(units); const tgt = aiPickTarget(ai, pl, c.x, c.y);
      if (tgt) { cmdMove(units, tgt.x, tgt.y, true); for (const u of units) u.cmd = false; }
      else ai.wave = [];
    }
  } else if (G.time >= ai.nextAttack && !ai.defending) {
    const avail = I.mil.filter(u => u.st === 'idle' || (u.st === 'move' && !u.amove));
    const need = Math.min(40, D.wave + ai.waveN * D.waveGrow);
    if (avail.length >= need || (pl.popUsed >= pl.popCap - 2 && pl.popCap >= POP_MAX - 4 && avail.length >= 6)) {
      const tgt = aiPickTarget(ai, pl, ai.hx, ai.hy);
      if (tgt) {
        cmdMove(avail, tgt.x, tgt.y, true); for (const u of avail) u.cmd = false;
        ai.wave = avail.map(u => u.id); ai.waveStart = avail.length; ai.waveN++; ai.nextAttack = G.time + D.interval;
      }
    }
  }
}
function bestCluster(o, enemies, r, filter) {
  const cand = [];
  for (const u of G.units) {
    if (u.dead) continue;
    if (enemies ? (!isEnemy(o, u.o) || G.pl[u.o].defeated) : u.o !== o) continue;
    if (filter && !filter(u)) continue;
    cand.push(u);
  }
  if (!cand.length) return null;
  let best = null, bn = 0; const r2 = r * r;
  const step = Math.max(1, Math.floor(cand.length / 40));
  for (let i = 0; i < cand.length; i += step) {
    const c = cand[i]; let n = 0, sx = 0, sy = 0;
    for (const v of cand) { const dx = v.x - c.x, dy = v.y - c.y; if (dx * dx + dy * dy <= r2) { n++; sx += v.x; sy += v.y; } }
    if (n > bn) { bn = n; best = { x: sx / n, y: sy / n, n }; }
  }
  return best;
}
function nearOwn(o, x, y, d) {
  const d2 = d * d;
  for (const u of G.units) if (!u.dead && u.o === o && (u.x - x) ** 2 + (u.y - y) ** 2 < d2) return true;
  for (const b of G.blds) if (!b.dead && b.o === o && (b.x - x) ** 2 + (b.y - y) ** 2 < d2) return true;
  return false;
}
function aiPowers(ai, pl, D) {
  if (!hasTemple(pl)) return;
  if (pl.diff === 'easy' && Math.random() < 0.6) return;
  for (const pid of P[pl.patron].powers) {
    if (!canCast(pl, pid)) continue;
    const gp = GP[pid], r = gp.r * T;
    if (gp.kind === 'hostile') {
      const c = bestCluster(pl.i, true, r);
      if (c && c.n >= D.powerMin && nearOwn(pl.i, c.x, c.y, 12 * T)) { castPower(pl.i, pid, c.x, c.y); return; }
    } else if (gp.kind === 'friendly') {
      const c = bestCluster(pl.i, false, r, u => u.st === 'attack' && U[u.t].cls !== 'vill');
      if (c && c.n >= Math.max(3, D.powerMin)) { castPower(pl.i, pid, c.x, c.y); return; }
    } else if (gp.kind === 'summon') {
      if (ai.I.threats.length >= 3) { const c = centroid(ai.I.threats); castPower(pl.i, pid, c.x, c.y); return; }
      const fighters = ai.wave.map(id => G.byId.get(id)).filter(u => u && u.st === 'attack');
      if (fighters.length >= 3) { const c = centroid(fighters); castPower(pl.i, pid, c.x, c.y); return; }
    }
  }
}
