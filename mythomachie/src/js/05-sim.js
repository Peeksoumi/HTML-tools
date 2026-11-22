/* ===== Simulation ===== */
function tick(dt) {
  G.time += dt;
  rebuildSpatial();
  processPaths();
  recountPop();
  for (let i = 0; i < G.blds.length; i++) { const b = G.blds[i]; if (!b.dead) updateBuilding(b, dt); }
  for (let i = 0; i < G.units.length; i++) { const u = G.units[i]; if (!u.dead) updateUnit(u, dt); }
  separation();
  updateProjectiles(dt);
  updateZones();
  updateTimers();
  updateFx(dt);
  if (G.me >= 0) { G.fogT -= dt; if (G.fogT <= 0) { G.fogT = 0.2; updateFog(); } }
  for (const ai of G.ai) aiUpdate(ai, dt);
  G.vicT -= dt; if (G.vicT <= 0) { G.vicT = 1; checkVictory(); }
  cleanup();
}

function recountPop() {
  for (const p of G.pl) { p.popUsed = 0; p.popCap = 0; }
  for (const u of G.units) if (!u.dead) G.pl[u.o].popUsed += U[u.t].pop;
  for (const b of G.blds) {
    if (b.dead) continue; const p = G.pl[b.o];
    if (b.built && B[b.t].pop) p.popCap += B[b.t].pop;
    const it = b.q[0]; if (it && it.k === 'u' && it.started) p.popUsed += U[it.id].pop;
  }
  for (const p of G.pl) p.popCap = Math.min(POP_MAX, p.popCap);
}

