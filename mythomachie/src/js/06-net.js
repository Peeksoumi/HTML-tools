/* ===== Jeu en ligne : ordres validés et états par joueur (serveur), application des états (navigateur) =====
   Code sans DOM, partagé par la page, le serveur (server/server.js) et les tests. */
const NET_UT = Object.keys(U), NET_BT = Object.keys(B), NET_ST = ['idle', 'move', 'attack', 'gather', 'build'], NET_RT = [null, 'food', 'wood', 'gold'];
const NET_FX = ['bolt', 'scorch', 'cast', 'dome', 'frost', 'bless', 'summon', 'spawn', 'vanish', 'boom', 'rubble', 'corpse'];
const NET_FX_LIFE = { bolt: 0.5, scorch: 5, cast: 1.1, dome: 1.4, frost: 6, bless: 1.6, summon: 1.2, spawn: 1, vanish: 0.8, boom: 0.5, rubble: 8, corpse: 5 };
function netIndex(a) { const m = {}; a.forEach((v, i) => { m[v] = i; }); return m; }
const NET_UTI = netIndex(NET_UT), NET_BTI = netIndex(NET_BT), NET_STI = netIndex(NET_ST), NET_FXI = netIndex(NET_FX);

/* ---------- Serveur ---------- */
function netSetup(opts) {
  setupGame(opts);
  G.me = -1; G.mp = true; G.headless = true; G.netTrees = []; G.tv = {};
  H.onTreeGone = (tx, ty) => { G.netTrees.push([G.time, idx(tx, ty)]); if (G.netTrees.length > 4000) G.netTrees.splice(0, 1000); };
}
function netSetAI(slot, on) {
  const has = G.ai.some(a => a.p === slot);
  if (on && !has && G.pl[slot] && !G.pl[slot].defeated) G.ai.push(aiCreate(G.pl[slot]));
  if (!on && has) G.ai = G.ai.filter(a => a.p !== slot);
}
function netState() {
  return { over: G.over, win: G.winTeam, time: G.time, players: G.pl.map(p => ({ name: p.name, patron: p.patron, team: p.team, ai: p.ai, defeated: p.defeated, stats: p.stats })) };
}
function netSpec(s) {
  if (!s || typeof s !== 'object') return null;
  if (s.kind === 'tree') { const tx = s.tx | 0, ty = s.ty | 0; return inb(tx, ty) && G.tree[idx(tx, ty)] > 0 ? { kind: 'tree', tx, ty } : null; }
  if (s.kind === 'ent') { const e = G.byId.get(s.id | 0); return e && !e.dead && (e.k === 'r' || (e.k === 'b' && e.t === 'farm')) ? { kind: 'ent', id: e.id } : null; }
  return null;
}
/* Applique un ordre reçu d'un joueur, après vérification qu'il porte sur ses propres unités et bâtiments. */
function applyCmd(o, c) {
  const pl = G.pl[o];
  if (!pl || pl.defeated || G.over || !Array.isArray(c)) return false;
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : 0;
  const own = ids => (Array.isArray(ids) ? ids.slice(0, 200) : []).map(id => G.byId.get(id)).filter(e => e && !e.dead && e.k === 'u' && e.o === o);
  const ownB = id => { const b = G.byId.get(id); return b && !b.dead && b.k === 'b' && b.o === o ? b : null; };
  switch (c[0]) {
    case 'move': cmdMove(own(c[1]), clamp(num(c[2]), 0, G.W * T), clamp(num(c[3]), 0, G.H * T), !!c[4]); return true;
    case 'attack': { const t = G.byId.get(c[2]); if (t && !t.dead && (t.k === 'u' || t.k === 'b')) cmdAttack(own(c[1]), t); return true; }
    case 'gather': { const s = netSpec(c[2]); if (s) cmdGather(own(c[1]), s); return true; }
    case 'build': { const b = ownB(c[2]); if (b) cmdBuild(own(c[1]), b); return true; }
    case 'deposit': { const b = ownB(c[2]); if (b && b.built && B[b.t].drop) cmdDeposit(own(c[1]), b); return true; }
    case 'stop': cmdStop(own(c[1])); return true;
    case 'place': {
      const t = c[1], tx = c[2] | 0, ty = c[3] | 0;
      if (!B[t] || (t === 'temple' && countB(o, 'temple') >= B.temple.max) || !canPlace(t, o, tx, ty, false)) return false;
      const tv = teamView(pl.team);
      for (let y = ty; y < ty + B[t].size; y++) for (let x = tx; x < tx + B[t].size; x++) if (!tv.ex[idx(x, y)]) return false;
      const b = placeBuilding(pl, t, tx, ty);
      if (b) cmdBuild(own(c[4]).filter(u => u.t === 'villager'), b);
      return !!b;
    }
    case 'train': { const b = ownB(c[1]); if (b && b.built && trainList(b).includes(c[2])) enqueue(b, 'u', c[2]); return true; }
    case 'research': { const b = ownB(c[1]); if (b && b.built && (B[b.t].research || []).includes(c[2])) enqueue(b, 'r', c[2]); return true; }
    case 'unq': { const b = ownB(c[1]); if (b) dequeue(b, c[2] | 0); return true; }
    case 'rally': { const b = ownB(c[1]); if (b) b.rally = { x: clamp(num(c[2]), 0, G.W * T), y: clamp(num(c[3]), 0, G.H * T), spec: netSpec(c[4]) }; return true; }
    case 'demolish': { const b = ownB(c[1]); if (b) { if (!b.built) refund(pl, B[b.t].cost, b.prog < 0.05 ? 1 : 0.5); kill(b, null, true); } return true; }
    case 'power': if (P[pl.patron].powers.includes(c[1])) return castPower(o, c[1], num(c[2]), num(c[3])); return false;
    case 'resign': defeatPlayer(pl); return true;
  }
  return false;
}
/* Vision et zones explorées d'une équipe (recalculées 5 fois par seconde au plus). */
function teamView(team) {
  const N = G.W * G.H;
  let tv = G.tv[team];
  if (!tv) tv = G.tv[team] = { vis: new Uint8Array(N), ex: new Uint8Array(N), t: -1 };
  if (tv.t >= 0 && G.time - tv.t < 0.19) return tv;
  tv.t = G.time;
  const vis = tv.vis, ex = tv.ex, W = G.W, H2 = G.H; vis.fill(0);
  const mark = (x, y, r) => {
    const cx = Math.floor(x / T), cy = Math.floor(y / T), off = circOffsets(r);
    for (let k = 0; k < off.length; k += 2) { const tx = cx + off[k], ty = cy + off[k + 1]; if (tx >= 0 && ty >= 0 && tx < W && ty < H2) vis[ty * W + tx] = 1; }
  };
  for (const u of G.units) if (!u.dead && G.pl[u.o].team === team) mark(u.x, u.y, U[u.t].sight);
  for (const b of G.blds) if (!b.dead && G.pl[b.o].team === team) mark(b.x, b.y, b.built ? B[b.t].sight : 3);
  for (let i = 0; i < N; i++) if (vis[i]) ex[i] = 1;
  return tv;
}
function netView() { return { sent: new Map(), lastT: -1 }; }
function netInit(slot) {
  const pl = G.pl[slot], tv = teamView(pl.team);
  return {
    t: 'start', me: slot, opts: G.opts, W: G.W, H: G.H, time: +G.time.toFixed(2),
    ter: u8ToB64(G.ter), tree: u8ToB64(Uint8Array.from(G.tree, v => Math.min(255, Math.ceil(v)))), stump: u8ToB64(G.stump), ex: u8ToB64(tv.ex),
    pl: G.pl.map(p => ({ name: p.name, patron: p.patron, team: p.team, ai: p.ai })),
  };
}
/* État envoyé à un joueur : seulement ce que voit son équipe, et seulement ce qui a changé depuis le dernier envoi. */
function netSnapshot(slot, view) {
  const pl = G.pl[slot], team = pl.team, all = pl.defeated || G.over;
  const tv = teamView(team), W = G.W, H2 = G.H;
  const seen = (x, y) => { if (all) return true; const tx = Math.floor(x / T), ty = Math.floor(y / T); return tx >= 0 && ty >= 0 && tx < W && ty < H2 && tv.vis[ty * W + tx] === 1; };
  const known = (tx, ty) => all || tv.ex[ty * W + tx] === 1;
  const out = { t: 's', time: +G.time.toFixed(2), u: [], b: [], r: [], rm: [], tg: [], fx: [], pj: [] };
  const cur = new Set(), sent = view.sent;
  const put = (id, row, arr) => { cur.add(id); const s = JSON.stringify(row); if (sent.get(id) !== s) { sent.set(id, s); arr.push(row); } };
  for (const u of G.units) {
    if (u.dead || (G.pl[u.o].team !== team && !seen(u.x, u.y))) continue;
    const work = (u.st === 'gather' && u.sub === 'work') || (u.st === 'build' && !u.moving && !u.path);
    const fl = (u.moving ? 1 : 0) | (u.atkAnim > 0 ? 2 : 0) | (work ? 4 : 0) | (u.frozen > G.time ? 8 : 0) | (u.shield > G.time ? 16 : 0) | (u.buff > G.time ? 32 : 0) | (u.sub === 'drop' ? 64 : 0);
    put(u.id, [u.id, NET_UTI[u.t], u.o, Math.round(u.x), Math.round(u.y), Math.ceil(u.hp), u.mhp, NET_STI[u.st] | 0, u.face, fl,
      Math.max(0, NET_RT.indexOf(u.carry.type)), Math.floor(u.carry.amt), Math.max(0, NET_RT.indexOf(u.lastType)), u.expire ? Math.round(u.expire) : 0], out.u);
  }
  for (const b of G.blds) {
    if (b.dead || (G.pl[b.o].team !== team && !known(b.tx + (b.size >> 1), b.ty + (b.size >> 1)))) continue;
    const row = [b.id, NET_BTI[b.t], b.o, b.tx, b.ty, Math.ceil(b.hp), b.mhp, b.built ? 1 : 0, Math.round(b.prog * 1000), b.farmer && G.byId.get(b.farmer) ? 1 : 0];
    if (b.o === slot) row.push(b.q.map(it => [it.k, it.id, Math.round(it.p * 1000), it.blocked ? 1 : 0]), b.rally ? [Math.round(b.rally.x), Math.round(b.rally.y)] : 0);
    put(b.id, row, out.b);
  }
  for (const r of G.ress) if (!r.dead && known(r.tx, r.ty)) put(r.id, [r.id, r.t === 'gold' ? 1 : 0, r.tx, r.ty, Math.ceil(r.amt), r.max], out.r);
  for (const id of sent.keys()) if (!cur.has(id)) { out.rm.push(id); sent.delete(id); }
  for (const [t, i] of G.netTrees) if (t > view.lastT) out.tg.push(i);
  for (const f of G.fx) {
    if (f.t0 <= view.lastT || NET_FXI[f.k] == null) continue;
    const power = f.k === 'cast' || f.k === 'bolt' || f.k === 'frost' || f.k === 'dome' || f.k === 'bless' || f.k === 'summon';
    if (!power && !seen(f.x, f.y)) continue;
    const e = [NET_FXI[f.k], Math.round(f.x), Math.round(f.y)];
    if (f.k === 'cast' || f.k === 'frost' || f.k === 'dome' || f.k === 'bless') e.push(Math.round(f.r));
    if (f.k === 'cast') e.push(f.color);
    if (f.k === 'bolt') e.push(+f.seed.toFixed(2));
    if (f.k === 'rubble') e.push(f.size);
    if (f.k === 'corpse') e.push(NET_UTI[f.t], f.o, f.face, Math.max(0, SKINS.indexOf(f.skin)));
    out.fx.push(e);
  }
  for (const p of G.proj) {
    if (p.dead || p.t0 <= view.lastT || (!seen(p.x, p.y) && !seen(p.tx, p.ty))) continue;
    out.pj.push([Math.round(p.x), Math.round(p.y), p.tid, Math.round(p.tx), Math.round(p.ty), p.kind === 'fire' ? 1 : 0, p.sp]);
  }
  out.z = G.zones.map(z => [Math.round(z.x), Math.round(z.y), Math.round(z.r), +z.until.toFixed(1)]);
  out.p = [Math.floor(pl.res.food), Math.floor(pl.res.wood), Math.floor(pl.res.gold), Math.floor(pl.res.foi), pl.popUsed, pl.popCap];
  out.tech = Object.keys(pl.tech); out.cd = pl.cd;
  out.d = G.pl.map(p => p.defeated ? 1 : 0);
  out.ag = G.pl.map(p => ageOf(p));
  if (G.over) { out.over = 1; out.win = G.winTeam; }
  view.lastT = G.time;
  return out;
}