/* ----- Unités ----- */
function updateUnit(u, dt) {
  const d = U[u.t];
  u.moving = false;
  if (u.atkAnim > 0) u.atkAnim -= dt;
  if (d.summon && G.time >= u.expire) { kill(u, null, true); return; }
  if (u.frozen > G.time) return;
  u.cd -= dt;
  if (d.heal) { u.healT = (u.healT || 0) - dt; if (u.healT <= 0) { u.healT = 0.5; healAura(u, 0.5); } }
  switch (u.st) {
    case 'idle': stIdle(u, dt, d); break;
    case 'move': stMove(u, dt, d); break;
    case 'attack': stAttack(u, dt, d); break;
    case 'gather': stGather(u, dt, d); break;
    case 'build': stBuild(u, dt, d); break;
    default: u.st = 'idle';
  }
  u.anim += dt * (u.moving ? 1 : 0.3);
}
function followPath(u, dt) {
  if (u.needPath) return false;
  const p = u.path; if (!p || u.pi >= p.length) return true;
  let budget = spd(u) * dt;
  while (budget > 0 && u.pi < p.length) {
    const w = p[u.pi]; const dx = w[0] - u.x, dy = w[1] - u.y; const dd = Math.hypot(dx, dy);
    if (dd <= budget) { u.x = w[0]; u.y = w[1]; budget -= dd; u.pi++; }
    else { u.x += dx / dd * budget; u.y += dy / dd * budget; if (Math.abs(dx) > 0.3) u.face = dx < 0 ? -1 : 1; budget = 0; }
  }
  u.moving = true;
  return u.pi >= p.length;
}
function approach(u, x, y, dt) {
  const dx = x - u.x, dy = y - u.y, dd = Math.hypot(dx, dy); if (dd < 1) return;
  const s = Math.min(dd, spd(u) * dt); u.x += dx / dd * s; u.y += dy / dd * s; u.moving = true;
  if (Math.abs(dx) > 0.5) u.face = dx < 0 ? -1 : 1;
}
function stuckCheck(u, dt, onStuck) {
  u.stuckT += dt;
  if (u.stuckT >= 1.2) {
    const moved = Math.hypot(u.x - u.lastX, u.y - u.lastY);
    u.stuckT = 0; u.lastX = u.x; u.lastY = u.y;
    if (moved < 6 && !u.needPath) { u.stuck++; onStuck(u.stuck); } else u.stuck = 0;
  }
}
function stIdle(u, dt, d) {
  if (d.cls === 'vill') return;
  u.scanT -= dt; if (u.scanT > 0) return;
  u.scanT = 0.35 + Math.random() * 0.3;
  const t = findTarget(u, d.sight * T);
  if (t) setAttack(u, t, false);
}
function stMove(u, dt, d) {
  if (u.amove) {
    u.scanT -= dt;
    if (u.scanT <= 0) { u.scanT = 0.35 + Math.random() * 0.2; const t = findTarget(u, d.sight * T); if (t) { setAttack(u, t, false); return; } }
  }
  if (followPath(u, dt)) {
    if (!u.needPath) { u.st = 'idle'; u.path = null; u.amove = false; u.dest = null; u.scanT = 0.2; }
    return;
  }
  stuckCheck(u, dt, n => {
    if ((u.dest && Math.hypot(u.dest.x - u.x, u.dest.y - u.y) < 56) || n > 4) { u.st = 'idle'; u.path = null; u.amove = false; u.dest = null; }
    else requestPath(u, u.goal);
  });
}
function findTarget(u, rad) {
  const d = U[u.t]; let best = null, bs = 1e18;
  if (!d.onlyB) {
    unitsNear(u.x, u.y, rad, v => {
      if (!isEnemy(u.o, v.o) || G.pl[v.o].defeated) return;
      const dd = (v.x - u.x) ** 2 + (v.y - u.y) ** 2;
      const s = dd * (U[v.t].cls === 'vill' ? 1.8 : 1);
      if (s < bs) { bs = s; best = v; }
    });
    if (best) return best;
  }
  let bd = rad;
  for (const b of G.blds) {
    if (b.dead || !isEnemy(u.o, b.o)) continue;
    const dd = distToRect(u.x, u.y, b.tx, b.ty, b.size);
    if (dd < bd) { bd = dd; best = b; }
  }
  return best;
}
function stAttack(u, dt, d) {
  const t = G.byId.get(u.tgt);
  if (!t || t.dead || !canTarget(u, t) || G.pl[t.o].defeated) { endAttack(u); return; }
  const ed = edgeDist(u, t);
  const range = d.range * T + (d.proj ? 0 : 6);
  if (ed <= range) {
    u.path = null; u.stuckT = 0; u.lastX = u.x; u.lastY = u.y;
    if (Math.abs(t.x - u.x) > 2) u.face = t.x < u.x ? -1 : 1;
    if (u.cd <= 0) { doAttack(u, t, d); u.cd = d.rate; u.atkAnim = 0.3; }
    return;
  }
  if (!u.cmd && ed > (d.sight + 4) * T) { endAttack(u); return; }
  u.repT -= dt;
  if (!u.needPath && (u.repT <= 0 || !u.path)) {
    u.repT = t.k === 'u' ? 0.6 : 5;
    requestPath(u, t.k === 'u' ? { k: 'near', x: t.x, y: t.y } : { k: 'rect', tx: t.tx, ty: t.ty, w: t.size, h: t.size });
  }
  if (u.noPath && !u.needPath) { u.noPath = false; if (!u.cmd || t.k === 'b') { endAttack(u); return; } }
  const done = followPath(u, dt);
  if (done && !u.needPath) {
    if (t.k === 'u') approach(u, t.x, t.y, dt);
    else approach(u, clamp(u.x, t.tx * T, (t.tx + t.size) * T), clamp(u.y, t.ty * T, (t.ty + t.size) * T), dt);
  }
  stuckCheck(u, dt, n => { if ((n > 4 && !u.cmd) || n > 8) endAttack(u); else requestPath(u, u.goal); });
}
function endAttack(u) {
  u.tgt = 0; u.cmd = false;
  if (u.amove && u.dest) { u.st = 'move'; requestPath(u, { k: 'pt', x: u.dest.x, y: u.dest.y }); }
  else { u.st = 'idle'; u.scanT = 0; u.amove = false; }
}
function doAttack(u, t, d) {
  if (d.proj) {
    spawnProj(u.x + u.face * 6, u.y - (d.fly ? 34 : 14), t, u.o, d.cls, atkOf(u), d.proj, d.splash || 0, u.id);
    H.sfxAt(d.proj === 'fire' ? 'fire' : 'arrow', u.x, u.y, 0.7);
  } else {
    hit(t, u.o, d.cls, atkOf(u), u, d.splash || 0, d.bBonus || 1);
    H.sfxAt(t.k === 'b' || d.cls === 'siege' ? 'thud' : 'hit', u.x, u.y, 0.8);
  }
}
function calcDmg(acls, atk, t, bBonus) {
  const tcls = t.k === 'b' ? 'bld' : U[t.t].cls;
  let m = MULT[acls][tcls]; if (tcls === 'bld') m *= (bBonus || 1);
  let dmg = atk * m; if (dmg <= 0) return 0;
  if (t.k === 'u') dmg = Math.max(dmg * 0.2, dmg - armorOf(t));
  return dmg;
}
function hit(t, o, acls, atk, src, splash, bBonus) {
  dealDamage(t, calcDmg(acls, atk, t, bBonus), src, o);
  if (splash > 0) splashAt(t.x, t.y, o, acls, atk * 0.5, splash, src, t);
}
function splashAt(x, y, o, acls, atk, splash, src, except) {
  unitsNear(x, y, splash * T, v => {
    if (v === except || !isEnemy(o, v.o) || G.pl[v.o].defeated) return;
    dealDamage(v, calcDmg(acls, atk, v, 1), src, o);
  });
}
function dealDamage(t, dmg, src, o) {
  if (t.dead || dmg <= 0) return;
  if (t.k === 'u' && t.shield > G.time) dmg *= 0.4;
  t.hp -= dmg; t.hitT = G.time;
  if (t.o === G.me && o !== G.me) alertAttacked(t);
  if (t.k === 'u' && src && !src.dead) retaliate(t, src);
  if (t.hp <= 0) kill(t, o);
}
function retaliate(u, src) {
  if (!isEnemy(u.o, src.o)) return;
  const d = U[u.t];
  if (d.cls !== 'vill' && !(d.onlyB && src.k !== 'b')) {
    const cur = u.tgt ? G.byId.get(u.tgt) : null;
    if (u.st === 'idle' || (u.st === 'move' && u.amove) || (u.st === 'attack' && !u.cmd && cur && cur.k === 'b' && src.k === 'u')) setAttack(u, src, false);
  }
  if (G.time > u.helpT) {
    u.helpT = G.time + 1.5;
    unitsNear(u.x, u.y, 6 * T, v => {
      if (v === u || v.o !== u.o || v.st !== 'idle') return;
      const vd = U[v.t]; if (vd.cls === 'vill' || (vd.onlyB && src.k !== 'b')) return;
      setAttack(v, src, false);
    });
  }
}
function alertAttacked(t) {
  const pl = G.pl[G.me];
  if (G.time - pl.alertT < 12) return;
  pl.alertT = G.time;
  H.toast(t.k === 'b' ? 'Un de vos bâtiments est attaqué !' : (U[t.t].cls === 'vill' ? 'Vos citoyens sont attaqués !' : 'Vos troupes sont attaquées !'), 'warn', { x: t.x, y: t.y, alert: true });
}
function kill(e, ko, silent) {
  if (e.dead) return;
  e.dead = true; G.dirty = true; G.byId.delete(e.id);
  const pl = e.o >= 0 ? G.pl[e.o] : null;
  if (e.k === 'u') {
    if (!silent) {
      if (pl) pl.stats.lost++;
      if (ko != null && ko >= 0 && G.pl[ko]) G.pl[ko].stats.kills++;
      G.fx.push({ k: 'corpse', x: e.x, y: e.y, t: e.t, o: e.o, face: e.face, skin: e.skin, t0: G.time, life: 5 });
      H.sfxAt('die', e.x, e.y, 0.5);
    } else G.fx.push({ k: 'vanish', x: e.x, y: e.y - 10, t0: G.time, life: 0.8 });
    if (e.gt && e.gt.kind === 'ent') { const f = G.byId.get(e.gt.id); if (f && f.farmer === e.id) f.farmer = 0; }
  } else if (e.k === 'b') {
    setFootprint(e, false);
    if (!silent) { if (pl) pl.stats.bLost++; if (ko != null && ko >= 0 && G.pl[ko]) G.pl[ko].stats.bKilled++; }
    G.fx.push({ k: 'rubble', x: e.x, y: e.y, size: e.size, t0: G.time, life: 8 });
    addParts(e.x, e.y, 26, '#a89a86', e.size * T, 50, 1.4, 5, -10);
    H.onScorch(e); H.sfxAt('collapse', e.x, e.y, 1);
    if (e.o === G.me && !silent) H.toast(B[e.t].name + (B[e.t].f ? ' détruite' : ' détruit'), 'bad', { x: e.x, y: e.y });
  } else setFootprint(e, false);
}
function healAura(u, dt) {
  const h = U[u.t].heal;
  unitsNear(u.x, u.y, h.r * T, v => { if (v !== u && v.o === u.o && v.hp < v.mhp && U[v.t].cls !== 'siege') v.hp = Math.min(v.mhp, v.hp + h.hps * dt); });
}

/* ----- Récolte ----- */
function stGather(u, dt, d) {
  if (u.sub === 'drop') { doDrop(u, dt, d); return; }
  const spec = u.gt;
  if (!spec) { u.st = 'idle'; return; }
  let ok = true, rx, ry, rs, isFarm = false, ent = null;
  if (spec.kind === 'tree') { ok = inb(spec.tx, spec.ty) && G.tree[idx(spec.tx, spec.ty)] > 0; rx = spec.tx; ry = spec.ty; rs = 1; }
  else {
    ent = G.byId.get(spec.id);
    if (!ent || ent.dead) ok = false;
    else {
      rx = ent.tx; ry = ent.ty; rs = ent.size;
      if (ent.k === 'b') { isFarm = true; if (!ent.built || ent.o !== u.o) ok = false; else if (ent.farmer && ent.farmer !== u.id && G.byId.get(ent.farmer)) ok = false; else ent.farmer = u.id; }
    }
  }
  if (!ok) { retarget(u); return; }
  const dr = distToRect(u.x, u.y, rx, ry, rs);
  const reach = isFarm ? dr <= 2 : dr <= d.r + 9;
  if (u.sub === 'go') {
    if (reach) { u.sub = 'work'; u.path = null; }
    else {
      if (!u.path && !u.needPath) requestPath(u, gatherGoal(spec));
      if (u.noPath && !u.needPath) { u.noPath = false; retarget(u, true); return; }
      const done = followPath(u, dt);
      if (done && !u.needPath) {
        if (isFarm) approach(u, (rx + rs / 2) * T, (ry + rs / 2) * T, dt);
        else approach(u, clamp(u.x, rx * T, (rx + rs) * T), clamp(u.y, ry * T, (ry + rs) * T), dt);
      }
      stuckCheck(u, dt, n => { if (n >= 3) retarget(u, true); else requestPath(u, gatherGoal(spec)); });
      return;
    }
  }
  if (!reach) { u.sub = 'go'; requestPath(u, gatherGoal(spec)); return; }
  u.work += dt;
  if (!isFarm) u.face = ((rx + rs / 2) * T < u.x) ? -1 : 1;
  else if (Math.random() < dt * 0.3) u.face = -u.face;
  const rtype = u.lastType;
  let take = Math.min(gatherRate(u, rtype, isFarm) * dt, CARRY - u.carry.amt);
  let depleted = false;
  if (spec.kind === 'tree') {
    const i = idx(rx, ry); take = Math.min(take, G.tree[i]); G.tree[i] -= take;
    if (G.tree[i] <= 0.001) { G.tree[i] = 0; G.stump[i] = 1; updBlk(i); H.onTreeGone(rx, ry); depleted = true; }
  } else if (ent.k === 'r') {
    take = Math.min(take, ent.amt); ent.amt -= take;
    if (ent.amt <= 0.001) { kill(ent, null, true); depleted = true; }
  }
  u.carry.type = rtype; u.carry.amt += take;
  if (u.carry.amt >= CARRY - 1e-6 || depleted) startDrop(u);
}
function startDrop(u) {
  const b = nearestDrop(u.o, u.x, u.y);
  if (!b) {
    u.st = 'idle'; u.sub = null;
    if (u.o === G.me) H.toast('Aucun dépôt : construisez une cité ou un entrepôt.', 'warn');
    return;
  }
  u.sub = 'drop'; u.dropId = b.id; u.path = null;
  requestPath(u, { k: 'rect', tx: b.tx, ty: b.ty, w: b.size, h: b.size });
}
function doDrop(u, dt, d) {
  let b = G.byId.get(u.dropId);
  if (!b || b.dead || !b.built) {
    b = nearestDrop(u.o, u.x, u.y);
    if (!b) { u.st = 'idle'; u.sub = null; return; }
    u.dropId = b.id; requestPath(u, { k: 'rect', tx: b.tx, ty: b.ty, w: b.size, h: b.size });
  }
  if (distToRect(u.x, u.y, b.tx, b.ty, b.size) <= d.r + 9) {
    const pl = G.pl[u.o];
    if (u.carry.amt > 0 && u.carry.type) { pl.res[u.carry.type] += u.carry.amt; pl.stats.gathered += u.carry.amt; }
    u.carry.amt = 0; u.carry.type = null;
    if (u.gt) { u.sub = 'go'; u.path = null; const g = gatherGoal(u.gt); if (g) requestPath(u, g); else retarget(u); }
    else { u.st = 'idle'; u.sub = null; }
    return;
  }
  if (!u.path && !u.needPath) requestPath(u, { k: 'rect', tx: b.tx, ty: b.ty, w: b.size, h: b.size });
  const done = followPath(u, dt);
  if (done && !u.needPath) approach(u, clamp(u.x, b.tx * T, (b.tx + b.size) * T), clamp(u.y, b.ty * T, (b.ty + b.size) * T), dt);
  stuckCheck(u, dt, () => requestPath(u, { k: 'rect', tx: b.tx, ty: b.ty, w: b.size, h: b.size }));
}
function retarget(u, avoidCurrent) {
  const type = u.lastType, old = u.gt;
  if (old && old.kind === 'ent') { const f = G.byId.get(old.id); if (f && f.farmer === u.id) f.farmer = 0; }
  const spec = type ? findResource(u.o, type, u.x, u.y, 12, avoidCurrent ? old : null) : null;
  const wasCmd = u.cmd;
  if (spec && startGather(u, spec)) { u.cmd = wasCmd; return; }
  u.gt = null;
  if (u.carry.amt > 0) startDrop(u);
  else { u.st = 'idle'; u.sub = null; }
}