/* ---------- Navigateur : reconstruction de l'état reçu ---------- */
function netClientStart(m) {
  G = newState(m.opts);
  G.mp = true; G.me = m.me; G.W = m.W; G.H = m.H; G.time = m.time; G.netTime = m.time; G.netRecv = nowMs();
  const N = G.W * G.H;
  G.ter = b64ToU8(m.ter); G.tree = Float32Array.from(b64ToU8(m.tree)); G.stump = b64ToU8(m.stump); G.ex = b64ToU8(m.ex);
  G.occ = new Int32Array(N); G.blk = new Uint8Array(N); G.vis = new Uint8Array(N);
  computeTreeVars();
  G.pl = m.pl.map((p, i) => makePlayer(i, p.patron, p.ai, G.opts.diff, p.name, p.team));
  for (let i = 0; i < N; i++) updBlk(i);
  G.netFirst = true;
  return G;
}
function netRemove(id) {
  const e = G.byId.get(id); if (!e) return;
  e.dead = true; G.byId.delete(id); G.dirty = true;
  if (e.k !== 'u') setFootprint(e, false);
}
function netAdd(e) { e.dead = false; G.list.push(e); G.byId.set(e.id, e); (e.k === 'u' ? G.units : e.k === 'b' ? G.blds : G.ress).push(e); return e; }
function netUnit(r) {
  const [id, ti, o, x, y, hp, mhp, st, face, fl, ct, ca, lt, exp] = r;
  let u = G.byId.get(id);
  const t = NET_UT[ti];
  if (!u || u.k !== 'u') {
    u = netAdd({ k: 'u', id, t, o, x, y, nx: x, ny: y, hp, mhp, st: 'idle', face, anim: Math.random() * 10, atkAnim: 0, work: 0, carry: { type: null, amt: 0 },
      frozen: 0, shield: 0, buff: 0, hitT: -9, skin: SKINS[(id * 7 + o) % SKINS.length], moving: false, path: null, sub: null, lastType: null, expire: 0, cd: 0 });
    if (!G.netFirst && o === G.me) H.sfx(U[t].cls === 'myth' ? 'summon' : 'train');
  } else if (hp < u.hp - 0.5) { u.hitT = G.time; if (o === G.me) alertAttacked(u); }
  u.nx = x; u.ny = y;
  if (Math.abs(u.x - x) + Math.abs(u.y - y) > 3 * T) { u.x = x; u.y = y; }
  u.hp = hp; u.mhp = mhp; u.st = NET_ST[st] || 'idle'; u.face = face;
  u.netMoving = !!(fl & 1);
  if ((fl & 2) && !u.netAtk) { u.atkAnim = 0.3; if (!U[t].proj) H.sfxAt(U[t].cls === 'siege' ? 'thud' : 'hit', u.x, u.y, 0.8); }
  u.netAtk = !!(fl & 2);
  u.sub = (fl & 4) ? 'work' : (fl & 64) ? 'drop' : null;
  u.frozen = (fl & 8) ? G.time + 1 : 0; u.shield = (fl & 16) ? G.time + 1 : 0; u.buff = (fl & 32) ? G.time + 1 : 0;
  u.carry.type = NET_RT[ct] || null; u.carry.amt = ca; u.lastType = NET_RT[lt] || null; u.expire = exp;
}
function netBld(r) {
  const [id, ti, o, tx, ty, hp, mhp, built, prog, farm, q, rally] = r;
  let b = G.byId.get(id);
  const t = NET_BT[ti], s = B[t].size;
  if (!b || b.k !== 'b') {
    b = netAdd({ k: 'b', id, t, o, tx, ty, size: s, x: (tx + s / 2) * T, y: (ty + s / 2) * T, hp, mhp, built: !!built, prog: prog / 1000, q: [], rally: null, farmer: 0, hitT: -9, cd: 0 });
    setFootprint(b, true);
  } else {
    if (hp < b.hp - 0.5 && b.built) { b.hitT = G.time; if (o === G.me) alertAttacked(b); }
    if (!b.built && built && o === G.me && !G.netFirst) { H.toast(B[t].name + (B[t].f ? ' terminée' : ' terminé'), 'good'); H.sfx('done'); }
  }
  b.hp = hp; b.mhp = mhp; b.built = !!built; b.prog = prog / 1000; b.farmer = farm ? -1 : 0;
  if (q) b.q = q.map(it => ({ k: it[0], id: it[1], p: it[2] / 1000, blocked: !!it[3], started: true }));
  b.rally = rally ? { x: rally[0], y: rally[1] } : null;
}
function netRes(r) {
  const [id, g, tx, ty, amt, max] = r;
  let e = G.byId.get(id);
  if (!e || e.k !== 'r') { const s = g ? 2 : 1; e = netAdd({ k: 'r', id, t: g ? 'gold' : 'berry', o: -1, tx, ty, size: s, x: (tx + s / 2) * T, y: (ty + s / 2) * T, amt, max }); setFootprint(e, true); }
  e.amt = amt; e.max = max;
}
function netFx(f) {
  const k = NET_FX[f[0]]; if (!k) return;
  const e = { k, x: f[1], y: f[2], t0: G.time, life: NET_FX_LIFE[k] };
  if (k === 'cast' || k === 'frost' || k === 'dome' || k === 'bless') e.r = f[3];
  if (k === 'cast') e.color = f[4];
  if (k === 'bolt') { e.seed = f[3]; H.sfxAt('thunder', e.x, e.y, 1, true); addParts(e.x, e.y, 10, '#dff1ff', 18, 60, 0.4, 2.5, 0); }
  if (k === 'rubble') { e.size = f[3]; H.sfxAt('collapse', e.x, e.y, 1); addParts(e.x, e.y, 26, '#a89a86', e.size * T, 50, 1.4, 5, -10); H.onScorch({ id: (e.x * 31 + e.y) | 0, tx: Math.round(e.x / T - e.size / 2), ty: Math.round(e.y / T - e.size / 2), size: e.size }); }
  if (k === 'corpse') { e.t = NET_UT[f[3]]; e.o = f[4]; e.face = f[5]; e.skin = SKINS[f[6]] || SKINS[1]; H.sfxAt('die', e.x, e.y, 0.5); }
  if (k === 'frost') H.sfxAt('frost', e.x, e.y, 1, true);
  if (k === 'bless') H.sfxAt('heal', e.x, e.y, 1, true);
  if (k === 'dome') H.sfxAt('aegis', e.x, e.y, 1, true);
  if (k === 'summon') H.sfxAt('summon', e.x, e.y, 1, true);
  if (k === 'boom') addParts(e.x, e.y, 6, '#ffb347', 14, 40, 0.5, 3, 0);
  G.fx.push(e);
}
/* Applique un état reçu du serveur. */
function netClientSnap(s) {
  G.netTime = s.time; G.netRecv = nowMs();
  if (G.netFirst || Math.abs(G.time - s.time) > 1) G.time = s.time; // horloge recalée si l'affichage a pris du retard (onglet en arrière-plan)
  const me = G.pl[G.me];
  if (s.p) { me.res.food = s.p[0]; me.res.wood = s.p[1]; me.res.gold = s.p[2]; me.res.foi = s.p[3]; me.popUsed = s.p[4]; me.popCap = s.p[5]; }
  if (s.tech) {
    if (!G.netFirst) for (const k of s.tech) if (!me.tech[k] && R[k]) { H.toast(techDoneText(k), 'good'); H.sfx(R[k].ageUp ? 'start' : 'done'); }
    const t = {}; for (const k of s.tech) t[k] = true; me.tech = t;
  }
  if (s.cd) me.cd = s.cd;
  if (s.d) s.d.forEach((v, i) => { if (G.pl[i]) G.pl[i].defeated = !!v; });
  if (s.ag) s.ag.forEach((v, i) => { const p = G.pl[i]; if (!p) return; if (!G.netFirst && i !== G.me && v > (p.netAge || 0)) H.toast(p.name + ' entre dans l’' + AGES[v].name + '.', 'info'); p.netAge = v; });
  for (const id of s.rm) netRemove(id);
  for (const r of s.u) netUnit(r);
  for (const r of s.b) netBld(r);
  for (const r of s.r) netRes(r);
  for (const i of s.tg) if (G.tree[i] > 0) { G.tree[i] = 0; G.stump[i] = 1; updBlk(i); H.onTreeGone(i % G.W, (i / G.W) | 0); }
  for (const f of s.fx) netFx(f);
  for (const p of s.pj) {
    G.proj.push({ x: p[0], y: p[1], sx: p[0], sy: p[1], tid: p[2], tx: p[3], ty: p[4], kind: p[5] ? 'fire' : 'arrow', sp: p[6], d0: Math.max(1, Math.hypot(p[3] - p[0], p[4] - p[1])), dead: false });
    H.sfxAt(p[5] ? 'fire' : 'arrow', p[0], p[1], 0.7);
  }
  G.zones = (s.z || []).map(z => ({ k: 'sun', x: z[0], y: z[1], r: z[2], until: z[3], o: -1 }));
  if (s.over && !G.over) { G.over = true; G.winTeam = s.win; G.endT = G.time; G.revealAll = true; H.onEnd(G.winTeam); }
  G.netFirst = false; G.dirty = true;
}
/* Avance l'affichage entre deux états : horloge, positions lissées, projectiles, effets, brouillard. */
function netClientFrame(dt) {
  const target = G.netTime + Math.min(0.3, (nowMs() - G.netRecv) / 1000);
  G.time += dt;
  if (Math.abs(G.time - target) > 0.6) G.time = target; else G.time += (target - G.time) * Math.min(1, dt * 3);
  const k = 1 - Math.exp(-dt * 14);
  for (const u of G.units) {
    if (u.dead) continue;
    const dx = u.nx - u.x, dy = u.ny - u.y;
    u.x += dx * k; u.y += dy * k;
    u.moving = u.netMoving || Math.abs(dx) + Math.abs(dy) > 2;
    if (u.atkAnim > 0) u.atkAnim -= dt;
    if (u.sub === 'work' || (u.st === 'build' && !u.moving)) u.work += dt;
    u.anim += dt * (u.moving ? 1 : 0.3);
  }
  for (const p of G.proj) {
    const t = G.byId.get(p.tid);
    if (t && !t.dead) { p.tx = t.x; p.ty = projAim(t); }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), st = p.sp * dt;
    if (d <= st + 3) p.dead = true; else { p.x += dx / d * st; p.y += dy / d * st; }
  }
  if (G.proj.length) G.proj = G.proj.filter(p => !p.dead);
  updateFx(dt);
  G.fogT -= dt; if (G.fogT <= 0) { G.fogT = 0.2; updateFog(); }
  cleanup();
}