/* ----- Construction ----- */
function stBuild(u, dt, d) {
  const b = G.byId.get(u.tgt);
  if (!b || b.dead || b.o !== u.o || (b.built && b.hp >= b.mhp)) { afterBuild(u, b); return; }
  const dr = distToRect(u.x, u.y, b.tx, b.ty, b.size);
  const reach = dr <= d.r + 9 || (B[b.t].walk && dr <= 2);
  if (!reach) {
    if (!u.path && !u.needPath) requestPath(u, { k: 'rect', tx: b.tx, ty: b.ty, w: b.size, h: b.size });
    if (u.noPath && !u.needPath) { u.noPath = false; u.st = 'idle'; return; }
    const done = followPath(u, dt);
    if (done && !u.needPath) approach(u, clamp(u.x, b.tx * T, (b.tx + b.size) * T), clamp(u.y, b.ty * T, (b.ty + b.size) * T), dt);
    stuckCheck(u, dt, n => { if (n >= 5) { u.st = 'idle'; } else requestPath(u, { k: 'rect', tx: b.tx, ty: b.ty, w: b.size, h: b.size }); });
    return;
  }
  u.path = null; u.work += dt; u.face = b.x < u.x ? -1 : 1;
  const bd = B[b.t];
  if (!b.built) {
    b.prog = Math.min(1, b.prog + dt / bd.time);
    b.hp = Math.min(b.mhp, b.hp + b.mhp * 0.95 * dt / bd.time);
    if (b.prog >= 1) completeBuilding(b);
  } else b.hp = Math.min(b.mhp, b.hp + b.mhp * dt / (bd.time * 1.5));
  if (Math.random() < dt * 1.5) H.sfxAt('build', u.x, u.y, 0.35);
}
function completeBuilding(b) {
  b.built = true; b.prog = 1;
  const pl = G.pl[b.o]; pl.stats.bBuilt++;
  addParts(b.x, b.y + b.size * T * 0.3, 14, '#d8ccb0', b.size * T, 40, 1, 4, -5);
  if (b.o === G.me) { H.toast(B[b.t].name + (B[b.t].f ? ' terminée' : ' terminé'), 'good'); H.sfx('done'); }
}
function afterBuild(u, b) {
  u.st = 'idle';
  const resume = u.resume; u.resume = null;
  if (b && !b.dead && b.t === 'farm' && b.built && (!b.farmer || !G.byId.get(b.farmer))) { if (startGather(u, { kind: 'ent', id: b.id })) { u.cmd = false; return; } }
  let best = null, bd = 10 * T;
  for (const o of G.blds) if (!o.dead && o.o === u.o && !o.built) { const dd = distToRect(u.x, u.y, o.tx, o.ty, o.size); if (dd < bd) { bd = dd; best = o; } }
  if (best) { cmdBuild([u], best); u.resume = resume; u.cmd = false; return; }
  if (resume) {
    const t = specType(resume);
    const spec = t ? resume : null;
    if (spec && startGather(u, spec)) { u.cmd = false; return; }
    const type = resume.kind === 'tree' ? 'wood' : null;
    const alt = findResource(u.o, type || u.lastType || 'wood', u.x, u.y, 12);
    if (alt && startGather(u, alt)) { u.cmd = false; return; }
  }
  if (b && !b.dead && B[b.t].drop) {
    for (const ty of ['wood', 'gold', 'food']) { const spec = findResource(u.o, ty, b.x, b.y, 7, null, u); if (spec && startGather(u, spec)) { u.cmd = false; return; } }
  }
}

/* ----- Bâtiments ----- */
function updateBuilding(b, dt) {
  if (!b.built) return;
  const d = B[b.t], pl = G.pl[b.o];
  if (d.foi) pl.res.foi = Math.min(FOI_MAX, pl.res.foi + d.foi * foiMult(pl) * dt);
  if (d.shoot) {
    b.cd -= dt;
    if (b.cd <= 0) {
      const t = findTargetFromBuilding(b, d.shoot.range * T);
      if (t) { spawnProj(b.x, b.ty * T + 2, t, b.o, 'tower', d.shoot.atk + (pl.tech.walls ? 3 : 0), 'arrow', 0, b.id); b.cd = d.shoot.rate; H.sfxAt('arrow', b.x, b.y, 0.5); }
      else b.cd = 0.4;
    }
  }
  const it = b.q[0];
  if (it) {
    if (!it.started) {
      if (it.k === 'u') { const ud = U[it.id]; if (pl.popUsed + ud.pop > pl.popCap) { it.blocked = true; return; } pl.popUsed += ud.pop; }
      it.started = true; it.blocked = false;
    }
    const time = it.k === 'u' ? U[it.id].time : R[it.id].time;
    it.p += dt / time;
    if (it.p >= 1) { b.q.shift(); if (it.k === 'u') finishUnit(b, it.id); else finishResearch(pl, it.id); }
  }
}
function findTargetFromBuilding(b, rad) {
  let best = null, bs = 1e18;
  unitsNear(b.x, b.y, rad + b.size * T / 2, v => {
    if (!isEnemy(b.o, v.o) || G.pl[v.o].defeated) return;
    const dd = distToRect(v.x, v.y, b.tx, b.ty, b.size); if (dd > rad) return;
    if (dd < bs) { bs = dd; best = v; }
  });
  return best;
}
function finishUnit(b, t) {
  const pl = G.pl[b.o]; const p = spawnPos(b);
  const u = makeUnit(t, b.o, p.x, p.y);
  pl.stats.trained++;
  if (U[t].cls === 'myth') G.fx.push({ k: 'spawn', x: u.x, y: u.y, t0: G.time, life: 1 });
  if (b.o === G.me) H.sfx(U[t].cls === 'myth' ? 'summon' : 'train');
  const rp = b.rally;
  if (rp) {
    if (t === 'villager' && rp.spec && specType(rp.spec)) { if (startGather(u, rp.spec)) u.cmd = false; }
    else { cmdMove([u], rp.x, rp.y); u.cmd = false; }
  }
  return u;
}
function finishResearch(pl, id) {
  pl.tech[id] = true;
  if (id === 'walls') for (const b of G.blds) if (!b.dead && b.o === pl.i) { const m = bldMhp(pl, b.t); b.hp *= m / b.mhp; b.mhp = m; }
  if (id === 'blood') for (const u of G.units) if (!u.dead && u.o === pl.i && U[u.t].cls === 'myth') { const m = unitMhp(pl, u.t); u.hp *= m / u.mhp; u.mhp = m; }
  if (pl.i === G.me) { H.toast(techDoneText(id), 'good'); H.sfx(R[id].ageUp ? 'start' : 'done'); }
  else if (R[id].ageUp && G.me >= 0) H.toast(pl.name + ' entre dans l’' + AGES[R[id].ageUp].name + '.', 'info');
}
function techDoneText(id) { return R[id].ageUp ? 'Vous entrez dans l’' + AGES[R[id].ageUp].name + ' !' : 'Recherche terminée : ' + R[id].name; }

/* ----- Collisions ----- */
function separation() {
  const units = G.units;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]; if (u.dead) continue;
    const ru = U[u.t].r, fu = !!U[u.t].fly;
    unitsNear(u.x, u.y, ru + 14, v => {
      if (v === u || v.id < u.id || !!U[v.t].fly !== fu) return;
      const rv = U[v.t].r; const dx = v.x - u.x, dy = v.y - u.y; const d2 = dx * dx + dy * dy;
      const min = (ru + rv) * 0.85; if (d2 >= min * min) return;
      let d = Math.sqrt(d2), nx, ny;
      if (d < 0.01) { const a = (u.id * 2.39996) % TAU; nx = Math.cos(a); ny = Math.sin(a); d = 0; } else { nx = dx / d; ny = dy / d; }
      const push = min - d;
      let wu = rv * rv / (ru * ru + rv * rv);
      if (u.moving && !v.moving) wu = Math.max(wu, 0.85); else if (v.moving && !u.moving) wu = Math.min(wu, 0.15);
      const k = Math.min(push, 6);
      u.x -= nx * k * wu; u.y -= ny * k * wu; v.x += nx * k * (1 - wu); v.y += ny * k * (1 - wu);
    });
  }
  const maxX = G.W * T, maxY = G.H * T;
  for (let i = 0; i < units.length; i++) {
    const u = units[i]; if (u.dead) continue;
    const r = U[u.t].r;
    if (!U[u.t].fly) collideTiles(u);
    u.x = clamp(u.x, r, maxX - r); u.y = clamp(u.y, r, maxY - r);
  }
}
function collideTiles(u) {
  const r = U[u.t].r * 0.8;
  let tx = Math.floor(u.x / T), ty = Math.floor(u.y / T);
  if (inb(tx, ty) && G.blk[idx(tx, ty)]) {
    const f = nearestFree(tx, ty, 6);
    if (f) { u.x = f[0] * T + T / 2; u.y = f[1] * T + T / 2; tx = f[0]; ty = f[1]; u.path = null; if (u.goal && u.st !== 'idle') requestPath(u, u.goal); }
    return;
  }
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const x = tx + dx, y = ty + dy; if (!inb(x, y) || !G.blk[idx(x, y)]) continue;
    const x0 = x * T, y0 = y * T;
    const cx = clamp(u.x, x0, x0 + T), cy = clamp(u.y, y0, y0 + T);
    const ddx = u.x - cx, ddy = u.y - cy, d2 = ddx * ddx + ddy * ddy;
    if (d2 < r * r && d2 > 1e-6) { const d = Math.sqrt(d2); u.x += ddx / d * (r - d); u.y += ddy / d * (r - d); }
  }
}

/* ----- Projectiles ----- */
function projAim(t) { return t.k === 'u' ? t.y - U[t.t].h * 0.4 - (U[t.t].fly ? 22 : 0) : t.y; }
function spawnProj(x, y, t, o, acls, atk, kind, splash, srcId) {
  const tx = t.x, ty = projAim(t);
  G.proj.push({ t0: G.time, x, y, sx: x, sy: y, tid: t.id, tx, ty, o, acls, atk, kind, splash, src: srcId, sp: kind === 'fire' ? 280 : 420, d0: Math.max(1, Math.hypot(tx - x, ty - y)), dead: false });
}
function updateProjectiles(dt) {
  if (!G.proj.length) return;
  for (const p of G.proj) {
    const t = G.byId.get(p.tid);
    if (t && !t.dead) { p.tx = t.x; p.ty = projAim(t); }
    const dx = p.tx - p.x, dy = p.ty - p.y, dd = Math.hypot(dx, dy), step = p.sp * dt;
    if (dd <= step + 3) {
      p.dead = true;
      const src = G.byId.get(p.src) || null;
      if (t && !t.dead) hit(t, p.o, p.acls, p.atk, src, p.splash, 1);
      else if (p.splash) splashAt(p.tx, p.ty, p.o, p.acls, p.atk * 0.5, p.splash, src, null);
      if (p.kind === 'fire') { G.fx.push({ k: 'boom', x: p.tx, y: p.ty, t0: G.time, life: 0.5 }); addParts(p.tx, p.ty, 6, '#ffb347', 14, 40, 0.5, 3, 0); }
    } else { p.x += dx / dd * step; p.y += dy / dd * step; }
  }
  G.proj = G.proj.filter(p => !p.dead);
}

/* ----- Pouvoirs divins ----- */
function canCast(pl, pid) { return !pl.defeated && unlocked(pl, GP[pid]) && hasTemple(pl) && pl.res.foi >= GP[pid].cost && (pl.cd[pid] || 0) <= G.time; }
function castPower(o, pid, x, y) {
  const pl = G.pl[o], gp = GP[pid];
  if (!canCast(pl, pid)) return false;
  pl.res.foi -= gp.cost; pl.cd[pid] = G.time + gp.cd;
  const r = gp.r * T;
  G.fx.push({ k: 'cast', x, y, r, color: gp.color, t0: G.time, life: 1.1 });
  if (pid === 'bolt') { for (let i = 0; i < 6; i++) G.timers.push({ at: G.time + 0.15 + i * 0.22, k: 'bolt', o, x, y, r }); }
  else if (pid === 'aegis') { unitsNear(x, y, r, v => { if (v.o === o) v.shield = G.time + 15; }); G.fx.push({ k: 'dome', x, y, r, t0: G.time, life: 1.4 }); H.sfxAt('aegis', x, y, 1, true); }
  else if (pid === 'frost') {
    unitsNear(x, y, r, v => { if (isEnemy(o, v.o) && !G.pl[v.o].defeated) { v.frozen = G.time + 6; dealDamage(v, 25, null, o); } });
    G.fx.push({ k: 'frost', x, y, r, t0: G.time, life: 6 }); H.sfxAt('frost', x, y, 1, true);
  } else if (pid === 'einherjar') {
    const tx = clamp(Math.floor(x / T), 0, G.W - 1), ty = clamp(Math.floor(y / T), 0, G.H - 1);
    for (let i = 0; i < 4; i++) {
      const f = nearestFree(clamp(tx + (i % 2), 0, G.W - 1), clamp(ty + (i >> 1), 0, G.H - 1), 6) || [tx, ty];
      const u = makeUnit('einherjar', o, f[0] * T + T / 2, f[1] * T + T / 2); u.expire = G.time + 40;
      G.fx.push({ k: 'summon', x: u.x, y: u.y, t0: G.time, life: 1.2 });
    }
    H.sfxAt('summon', x, y, 1, true);
  } else if (pid === 'sun') { G.zones.push({ k: 'sun', o, x, y, r, until: G.time + 8, nt: G.time }); H.sfxAt('fire', x, y, 1, true); }
  else if (pid === 'blessing') {
    unitsNear(x, y, r, v => { if (v.o === o && U[v.t].cls !== 'siege') { v.hp = v.mhp; v.buff = G.time + 12; } });
    G.fx.push({ k: 'bless', x, y, r, t0: G.time, life: 1.6 }); H.sfxAt('heal', x, y, 1, true);
  }
  pl.stats.powers = (pl.stats.powers || 0) + 1;
  if (o !== G.me && G.me >= 0) { H.toast(pl.name + ' invoque ' + gp.name + ' !', 'warn', { x, y }); H.ping(x, y, gp.color); }
  return true;
}
function updateTimers() {
  if (!G.timers.length) return;
  for (const tm of G.timers) { if (tm.at > G.time) continue; tm.done = true; if (tm.k === 'bolt') boltStrike(tm); }
  G.timers = G.timers.filter(t => !t.done);
}
function boltStrike(tm) {
  const cands = [];
  unitsNear(tm.x, tm.y, tm.r, v => { if (isEnemy(tm.o, v.o) && !G.pl[v.o].defeated) cands.push(v); });
  let px, py, tgt = null;
  if (cands.length) { tgt = cands[Math.floor(Math.random() * cands.length)]; px = tgt.x; py = tgt.y; }
  else {
    for (const b of G.blds) if (!b.dead && isEnemy(tm.o, b.o) && distToRect(tm.x, tm.y, b.tx, b.ty, b.size) < tm.r) { tgt = b; break; }
    if (tgt) { px = tgt.x + (Math.random() - 0.5) * tgt.size * T * 0.6; py = tgt.y + (Math.random() - 0.5) * tgt.size * T * 0.6; }
    else { const a = Math.random() * TAU, rr = Math.random() * tm.r; px = tm.x + Math.cos(a) * rr; py = tm.y + Math.sin(a) * rr; }
  }
  G.fx.push({ k: 'bolt', x: px, y: py, t0: G.time, life: 0.5, seed: Math.random() * 1000 });
  G.fx.push({ k: 'scorch', x: px, y: py, t0: G.time, life: 5 });
  if (tgt) dealDamage(tgt, tgt.k === 'b' ? 35 : 70, null, tm.o);
  unitsNear(px, py, 26, v => { if (v !== tgt && isEnemy(tm.o, v.o) && !G.pl[v.o].defeated) dealDamage(v, 25, null, tm.o); });
  addParts(px, py, 10, '#dff1ff', 18, 60, 0.4, 2.5, 0);
  H.sfxAt('thunder', px, py, 1, true);
}
function updateZones() {
  if (!G.zones.length) return;
  for (const z of G.zones) {
    if (G.time >= z.until) { z.done = true; continue; }
    if (G.time >= z.nt) {
      z.nt += 0.5;
      unitsNear(z.x, z.y, z.r, v => { if (isEnemy(z.o, v.o) && !G.pl[v.o].defeated) dealDamage(v, 7, null, z.o); });
      for (const b of G.blds) if (!b.dead && isEnemy(z.o, b.o) && distToRect(z.x, z.y, b.tx, b.ty, b.size) < z.r) dealDamage(b, 7, null, z.o);
      if (!G.headless) for (let k = 0; k < 4; k++) { const a = Math.random() * TAU, rr = Math.random() * z.r; addParts(z.x + Math.cos(a) * rr, z.y + Math.sin(a) * rr * 0.8, 1, Math.random() < 0.5 ? '#ffcf5a' : '#ff7a2a', 4, 70, 0.9, 3, -20); }
    }
  }
  G.zones = G.zones.filter(z => !z.done);
}

/* ----- Effets ----- */
function updateFx(dt) {
  if (G.fx.length) G.fx = G.fx.filter(f => G.time - f.t0 < f.life);
  const ps = G.parts;
  if (!ps.length) return;
  for (const p of ps) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.g || 0) * dt; p.life -= dt; }
  G.parts = ps.filter(p => p.life > 0);
}
function addParts(x, y, n, color, spread, up, life, size, g) {
  if (G.headless || G.parts.length > 700) return;
  for (let i = 0; i < n; i++) G.parts.push({
    x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread * 0.5,
    vx: (Math.random() - 0.5) * 40, vy: -Math.random() * up, life: life * (0.6 + Math.random() * 0.6), max: life, color, size: size * (0.6 + Math.random() * 0.8), g: g || 0,
  });
}

/* ----- Brouillard (vue du joueur humain) ----- */
const CIRC = [];
function circOffsets(r) {
  if (CIRC[r]) return CIRC[r];
  const a = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r + r) a.push(dx, dy);
  return (CIRC[r] = a);
}
function updateFog() {
  const W = G.W, H2 = G.H, vis = G.vis, ex = G.ex;
  if (G.revealAll) { vis.fill(1); ex.fill(1); G.fogDirty = true; return; }
  vis.fill(0);
  const mark = (x, y, r) => {
    const cx = Math.floor(x / T), cy = Math.floor(y / T), off = circOffsets(r);
    for (let k = 0; k < off.length; k += 2) { const tx = cx + off[k], ty = cy + off[k + 1]; if (tx >= 0 && ty >= 0 && tx < W && ty < H2) vis[ty * W + tx] = 1; }
  };
  const team = G.pl[G.me].team;
  for (const u of G.units) if (!u.dead && G.pl[u.o].team === team) mark(u.x, u.y, U[u.t].sight);
  for (const b of G.blds) if (!b.dead && G.pl[b.o].team === team) mark(b.x, b.y, b.built ? B[b.t].sight : 3);
  for (let i = 0; i < vis.length; i++) if (vis[i]) ex[i] = 1;
  G.fogDirty = true;
}
function visibleAt(x, y) { const tx = Math.floor(x / T), ty = Math.floor(y / T); return inb(tx, ty) && G.vis[idx(tx, ty)] === 1; }
function exploredAt(x, y) { const tx = Math.floor(x / T), ty = Math.floor(y / T); return inb(tx, ty) && G.ex[idx(tx, ty)] === 1; }

/* ----- Victoire ----- */
function checkVictory() {
  for (const pl of G.pl) {
    if (pl.defeated) continue;
    let alive = false;
    for (const b of G.blds) if (!b.dead && b.o === pl.i && (b.t === 'city' || b.t === 'barracks' || b.t === 'temple')) { alive = true; break; }
    if (!alive) for (const u of G.units) if (!u.dead && u.o === pl.i && u.t === 'villager') { alive = true; break; }
    if (!alive) defeatPlayer(pl);
  }
  if (G.over) return;
  const alive = new Set(); for (const p of G.pl) if (!p.defeated) alive.add(p.team);
  if (G.mp) { if (alive.size <= 1) { G.over = true; G.winTeam = alive.size ? [...alive][0] : -1; G.endT = G.time; H.onEnd(G.winTeam); } }
  else if (G.pl[G.me].defeated) endGame(false);
  else if (alive.size <= 1) endGame(true);
}
function defeatPlayer(pl) {
  pl.defeated = true; pl.defeatT = G.time;
  for (const e of G.list) if (!e.dead && e.o === pl.i) kill(e, null, true);
  if (pl.i !== G.me && G.me >= 0) H.toast(pl.name + ' est vaincu !', 'good');
}
function endGame(win) {
  G.over = true; G.win = win; G.endT = G.time;
  if (!win) G.revealAll = true;
  H.onEnd(win);
}
function cleanup() {
  if (!G.dirty) return; G.dirty = false;
  G.list = G.list.filter(e => !e.dead); G.units = G.units.filter(e => !e.dead);
  G.blds = G.blds.filter(e => !e.dead); G.ress = G.ress.filter(e => !e.dead);
  const n = G.sel.length; G.sel = G.sel.filter(id => G.byId.has(id));
  if (G.sel.length !== n) H.onSelChange();
}
