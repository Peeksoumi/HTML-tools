/* ===== Interface : HUD, panneaux, gestes, menus ===== */
const $ = id => document.getElementById(id);
const UI = {
  mode: null, placeType: null, powerId: null, ghost: null, ptarget: null, box: null, boxMode: false,
  topH: 0, botH: 0, mini: null, pings: [], selKey: '', cmdKey: '', hudT: 0, miniT: 0,
  lastTap: { t: 0, id: 0 }, keys: new Set(), touch: false, demolishArm: 0, idleIdx: 0, mouse: null, mouseW: null, armyT: 0,
};
const MENU = { patron: 'zeus', ais: 1, diff: 'normal', map: 'medium' };
const PERF = { acc: 0, n: 0, low: false };
const ZMIN = 0.42, ZMAX = 2.2;
const RES_ORDER = ['food', 'wood', 'gold', 'foi'];
const RES_SHORT = { food: 'nourriture', wood: 'bois', gold: 'or', foi: 'Foi' };

function esc(s) { return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch])); }
function costHTML(cost) {
  let h = '';
  for (const k of RES_ORDER) if (cost[k]) h += '<span class="ci"><img src="' + glyphIcon(k) + '" alt="">' + cost[k] + '</span>';
  return h || '<span class="ci">—</span>';
}
function missingText(cost) {
  const pl = G.pl[0], parts = [];
  for (const k of RES_ORDER) if (cost[k] && pl.res[k] < cost[k]) parts.push(Math.ceil(cost[k] - pl.res[k]) + ' ' + RES_SHORT[k]);
  return parts.length ? 'Il manque ' + parts.join(' et ') + '.' : '';
}
function myStyle() { return P[G.pl[0].patron].style; }

/* ----- Messages ----- */
function toast(msg, kind, at) {
  const box = $('toasts'); if (!box) return;
  for (const el of box.children) if (el.dataset.msg === msg && !el.classList.contains('out')) return;
  const el = document.createElement(at ? 'button' : 'div');
  el.className = 'toast ' + (kind || ''); el.textContent = msg; el.dataset.msg = msg;
  if (at) { el.type = 'button'; el.title = 'Voir l’endroit'; el.addEventListener('click', () => { centerOn(at.x, at.y); el.remove(); }); }
  box.prepend(el);
  while (box.children.length > 4) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 3400); setTimeout(() => el.remove(), 3900);
  if (at && at.alert) { ping(at.x, at.y, '#ff5a4a'); sfx('horn'); }
}
function ping(x, y, col) { UI.pings.push({ x, y, col: col || '#ff5a4a', t0: performance.now() }); }
function mark(x, y, col) { MARKS.push({ x, y, t0: performance.now(), col: col || 'rgba(166,245,160,A)' }); }

/* ----- Sélection ----- */
function selUnits() { const out = []; for (const id of G.sel) { const e = G.byId.get(id); if (e && e.k === 'u' && e.o === 0) out.push(e); } return out; }
function selOne() { return G.sel.length === 1 ? G.byId.get(G.sel[0]) : null; }
function selBld() { const e = selOne(); return e && e.k === 'b' && e.o === 0 ? e : null; }
function setSel(ids) {
  G.sel = ids.slice(0, 150); UI.demolishArm = 0;
  if (UI.mode === 'amove' || UI.mode === 'rally') cancelMode();
  if (UI.mode === 'place' && !selUnits().some(u => u.t === 'villager')) cancelMode();
  refreshPanels(true);
}
function selectSameType(u) {
  const ids = []; for (const v of G.units) if (!v.dead && v.o === 0 && v.t === u.t && onScreen(v.x, v.y, 0)) ids.push(v.id);
  setSel(ids); sfx('click');
}
function boxSelect(b, add) {
  if (!b) return;
  const a = s2w(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1)), c = s2w(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
  const ids = [];
  for (const u of G.units) if (!u.dead && u.o === 0 && u.x >= a.x - 4 && u.x <= c.x + 4 && u.y - 8 >= a.y - 12 && u.y - 8 <= c.y + 12) ids.push(u.id);
  if (ids.length) { const cur = add ? selUnits().map(u => u.id) : []; setSel([...new Set(cur.concat(ids))]); sfx('click'); }
  else if (!add && !UI.touch) setSel([]);
}
function pick(wx, wy) {
  let best = null, bd = 1e9; const extra = UI.touch ? 7 : 2;
  for (const u of G.units) {
    if (u.dead) continue;
    if (u.o !== 0 && !G.revealAll && !visibleAt(u.x, u.y)) continue;
    const d = U[u.t]; const cy = u.y - d.h * 0.45 - (d.fly ? 22 : 0);
    const dd = Math.hypot(wx - u.x, wy - cy), rr = Math.max(d.r + 6, d.h * 0.55) + extra;
    if (dd < rr && dd < bd) { bd = dd; best = u; }
  }
  if (best) return best;
  for (const b of G.blds) {
    if (b.dead) continue;
    if (b.o !== 0 && !G.revealAll && !G.ex[idx(b.tx + (b.size >> 1), b.ty + (b.size >> 1))]) continue;
    const x0 = b.tx * T, y0 = b.ty * T - (b.t === 'farm' ? 0 : BLD_H[b.t] * 0.55), x1 = x0 + b.size * T, y1 = (b.ty + b.size) * T;
    if (wx >= x0 && wx <= x1 && wy >= y0 && wy <= y1) return b;
  }
  for (const r of G.ress) {
    if (r.dead || (!G.revealAll && !G.ex[idx(r.tx, r.ty)])) continue;
    if (distToRect(wx, wy, r.tx, r.ty - (r.t === 'gold' ? 0.35 : 0.2), r.size) < 5 + extra) return r;
  }
  return null;
}
function treeAt(wx, wy) {
  const tx = Math.floor(wx / T);
  for (const dy of [0, 1]) { const ty = Math.floor(wy / T) + dy; if (inb(tx, ty) && G.tree[idx(tx, ty)] > 0 && G.ex[idx(tx, ty)]) return [tx, ty]; }
  return null;
}
function contextAt(wx, wy, touch, hit) {
  if (hit === undefined) hit = pick(wx, wy);
  const units = selUnits();
  if (!units.length) {
    if (hit) { setSel([hit.id]); sfx('click'); } else if (G.sel.length) setSel([]);
    return;
  }
  if (hit && hit.k === 'u' && hit.o === 0) { if (touch) { setSel([hit.id]); sfx('click'); return; } cmdMove(units, wx, wy); mark(wx, wy); return; }
  if (hit && (hit.k === 'u' || hit.k === 'b') && hit.o !== 0) { cmdAttack(units, hit); mark(hit.x, hit.y, 'rgba(255,110,90,A)'); sfx('order'); return; }
  const vills = units.filter(u => u.t === 'villager'), mil = units.filter(u => u.t !== 'villager');
  if (hit && hit.k === 'r') { cmdGather(units, { kind: 'ent', id: hit.id }); mark(hit.x, hit.y, 'rgba(255,224,138,A)'); sfx('order'); return; }
  if (hit && hit.k === 'b' && hit.o === 0) {
    if (vills.length) {
      if (!hit.built || hit.hp < hit.mhp) { cmdBuild(vills, hit); if (mil.length) cmdMove(mil, hit.x, (hit.ty + hit.size) * T + 20); mark(hit.x, hit.y); sfx('order'); return; }
      if (hit.t === 'farm') { cmdGather(vills, { kind: 'ent', id: hit.id }); sfx('order'); return; }
      if (B[hit.t].drop && vills.some(v => v.carry.amt > 0)) { cmdDeposit(vills, hit); sfx('order'); return; }
    }
    if (touch) { setSel([hit.id]); sfx('click'); return; }
    cmdMove(units, wx, wy); mark(wx, wy); return;
  }
  const tree = treeAt(wx, wy);
  if (tree && vills.length) { cmdGather(units, { kind: 'tree', tx: tree[0], ty: tree[1] }); mark(tree[0] * T + 16, tree[1] * T + 20, 'rgba(255,224,138,A)'); sfx('order'); return; }
  cmdMove(units, wx, wy, false); mark(wx, wy); sfx('order');
}
function modeClick(w) {
  if (UI.mode === 'amove') {
    const units = selUnits(); const hit = pick(w.x, w.y);
    if (hit && hit.o !== 0 && hit.k !== 'r') cmdAttack(units, hit); else cmdMove(units, w.x, w.y, true);
    mark(w.x, w.y, 'rgba(255,110,90,A)'); sfx('order');
  } else if (UI.mode === 'rally') {
    const b = selBld();
    if (b) {
      const hit = pick(w.x, w.y), tree = treeAt(w.x, w.y);
      let spec = null;
      if (hit && hit.k === 'r') spec = { kind: 'ent', id: hit.id };
      else if (hit && hit.k === 'b' && hit.t === 'farm' && hit.o === 0) spec = { kind: 'ent', id: hit.id };
      else if (tree) spec = { kind: 'tree', tx: tree[0], ty: tree[1] };
      b.rally = { x: w.x, y: w.y, spec };
      mark(w.x, w.y); sfx('order');
    }
  }
  cancelMode();
}

/* ----- Modes (placement, pouvoir, attaque, ralliement) ----- */
function cancelMode() {
  UI.mode = null; UI.ghost = null; UI.ptarget = null; UI.placeType = null; UI.powerId = null;
  $('confirm').hidden = true; refreshPanels(true);
}
function showConfirm(msg, okLabel) {
  $('confirm-msg').textContent = msg; const ok = $('confirm-ok');
  ok.hidden = !okLabel; if (okLabel) ok.textContent = okLabel;
  $('confirm').hidden = false; updateConfirm();
}
function updateConfirm() {
  if ($('confirm').hidden) return;
  const ok = $('confirm-ok');
  if (UI.mode === 'place' && UI.ghost) ok.disabled = !canPlace(UI.placeType, 0, UI.ghost.tx, UI.ghost.ty, false) || !afford(G.pl[0], B[UI.placeType].cost);
  else if (UI.mode === 'power') ok.disabled = !UI.ptarget || !canCast(G.pl[0], UI.powerId);
  else ok.disabled = false;
}
function viewCenterW() { return s2w(VW / 2, (VH - UI.botH + UI.topH) / 2); }
function startPlace(t) {
  const pl = G.pl[0];
  if (t === 'temple' && countB(0, 'temple') >= B.temple.max) { toast('Trois temples au maximum.', 'warn'); sfx('err'); return; }
  if (!afford(pl, B[t].cost)) { toast(missingText(B[t].cost), 'warn'); sfx('err'); return; }
  UI.mode = 'place'; UI.placeType = t;
  const p = (!UI.touch && UI.mouseW) ? UI.mouseW : viewCenterW();
  setGhost(p.x, p.y);
  if (UI.touch && !canPlace(t, 0, UI.ghost.tx, UI.ghost.ty, false)) {
    // premier emplacement libre autour du centre de l'écran
    const g0 = UI.ghost; let best = null;
    for (let r = 1; r <= 10 && !best; r++) forRing(g0.tx, g0.ty, r, (x, y) => { if (!best && canPlace(t, 0, x, y, true)) best = { tx: x, ty: y }; });
    if (best) { UI.ghost = best; updateConfirm(); }
  }
  showConfirm(UI.touch ? B[t].name + ' : touchez ou glissez l’emplacement' : B[t].name + ' : clic gauche pour bâtir (Maj pour plusieurs)', UI.touch ? 'Construire' : null);
  refreshPanels(true);
}
function setGhost(wx, wy) { const s = B[UI.placeType].size; UI.ghost = { tx: Math.round(wx / T - s / 2), ty: Math.round(wy / T - s / 2) }; updateConfirm(); }
function setTarget(wx, wy) { if (UI.mode === 'place') setGhost(wx, wy); else if (UI.mode === 'power') { UI.ptarget = { x: wx, y: wy }; updateConfirm(); } }
function confirmPlace(keep) {
  const t = UI.placeType, g = UI.ghost; if (!t || !g) return;
  const pl = G.pl[0];
  if (!canPlace(t, 0, g.tx, g.ty, false)) { toast('Emplacement impossible : terrain occupé, eau ou zone inexplorée.', 'warn'); sfx('err'); return; }
  if (!afford(pl, B[t].cost)) { toast(missingText(B[t].cost), 'warn'); sfx('err'); return; }
  const b = placeBuilding(pl, t, g.tx, g.ty);
  const vills = selUnits().filter(u => u.t === 'villager');
  if (b && vills.length) cmdBuild(vills, b);
  sfx('place'); mark(b.x, b.y);
  if (!keep || !afford(pl, B[t].cost)) cancelMode();
}
function startPower(pid) {
  const pl = G.pl[0], gp = GP[pid];
  if (!hasTemple(pl)) { toast('Construisez un temple pour invoquer votre dieu.', 'warn'); sfx('err'); return; }
  const cd = (pl.cd[pid] || 0) - G.time;
  if (cd > 0) { toast(gp.name + ' : encore ' + Math.ceil(cd) + ' s.', 'warn'); sfx('err'); return; }
  if (pl.res.foi < gp.cost) { toast(gp.name + ' demande ' + gp.cost + ' de Foi.', 'warn'); sfx('err'); return; }
  UI.mode = 'power'; UI.powerId = pid;
  const p = (!UI.touch && UI.mouseW) ? UI.mouseW : viewCenterW();
  UI.ptarget = { x: p.x, y: p.y };
  showConfirm(UI.touch ? gp.name + ' : touchez la zone visée' : gp.name + ' : cliquez sur la zone visée', UI.touch ? 'Invoquer' : null);
  refreshPanels(true);
}
function confirmPower() {
  if (!UI.ptarget) return;
  if (castPower(0, UI.powerId, UI.ptarget.x, UI.ptarget.y)) { sfx('cast'); cancelMode(); }
  else { toast('Pouvoir indisponible pour le moment.', 'warn'); sfx('err'); }
}
function setBoxMode(on) { UI.boxMode = on; $('q-box').setAttribute('aria-pressed', on ? 'true' : 'false'); }

/* ----- Actions des boutons ----- */
function doAction(a) {
  const i = a.indexOf(':'), k = i < 0 ? a : a.slice(0, i), v = i < 0 ? '' : a.slice(i + 1);
  const pl = G.pl[0];
  switch (k) {
    case 'build': startPlace(v); break;
    case 'train': case 'res': {
      const b = selBld(); if (!b) return;
      const cost = k === 'train' ? U[v].cost : R[v].cost;
      const r = enqueue(b, k === 'train' ? 'u' : 'r', v);
      if (r === 'cost') { toast(missingText(cost), 'warn'); sfx('err'); }
      else if (r === 'full') { toast('File de production pleine.', 'warn'); sfx('err'); }
      else if (r === 'ok') sfx('click');
      refreshPanels(true); break;
    }
    case 'unq': { const b = selBld(); if (b) { dequeue(b, +v); sfx('click'); refreshPanels(true); } break; }
    case 'stop': cmdStop(selUnits()); sfx('click'); break;
    case 'amove': UI.mode = 'amove'; showConfirm(UI.touch ? 'Attaque : touchez la destination ou l’ennemi' : 'Attaque : cliquez sur la destination', null); break;
    case 'rally': UI.mode = 'rally'; showConfirm(UI.touch ? 'Ralliement : touchez le point (ou une ressource)' : 'Ralliement : cliquez sur le point (ou une ressource)', null); break;
    case 'del': {
      const b = selBld(); if (!b) return;
      if (UI.demolishArm !== b.id) { UI.demolishArm = b.id; toast('Touchez encore « Démolir » pour confirmer.', 'warn'); refreshPanels(true); return; }
      if (!b.built) refund(pl, B[b.t].cost, b.prog < 0.05 ? 1 : 0.5);
      kill(b, null, true); UI.demolishArm = 0; setSel([]); break;
    }
    case 'only': setSel(selUnits().filter(u => u.t === v).map(u => u.id)); break;
    case 'power': startPower(v); break;
  }
}

/* ----- Panneaux ----- */
function trainable(b) { return trainList(b); }
function selKind() {
  const units = selUnits(); const one = selOne();
  if (units.length) return 'u' + (units.some(u => u.t === 'villager') ? 'V' : '') + (units.some(u => u.t !== 'villager') ? 'M' : '');
  if (!one) return 'none';
  if (one.k === 'b') return one.o === 0 ? 'B' : 'xB';
  return one.k === 'r' ? 'R' : 'xU';
}
function selKeyNow() {
  const one = selOne(); let k = selKind() + ':' + G.sel.join(',');
  if (one && one.k === 'b') k += '|' + one.built + '|' + one.q.map(i => i.id + (i.blocked ? '!' : '')).join('.') + '|' + (one.rally ? 1 : 0);
  return k;
}
function cmdKeyNow() {
  const kind = selKind(), b = selBld(), pl = G.pl[0];
  return kind + '|' + (b ? b.t + b.built + b.q.length + b.id : '') + '|' + Object.keys(pl.tech).join() + '|' + countB(0, 'temple') + '|' + UI.demolishArm + '|' + (UI.mode || '') + '|' + (b ? b.q.filter(i => i.k === 'r').map(i => i.id).join() : '');
}
function refreshPanels(force) {
  if (!G) return;
  const sk = selKeyNow(); if (force || sk !== UI.selKey) { UI.selKey = sk; buildSelPanel(); }
  updateSelPanel();
  const ck = cmdKeyNow(); if (force || ck !== UI.cmdKey) { UI.cmdKey = ck; buildCmdPanel(); }
  updateCmdPanel();
}
function portrait(e) {
  if (e.k === 'u') { const pl = G.pl[e.o]; return unitIcon(e.t, pl.color, P[pl.patron].style); }
  if (e.k === 'b') { const pl = G.pl[e.o]; return bldIcon(e.t, P[pl.patron].style, pl.color); }
  return iconURL('res' + e.t, c => { const s = e.t === 'gold' ? goldSprite() : berrySprite(3); const k = Math.min(60 / s.w, 60 / s.h); c.drawImage(s.cv, 32 - s.w * k / 2, 32 - s.h * k / 2, s.w * k, s.h * k); });
}
function buildSelPanel() {
  const el = $('selp'); const units = selUnits(); const one = selOne();
  if (!G.sel.length) { el.innerHTML = '<p class="hint">' + (UI.touch ? 'Touchez une unité ou un bâtiment. Glissez pour vous déplacer.' : 'Cliquez sur une unité ou un bâtiment. Clic droit pour donner un ordre.') + '</p>'; return; }
  if (units.length > 1) {
    const counts = {}; for (const u of units) counts[u.t] = (counts[u.t] || 0) + 1;
    let h = '<div class="multi">';
    for (const t in counts) h += '<button class="chip" data-a="only:' + t + '" title="Ne garder que : ' + esc(U[t].plural) + '"><img src="' + unitIcon(t, G.pl[0].color, myStyle()) + '" alt=""><b>' + counts[t] + '</b></button>';
    h += '</div><p class="sub">' + units.length + ' unités sélectionnées</p>';
    el.innerHTML = h; return;
  }
  const e = one || units[0]; if (!e) { el.innerHTML = ''; return; }
  const owner = e.o >= 0 ? G.pl[e.o] : null;
  let name = e.k === 'u' ? U[e.t].name : e.k === 'b' ? B[e.t].name : RES_ENT_NAME[e.t];
  let h = '<div class="one"><img class="por" src="' + portrait(e) + '" alt=""><div class="info">';
  h += '<div class="nm">' + esc(name) + (owner && e.o !== 0 ? ' <span class="own" style="color:' + owner.color + '">· ' + esc(owner.name) + '</span>' : '') + '</div>';
  if (e.k !== 'r') h += '<div class="hp"><i id="sp-hpf"></i><span id="sp-hpt"></span></div>';
  h += '<div class="st" id="sp-st"></div>';
  if (e.k === 'b' && e.o === 0 && e.q.length) {
    h += '<div class="queue">';
    e.q.forEach((it, i) => {
      const src = it.k === 'u' ? unitIcon(it.id, G.pl[0].color, myStyle()) : glyphIcon(R[it.id].icon);
      h += '<button class="qi" data-a="unq:' + i + '" title="Annuler"><img src="' + src + '" alt="">' + (i === 0 ? '<i class="qp" id="sp-qp"></i>' : '') + '</button>';
    });
    h += '</div>';
  }
  h += '</div></div>';
  el.innerHTML = h;
}
function updateSelPanel() {
  const units = selUnits(), one = selOne();
  const e = one || (units.length === 1 ? units[0] : null); if (!e || e.dead) return;
  const f = $('sp-hpf'), t = $('sp-hpt'), st = $('sp-st');
  if (f) { const frac = e.k === 'b' && !e.built ? e.prog : e.hp / e.mhp; f.style.width = (clamp(frac, 0, 1) * 100).toFixed(1) + '%'; f.className = frac > 0.6 ? '' : frac > 0.3 ? 'mid' : 'low'; }
  if (t) t.textContent = Math.ceil(Math.max(0, e.hp)) + ' / ' + e.mhp;
  if (st) {
    let s = '';
    if (e.k === 'u') {
      const d = U[e.t];
      if (e.t === 'villager') {
        s = e.st === 'gather' ? ('Récolte : ' + RES_SHORT[e.lastType || 'food'] + (e.carry.amt > 0 ? ' (' + Math.floor(e.carry.amt) + '/' + CARRY + ')' : '')) : STATE_TXT[e.st];
      } else {
        s = 'Attaque ' + Math.round(atkOf(e) * 10) / 10 + ' · Armure ' + armorOf(e) + (d.proj ? ' · Portée ' + d.range : '') + ' · ' + STATE_TXT[e.st];
        if (d.summon) s += ' · disparaît dans ' + Math.max(0, Math.ceil(e.expire - G.time)) + ' s';
      }
      if (e.frozen > G.time) s += ' · gelé';
    } else if (e.k === 'b') {
      const d = B[e.t];
      if (!e.built) s = 'En construction : ' + Math.floor(e.prog * 100) + ' %';
      else {
        const parts = [];
        if (d.pop) parts.push('+' + d.pop + ' population');
        if (d.foi && e.o >= 0) parts.push('+' + (d.foi * foiMult(G.pl[e.o]) * 60).toFixed(0) + ' Foi par minute');
        if (d.shoot) parts.push('Tir ' + (d.shoot.atk + (G.pl[e.o].tech.walls ? 3 : 0)) + ', portée ' + d.shoot.range);
        if (e.t === 'farm') parts.push(e.farmer && G.byId.get(e.farmer) ? 'Cultivée' : 'Libre');
        const it = e.q[0];
        if (it && e.o === 0) parts.unshift((it.blocked ? 'Population maximale : bâtissez des maisons' : (it.k === 'u' ? U[it.id].name : R[it.id].name) + ' ' + Math.floor(it.p * 100) + ' %'));
        s = parts.join(' · ');
      }
    } else s = Math.ceil(e.amt) + ' ' + (e.t === 'gold' ? 'or' : 'nourriture') + ' restants';
    if (st.textContent !== s) st.textContent = s;
  }
  const qp = $('sp-qp'); if (qp && e.k === 'b' && e.q[0]) qp.style.setProperty('--p', e.q[0].p.toFixed(3));
}
function cmdBtn(a, img, label, cost, tip, extraCls) {
  return '<button class="cmd ' + (extraCls || '') + '" data-a="' + a + '" data-tip="' + esc(tip || '') + '"' + (cost ? ' data-cost="' + esc(JSON.stringify(cost)) + '"' : '') + '><img src="' + img + '" alt=""><span class="cn">' + esc(label) + '</span>' + (cost ? '<span class="cc">' + costHTML(cost) + '</span>' : '') + '</button>';
}
function buildCmdPanel() {
  const el = $('cmdp'); const units = selUnits(); const pl = G.pl[0]; const sty = myStyle(); let h = '';
  if (units.length) {
    if (units.some(u => u.t === 'villager')) {
      for (const t of BUILD_LIST) h += cmdBtn('build:' + t, bldIcon(t, sty, pl.color), B[t].name, B[t].cost, B[t].name + ' — ' + B[t].desc, UI.mode === 'place' && UI.placeType === t ? 'on' : '');
    }
    if (units.some(u => u.t !== 'villager')) h += cmdBtn('amove', glyphIcon('amove'), 'Attaquer', null, 'Attaque-déplacement : vos unités combattent tout ennemi rencontré en chemin.', UI.mode === 'amove' ? 'on' : '');
    h += cmdBtn('stop', glyphIcon('stop'), 'Stop', null, 'Arrêter l’action en cours.');
  } else {
    const b = selBld();
    if (b) {
      if (b.built) {
        for (const t of trainable(b)) h += cmdBtn('train:' + t, unitIcon(t, pl.color, sty), U[t].name, U[t].cost, U[t].name + ' — ' + U[t].desc + ' (' + U[t].time + ' s, population ' + U[t].pop + ')');
        for (const r of (B[b.t].research || [])) {
          if (pl.tech[r]) continue;
          const queued = G.blds.some(x => !x.dead && x.o === 0 && x.q.some(it => it.k === 'r' && it.id === r));
          if (queued) continue;
          h += cmdBtn('res:' + r, glyphIcon(R[r].icon), R[r].name, R[r].cost, R[r].name + ' — ' + R[r].desc + ' (' + R[r].time + ' s)');
        }
        if (B[b.t].trains) h += cmdBtn('rally', glyphIcon('rally'), 'Ralliement', null, 'Point où se rendent les unités formées. Touchez une ressource pour y envoyer les citoyens.', UI.mode === 'rally' ? 'on' : '');
      }
      h += cmdBtn('del', glyphIcon('del'), UI.demolishArm === b.id ? 'Confirmer' : (b.built ? 'Démolir' : 'Annuler'), null, b.built ? 'Détruire ce bâtiment.' : 'Annuler le chantier (remboursé en partie).', UI.demolishArm === b.id ? 'danger' : '');
    }
  }
  el.innerHTML = h;
}
function updateCmdPanel() {
  const pl = G.pl[0];
  for (const btn of $('cmdp').children) {
    const c = btn.dataset.cost; if (!c) continue;
    let ok = afford(pl, JSON.parse(c));
    const a = btn.dataset.a;
    if (a === 'build:temple' && countB(0, 'temple') >= B.temple.max) ok = false;
    btn.classList.toggle('na', !ok);
    if (a.startsWith('train:')) {
      const b = selBld(); const n = b ? b.q.filter(it => it.k === 'u' && it.id === a.slice(6)).length : 0;
      let badge = btn.querySelector('.qn');
      if (n && !badge) { badge = document.createElement('span'); badge.className = 'qn'; btn.appendChild(badge); }
      if (badge) { if (n) badge.textContent = n; else badge.remove(); }
    }
  }
}
function buildPowers() {
  const el = $('powers'); const pl = G.pl[0]; let h = '';
  for (const pid of P[pl.patron].powers) {
    const gp = GP[pid];
    h += '<button class="pw" data-p="' + pid + '" data-tip="' + esc(gp.name + ' — ' + gp.desc + ' Coût : ' + gp.cost + ' Foi, recharge ' + gp.cd + ' s.') + '" aria-label="' + esc(gp.name) + '"><img src="' + glyphIcon(pid) + '" alt=""><span class="pc">' + gp.cost + '</span></button>';
  }
  el.innerHTML = h;
}
function updatePowers() {
  const pl = G.pl[0]; const temple = hasTemple(pl);
  for (const btn of $('powers').children) {
    const pid = btn.dataset.p, gp = GP[pid], cd = Math.max(0, (pl.cd[pid] || 0) - G.time);
    btn.style.setProperty('--cd', (cd / gp.cd).toFixed(3));
    btn.classList.toggle('off', !temple || pl.res.foi < gp.cost);
    btn.classList.toggle('ready', temple && cd <= 0 && pl.res.foi >= gp.cost);
    btn.classList.toggle('on', UI.mode === 'power' && UI.powerId === pid);
  }
}
function syncBars() {
  const t = $('top').offsetHeight, b = $('bottom').offsetHeight;
  if (t !== UI.topH || b !== UI.botH) { UI.topH = t; UI.botH = b; document.documentElement.style.setProperty('--topH', t + 'px'); document.documentElement.style.setProperty('--botH', b + 'px'); }
}
function hudUpdate() {
  const pl = G.pl[0];
  syncBars();
  for (const k of RES_ORDER) { const v = String(Math.floor(pl.res[k])); const el = $('r-' + k); if (el.textContent !== v) el.textContent = v; }
  const pop = pl.popUsed + '/' + pl.popCap; const pe = $('r-pop'); if (pe.textContent !== pop) pe.textContent = pop;
  pe.parentElement.classList.toggle('full', pl.popUsed >= pl.popCap);
  const g = { food: 0, wood: 0, gold: 0 }; let idle = 0;
  for (const u of G.units) { if (u.dead || u.o !== 0 || u.t !== 'villager') continue; if (u.st === 'gather' && u.lastType) g[u.lastType]++; else if (u.st === 'idle') idle++; }
  for (const k of ['food', 'wood', 'gold']) { const el = $('g-' + k); const v = g[k] ? String(g[k]) : ''; if (el.textContent !== v) el.textContent = v; }
  const ie = $('idle-n'); ie.textContent = idle; ie.hidden = idle === 0; $('q-idle').classList.toggle('alert', idle > 0);
  $('clock').textContent = fmtTime(G.time);
  updatePowers();
  if (UI.mode) updateConfirm();
  // conseils de départ
  if (!G.over && UI.hintsOn) {
    const H0 = [[2, UI.touch ? 'Touchez un citoyen, puis un buisson, un arbre ou la mine d’or pour récolter.' : 'Clic gauche pour choisir une unité, clic droit pour lui donner un ordre.'],
      [22, 'Formez des citoyens à la Cité et bâtissez des maisons pour loger votre peuple.'],
      [80, 'La Caserne forme l’armée ; le Temple produit la Foi des pouvoirs divins.'],
      [160, 'Hoplite bat cavalier, cavalier bat archer, archer bat hoplite.']];
    while (G.hints < H0.length && G.time >= H0[G.hints][0]) { toast(H0[G.hints][1], 'info'); G.hints++; }
  }
}
function idleNext() {
  const idle = G.units.filter(u => !u.dead && u.o === 0 && u.t === 'villager' && u.st === 'idle');
  if (!idle.length) { toast('Aucun citoyen inactif.', 'info'); return; }
  UI.idleIdx = (UI.idleIdx + 1) % idle.length; const u = idle[UI.idleIdx];
  setSel([u.id]); centerOn(u.x, u.y); sfx('click');
}
function selectArmy() {
  const mil = G.units.filter(u => !u.dead && u.o === 0 && u.t !== 'villager');
  if (!mil.length) { toast('Vous n’avez pas encore de soldats.', 'info'); return; }
  const now = performance.now();
  setSel(mil.map(u => u.id)); sfx('click');
  if (now - UI.armyT < 600) { const c = centroid(mil); centerOn(c.x, c.y); }
  UI.armyT = now;
}

/* ----- Info-bulle ----- */
let tipT = 0;
function showTip(btn) {
  const tip = $('tip'), txt = btn.dataset.tip; if (!txt) return;
  tip.textContent = txt; tip.hidden = false;
  const r = btn.getBoundingClientRect(), tw = Math.min(280, innerWidth - 16);
  tip.style.maxWidth = tw + 'px';
  const x = clamp(r.left + r.width / 2 - tw / 2, 8, innerWidth - tw - 8);
  tip.style.left = x + 'px'; tip.style.top = Math.max(8, r.top - tip.offsetHeight - 8) + 'px';
}
function hideTip() { clearTimeout(tipT); $('tip').hidden = true; }

/* ----- Saisie sur le canevas ----- */
const PTR = new Map(); let GEST = null; let longT = 0;
function canvasXY(e) { const r = CV.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function startPinch() {
  const pts = [...PTR.values()]; const a = pts[0], b = pts[1];
  GEST = { k: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: G.cam.z };
  GEST.w = s2w((a.x + b.x) / 2, (a.y + b.y) / 2); UI.box = null;
}
function updatePinch() {
  const pts = [...PTR.values()]; if (pts.length < 2) return; const a = pts[0], b = pts[1];
  const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  G.cam.z = clamp(GEST.z0 * d / GEST.d0, ZMIN, ZMAX);
  G.cam.x = GEST.w.x - mx / G.cam.z; G.cam.y = GEST.w.y - my / G.cam.z; clampCam();
}
function targetScreen() {
  if (UI.mode === 'place' && UI.ghost) { const s = B[UI.placeType].size; return w2s((UI.ghost.tx + s / 2) * T, (UI.ghost.ty + s / 2) * T); }
  if (UI.mode === 'power' && UI.ptarget) return w2s(UI.ptarget.x, UI.ptarget.y);
  return null;
}
function onPtrDown(e) {
  if (!G || G.paused) return;
  audioUnlock(); hideTip();
  try { CV.setPointerCapture(e.pointerId); } catch (_) { }
  const [x, y] = canvasXY(e);
  PTR.set(e.pointerId, { x, y, sx: x, sy: y, t0: performance.now(), type: e.pointerType });
  if (e.pointerType === 'mouse') { onMouseDown(e, x, y); return; }
  UI.touch = true;
  if (PTR.size >= 2) { clearTimeout(longT); startPinch(); return; }
  if (UI.mode === 'place' || UI.mode === 'power') {
    const ts = targetScreen();
    if (ts && Math.hypot(ts.x - x, ts.y - y) < 70 * Math.max(1, G.cam.z)) { GEST = { k: 'ghost', id: e.pointerId, moved: false }; return; }
  }
  GEST = { k: 'tap', id: e.pointerId };
  const id = e.pointerId;
  longT = setTimeout(() => {
    if (GEST && GEST.k === 'tap' && GEST.id === id && !UI.mode) {
      const p = PTR.get(id); if (!p) return;
      GEST = { k: 'box', id }; UI.box = { x0: p.sx, y0: p.sy, x1: p.x, y1: p.y };
      try { navigator.vibrate && navigator.vibrate(12); } catch (_) { }
    }
  }, 400);
}
function onPtrMove(e) {
  if (!G) return;
  const [x, y] = canvasXY(e);
  if (e.pointerType === 'mouse') { onMouseMove(e, x, y); return; }
  const p = PTR.get(e.pointerId); if (!p) return;
  const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
  if (!GEST) return;
  if (GEST.k === 'pinch') { updatePinch(); return; }
  if (GEST.id !== e.pointerId) return;
  const moved = Math.hypot(x - p.sx, y - p.sy) > 10;
  if (GEST.k === 'tap' && moved) {
    clearTimeout(longT);
    if (UI.boxMode && !UI.mode) { GEST = { k: 'box', id: e.pointerId }; UI.box = { x0: p.sx, y0: p.sy, x1: x, y1: y }; }
    else GEST = { k: 'pan', id: e.pointerId };
  }
  if (GEST.k === 'pan') { G.cam.x -= dx / G.cam.z; G.cam.y -= dy / G.cam.z; clampCam(); }
  else if (GEST.k === 'box') { UI.box.x1 = x; UI.box.y1 = y; }
  else if (GEST.k === 'ghost') { if (moved) GEST.moved = true; if (GEST.moved) { const w = s2w(x, y - (UI.mode === 'place' ? 30 : 0)); setTarget(w.x, w.y); } }
}
function onPtrUp(e, cancel) {
  if (!G) return;
  const p = PTR.get(e.pointerId); PTR.delete(e.pointerId);
  if (e.pointerType === 'mouse') { if (!cancel) onMouseUp(e); else { GEST = null; UI.box = null; } return; }
  clearTimeout(longT);
  if (!GEST || !p) { if (!PTR.size) GEST = null; return; }
  if (GEST.k === 'pinch') {
    if (PTR.size === 1) { const [id, q] = [...PTR.entries()][0]; q.sx = q.x; q.sy = q.y; GEST = { k: 'pan', id }; }
    else if (PTR.size === 0) GEST = null;
    return;
  }
  if (GEST.id !== e.pointerId) return;
  const g = GEST; GEST = null;
  if (cancel) { UI.box = null; return; }
  if (g.k === 'tap') onTap(p.x, p.y);
  else if (g.k === 'box') { const b = UI.box; UI.box = null; if (b && Math.hypot(b.x1 - b.x0, b.y1 - b.y0) > 14) { boxSelect(b, false); if (UI.boxMode) setBoxMode(false); } else onTap(p.x, p.y); }
  else if (g.k === 'ghost' && !g.moved) { const w = s2w(p.x, p.y); setTarget(w.x, w.y); }
}
function onTap(sx, sy) {
  const w = s2w(sx, sy);
  if (UI.mode === 'place' || UI.mode === 'power') { setTarget(w.x, w.y); return; }
  if (UI.mode === 'amove' || UI.mode === 'rally') { modeClick(w); return; }
  const hit = pick(w.x, w.y), now = performance.now();
  if (hit && hit.k === 'u' && hit.o === 0 && now - UI.lastTap.t < 340 && UI.lastTap.id === hit.id) { selectSameType(hit); UI.lastTap.t = 0; return; }
  UI.lastTap = { t: now, id: hit ? hit.id : 0 };
  contextAt(w.x, w.y, true, hit);
}
function onMouseDown(e, x, y) {
  UI.touch = false;
  const w = s2w(x, y);
  if (e.button === 2) { if (UI.mode) { cancelMode(); return; } contextAt(w.x, w.y, false); return; }
  if (e.button === 1) { GEST = { k: 'mpan', lx: x, ly: y }; e.preventDefault(); return; }
  if (e.button !== 0) return;
  if (UI.mode === 'place') { setGhost(w.x, w.y); confirmPlace(e.shiftKey); return; }
  if (UI.mode === 'power') { UI.ptarget = w; confirmPower(); return; }
  if (UI.mode === 'amove' || UI.mode === 'rally') { modeClick(w); return; }
  GEST = { k: 'mdown', sx: x, sy: y, shift: e.shiftKey };
}
function onMouseMove(e, x, y) {
  UI.mouse = { x, y }; UI.mouseW = s2w(x, y);
  if (UI.mode === 'place') setGhost(UI.mouseW.x, UI.mouseW.y);
  if (UI.mode === 'power') UI.ptarget = UI.mouseW;
  if (!GEST) return;
  if (GEST.k === 'mpan') { G.cam.x -= (x - GEST.lx) / G.cam.z; G.cam.y -= (y - GEST.ly) / G.cam.z; GEST.lx = x; GEST.ly = y; clampCam(); }
  else if (GEST.k === 'mdown' && Math.hypot(x - GEST.sx, y - GEST.sy) > 6) { GEST.k = 'mbox'; UI.box = { x0: GEST.sx, y0: GEST.sy, x1: x, y1: y }; }
  else if (GEST.k === 'mbox') { UI.box.x1 = x; UI.box.y1 = y; }
}
function onMouseUp() {
  const g = GEST; GEST = null; if (!g) return;
  if (g.k === 'mbox') { const b = UI.box; UI.box = null; boxSelect(b, g.shift); return; }
  if (g.k === 'mdown') {
    const w = s2w(g.sx, g.sy), hit = pick(w.x, w.y), now = performance.now();
    if (hit && hit.k === 'u' && hit.o === 0 && now - UI.lastTap.t < 340 && UI.lastTap.id === hit.id) { selectSameType(hit); UI.lastTap.t = 0; return; }
    UI.lastTap = { t: now, id: hit ? hit.id : 0 };
    if (hit && hit.k === 'u' && hit.o === 0 && g.shift) {
      const cur = selUnits().map(u => u.id); const i = cur.indexOf(hit.id);
      if (i >= 0) cur.splice(i, 1); else cur.push(hit.id); setSel(cur);
    } else if (hit) setSel([hit.id]);
    else if (!g.shift) setSel([]);
    if (hit) sfx('click');
  }
}
function miniEvent(e) {
  const m = UI.mini; if (!m || !G || !m.k) return;
  const r = $('mini').getBoundingClientRect();
  const x = (e.clientX - r.left - m.ox) / m.k * T, y = (e.clientY - r.top - m.oy) / m.k * T;
  if (e.button === 2 && selUnits().length) { cmdMove(selUnits(), x, y, false); mark(x, y); return; }
  centerOn(x, y);
}

/* ----- Disposition ----- */
function layout() {
  DPR = PERF.low ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  VW = window.innerWidth; VH = window.innerHeight;
  if (CV) { CV.width = Math.round(VW * DPR); CV.height = Math.round(VH * DPR); }
  const top = $('top'), bot = $('bottom');
  UI.topH = top && !$('hud').hidden ? top.offsetHeight : 0;
  UI.botH = bot && !$('hud').hidden ? bot.offsetHeight : 0;
  document.documentElement.style.setProperty('--topH', UI.topH + 'px');
  document.documentElement.style.setProperty('--botH', UI.botH + 'px');
  const mc = $('mini');
  if (mc) {
    const w = mc.clientWidth || 120, h = mc.clientHeight || 120, d = Math.min(window.devicePixelRatio || 1, 2);
    mc.width = Math.round(w * d); mc.height = Math.round(h * d);
    UI.mini = { ctx: mc.getContext('2d'), w, h, dpr: d, k: UI.mini && UI.mini.k, ox: 0, oy: 0 };
  }
  if (G) clampCam();
}

/* ----- Écrans ----- */
function showScreen(id) { for (const s of ['menu', 'pause', 'end', 'help']) { const el = $(s); if (el) el.hidden = s !== id && !(id === 'help' && s === UI.helpFrom); } }
function enterGame() {
  $('menu').hidden = true; $('end').hidden = true; $('pause').hidden = true; $('help').hidden = true; $('hud').hidden = false;
  UI.mode = null; UI.box = null; UI.pings = []; MARKS.length = 0; $('confirm').hidden = true; setBoxMode(false);
  layout(); buildPowers(); refreshPanels(true);
  G.paused = false;
  try { UI.hintsOn = !localStorage.getItem('mythomachie.hints'); localStorage.setItem('mythomachie.hints', '1'); } catch (_) { UI.hintsOn = true; }
  if (G.time > 5) UI.hintsOn = false;
  $('b-speed').textContent = '×' + String(G.speed).replace('.', ',');
}
function startNewGame(extra) {
  const o = Object.assign({}, MENU, extra || {});
  if (o.seed == null) o.seed = (Math.random() * 1e9) | 0;
  try { localStorage.setItem('mythomachie.menu', JSON.stringify(MENU)); } catch (_) { }
  setupGame(o); prepareRender();
  G.cam.z = VW < 700 ? 1.05 : 1.3;
  enterGame();
  const city = G.blds.find(b => b.o === 0 && b.t === 'city');
  if (city) centerOn(city.x, city.y + 40);
  sfx('start');
}
function pauseGame() {
  if (!G || G.over) return;
  G.paused = true; cancelMode(); hideTip();
  $('pause').hidden = false;
  const sp = $('pause').querySelectorAll('[data-speed]'); for (const b of sp) b.setAttribute('aria-pressed', String(+b.dataset.speed === G.speed));
  $('b-sound').textContent = AU.on ? 'Sons : activés' : 'Sons : coupés';
  $('save-msg').textContent = '';
}
function resumeGame() { $('pause').hidden = true; if (G) G.paused = false; }
function quitToMenu() {
  if (G && !G.over) saveGame(true);
  $('pause').hidden = true; $('end').hidden = true; $('hud').hidden = true; $('menu').hidden = false;
  G = null; refreshContinue(); layout();
}
function showEnd(win) {
  const pl = G.pl[0];
  $('end-title').textContent = win ? 'Victoire' : 'Défaite';
  $('end-title').className = win ? 'win' : 'lose';
  $('end-sub').textContent = win ? 'Les panthéons rivaux sont tombés. Votre dieu règne seul.' : 'Votre peuple est dispersé. Les dieux rivaux se partagent vos terres.';
  let h = '<table><thead><tr><th>Camp</th><th title="Ressources récoltées">Récolte</th><th title="Unités formées">Formées</th><th title="Unités perdues">Perdues</th><th title="Ennemis abattus">Abattus</th><th title="Bâtiments ennemis rasés">Rasés</th></tr></thead><tbody>';
  for (const p of G.pl) h += '<tr><td><i class="dot" style="background:' + p.color + '"></i>' + esc(p.name) + ' <small>(' + P[p.patron].name + ')</small></td><td>' + Math.floor(p.stats.gathered) + '</td><td>' + p.stats.trained + '</td><td>' + p.stats.lost + '</td><td>' + p.stats.kills + '</td><td>' + p.stats.bKilled + '</td></tr>';
  h += '</tbody></table><p class="sub">Durée : ' + fmtTime(G.time) + '</p>';
  $('end-stats').innerHTML = h;
  $('end').hidden = false;
  clearSave();
  sfx(win ? 'win' : 'lose');
}
function refreshContinue() {
  const s = loadSaveMeta(); const b = $('b-continue');
  if (s) { b.hidden = false; b.textContent = 'Reprendre la partie (' + P[s.patron].name + ', ' + fmtTime(s.time) + ')'; } else b.hidden = true;
}
function renderGods() {
  const el = $('gods'); let h = '';
  for (const pid of PATRONS) {
    const p = P[pid], m = U[p.myth];
    h += '<button class="god" data-god="' + pid + '" aria-pressed="' + (MENU.patron === pid) + '"><canvas width="144" height="144" aria-hidden="true"></canvas><span class="gn">' + p.name + '</span><span class="gr">' + p.realm + ' · ' + p.people + '</span>' +
      '<span class="gl"><b>Créature</b> ' + m.name + '</span><span class="gl"><b>Pouvoirs</b> ' + p.powers.map(x => GP[x].name).join(' · ') + '</span><span class="gl"><b>Bienfait</b> ' + p.bonus + '</span></button>';
  }
  el.innerHTML = h;
  for (const b of el.querySelectorAll('.god')) { const c = b.querySelector('canvas').getContext('2d'); c.scale(2, 2); drawEmblem(c, b.dataset.god, 72); }
}
function syncMenu() {
  for (const b of document.querySelectorAll('.god')) b.setAttribute('aria-pressed', String(b.dataset.god === MENU.patron));
  for (const seg of document.querySelectorAll('.seg[data-opt]')) for (const b of seg.children) b.setAttribute('aria-pressed', String(String(MENU[seg.dataset.opt]) === b.dataset.v));
}

/* ----- Ciel du menu ----- */
const SKY = { stars: [], links: [], t0: 0 };
function initSky() {
  const r = mulberry32(20261121);
  SKY.stars = []; for (let i = 0; i < 160; i++) SKY.stars.push({ x: r(), y: r() * 0.9, s: r() * 1.4 + 0.3, p: r() * TAU });
  SKY.links = [];
  const groups = [[0.12, 0.18], [0.8, 0.14], [0.68, 0.62], [0.2, 0.66]];
  for (const [gx, gy] of groups) { const pts = []; for (let k = 0; k < 6; k++) pts.push({ x: gx + (r() - 0.5) * 0.16, y: gy + (r() - 0.5) * 0.18 }); SKY.links.push(pts); }
}
function drawSky(now) {
  const cv = $('sky'); if (!cv || $('menu').hidden) return;
  const w = cv.clientWidth, h = cv.clientHeight, d = Math.min(devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); }
  const c = cv.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
  const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#070a1c'); g.addColorStop(0.55, '#121a4a'); g.addColorStop(1, '#2a2250');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const t = REDUCED ? 0 : now / 1000;
  for (const s of SKY.stars) { c.globalAlpha = 0.45 + 0.4 * Math.sin(t * 1.3 + s.p); c.fillStyle = '#f3e9c8'; c.beginPath(); c.arc(s.x * w, s.y * h, s.s, 0, TAU); c.fill(); }
  c.globalAlpha = 1; c.strokeStyle = 'rgba(217,181,82,0.22)'; c.lineWidth = 1;
  for (const pts of SKY.links) { c.beginPath(); pts.forEach((p, i) => { const x = p.x * w + Math.sin(t * 0.05 + i) * 2, y = p.y * h; if (i) c.lineTo(x, y); else c.moveTo(x, y); }); c.stroke(); for (const p of pts) { c.fillStyle = 'rgba(243,221,146,0.9)'; c.beginPath(); c.arc(p.x * w, p.y * h, 1.8, 0, TAU); c.fill(); } }
  const hz = h * 0.82; c.fillStyle = 'rgba(5,7,18,0.85)';
  c.beginPath(); c.moveTo(0, h); c.lineTo(0, hz);
  for (let x = 0; x <= w; x += 24) c.lineTo(x, hz - Math.abs(Math.sin(x * 0.006)) * 38 - Math.sin(x * 0.021) * 10);
  c.lineTo(w, h); c.closePath(); c.fill();
}
const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----- Initialisation ----- */
function initUI() {
  CV = $('cv'); CTX = CV.getContext('2d');
  UI.touch = matchMedia('(pointer: coarse)').matches;
  for (const img of document.querySelectorAll('img[data-g]')) img.src = glyphIcon(img.dataset.g);
  try { const m = JSON.parse(localStorage.getItem('mythomachie.menu') || 'null'); if (m) for (const k in MENU) if (m[k] != null) MENU[k] = m[k]; } catch (_) { }
  if (!P[MENU.patron]) MENU.patron = 'zeus';
  renderGods(); syncMenu(); initSky(); refreshContinue();
  $('gods').addEventListener('click', e => { const b = e.target.closest('.god'); if (!b) return; MENU.patron = b.dataset.god; syncMenu(); audioUnlock(); sfx('click'); });
  for (const seg of document.querySelectorAll('.seg[data-opt]')) seg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const k = seg.dataset.opt;
    MENU[k] = k === 'ais' ? +b.dataset.v : b.dataset.v; syncMenu(); audioUnlock(); sfx('click');
  });
  $('b-play').addEventListener('click', () => { audioUnlock(); startNewGame(); });
  $('b-continue').addEventListener('click', () => { audioUnlock(); if (!loadGame()) { toast('Sauvegarde illisible.', 'bad'); refreshContinue(); } });
  $('b-help').addEventListener('click', () => { UI.helpFrom = 'menu'; $('help').hidden = false; });
  $('help-close').addEventListener('click', () => { $('help').hidden = true; });
  // Sur le site, le lien télécharge index.html ; dans la visionneuse Claude ou une copie locale, on enregistre la page en mémoire.
  $('b-download').addEventListener('click', e => { if ((window.claude && typeof window.claude.use === 'function') || location.protocol === 'file:') { e.preventDefault(); downloadGame(); } });
  $('b-menu').addEventListener('click', pauseGame);
  $('b-speed').addEventListener('click', () => { const s = [1, 1.5, 2]; G.speed = s[(s.indexOf(G.speed) + 1) % s.length]; $('b-speed').textContent = '×' + String(G.speed).replace('.', ','); sfx('click'); });
  $('b-resume').addEventListener('click', resumeGame);
  $('b-save').addEventListener('click', () => { $('save-msg').textContent = saveGame() ? 'Partie sauvegardée dans ce navigateur.' : 'Sauvegarde impossible ici (stockage indisponible).'; });
  $('b-sound').addEventListener('click', () => { AU.on = !AU.on; $('b-sound').textContent = AU.on ? 'Sons : activés' : 'Sons : coupés'; try { localStorage.setItem('mythomachie.sound', AU.on ? '1' : '0'); } catch (_) { } });
  $('b-help2').addEventListener('click', () => { UI.helpFrom = 'pause'; $('help').hidden = false; });
  $('b-quit').addEventListener('click', quitToMenu);
  for (const b of $('pause').querySelectorAll('[data-speed]')) b.addEventListener('click', () => { G.speed = +b.dataset.speed; $('b-speed').textContent = '×' + String(G.speed).replace('.', ','); for (const x of $('pause').querySelectorAll('[data-speed]')) x.setAttribute('aria-pressed', String(x === b)); });
  $('b-again').addEventListener('click', () => { $('end').hidden = true; startNewGame(); });
  $('b-tomenu').addEventListener('click', quitToMenu);
  $('confirm-ok').addEventListener('click', () => { if (UI.mode === 'place') confirmPlace(false); else if (UI.mode === 'power') confirmPower(); });
  $('confirm-no').addEventListener('click', cancelMode);
  $('q-idle').addEventListener('click', idleNext);
  $('q-army').addEventListener('click', selectArmy);
  $('q-box').addEventListener('click', () => { setBoxMode(!UI.boxMode); if (UI.boxMode) toast('Glissez le doigt pour entourer vos unités.', 'info'); });
  const panelClick = e => { const b = e.target.closest('[data-a]'); if (!b) return; hideTip(); audioUnlock(); doAction(b.dataset.a); };
  $('cmdp').addEventListener('click', panelClick); $('selp').addEventListener('click', panelClick);
  $('powers').addEventListener('click', e => { const b = e.target.closest('.pw'); if (!b) return; hideTip(); audioUnlock(); if (UI.mode === 'power' && UI.powerId === b.dataset.p) cancelMode(); else startPower(b.dataset.p); });
  for (const box of [$('cmdp'), $('powers')]) {
    box.addEventListener('pointerover', e => { const b = e.target.closest('[data-tip]'); if (b && e.pointerType === 'mouse') { clearTimeout(tipT); tipT = setTimeout(() => showTip(b), 250); } });
    box.addEventListener('pointerout', e => { if (e.pointerType === 'mouse') hideTip(); });
    box.addEventListener('pointerdown', e => { const b = e.target.closest('[data-tip]'); if (b && e.pointerType !== 'mouse') { clearTimeout(tipT); tipT = setTimeout(() => showTip(b), 450); } });
    box.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') setTimeout(hideTip, 1600); });
  }
  CV.addEventListener('pointerdown', onPtrDown);
  CV.addEventListener('pointermove', onPtrMove);
  CV.addEventListener('pointerup', e => onPtrUp(e, false));
  CV.addEventListener('pointercancel', e => onPtrUp(e, true));
  CV.addEventListener('contextmenu', e => e.preventDefault());
  CV.addEventListener('wheel', e => {
    if (!G) return; e.preventDefault();
    const [x, y] = canvasXY(e), w = s2w(x, y), f = Math.exp(-e.deltaY * 0.0015);
    G.cam.z = clamp(G.cam.z * f, ZMIN, ZMAX); G.cam.x = w.x - x / G.cam.z; G.cam.y = w.y - y / G.cam.z; clampCam();
  }, { passive: false });
  const mini = $('mini'); let miniDown = false;
  mini.addEventListener('pointerdown', e => { miniDown = true; try { mini.setPointerCapture(e.pointerId); } catch (_) { } miniEvent(e); });
  mini.addEventListener('pointermove', e => { if (miniDown && e.buttons !== 2) miniEvent(e); });
  mini.addEventListener('pointerup', () => { miniDown = false; });
  mini.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => {
    if (!G || $('hud').hidden) return;
    if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    UI.keys.add(e.code);
    if (e.code === 'Escape') { if (!$('help').hidden) $('help').hidden = true; else if (!$('pause').hidden) resumeGame(); else if (UI.mode) cancelMode(); else if (G.sel.length) setSel([]); else pauseGame(); }
    else if (G.paused) return;
    else if (e.code === 'Space') { const us = selUnits(); const one = selOne(); if (us.length) { const c = centroid(us); centerOn(c.x, c.y); } else if (one) centerOn(one.x, one.y); e.preventDefault(); }
    else if (e.code === 'KeyH') { const c = G.blds.find(b => b.o === 0 && b.t === 'city'); if (c) { setSel([c.id]); centerOn(c.x, c.y); } }
    else if (e.code === 'Period' || e.code === 'Comma') idleNext();
    else if (e.code === 'KeyP') pauseGame();
    else if (/^Digit[1-5]$/.test(e.code)) {
      const n = e.code.slice(5);
      if (e.ctrlKey || e.metaKey) { G.groups[n] = selUnits().map(u => u.id); toast('Groupe ' + n + ' : ' + G.groups[n].length + ' unités', 'info'); e.preventDefault(); }
      else { const ids = (G.groups[n] || []).filter(id => G.byId.has(id)); if (ids.length) { const same = ids.join() === G.sel.join(); setSel(ids); if (same) { const c = centroid(selUnits()); centerOn(c.x, c.y); } } }
    }
  });
  addEventListener('keyup', e => UI.keys.delete(e.code));
  addEventListener('blur', () => UI.keys.clear());
  addEventListener('resize', layout);
  if (window.visualViewport) visualViewport.addEventListener('resize', layout);
  document.addEventListener('visibilitychange', () => { if (document.hidden && G && !G.over) { saveGame(true); } });
  addEventListener('pagehide', () => { if (G && !G.over) saveGame(true); });
  H.toast = toast; H.ping = ping; H.sfx = sfx; H.sfxAt = sfxAt;
  H.onSelChange = () => refreshPanels(true);
  H.onEnd = win => { cancelMode(); setTimeout(() => { if (G && G.over) showEnd(win); }, 1800); };
  try { AU.on = localStorage.getItem('mythomachie.sound') !== '0'; } catch (_) { }
  layout();
}
function uiFrame(dt) {
  if (!G) return;
  if (!G.paused) {
    const k = UI.keys, sp = 760 / G.cam.z * dt;
    let mx = 0, my = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) mx -= sp; if (k.has('ArrowRight') || k.has('KeyD')) mx += sp;
    if (k.has('ArrowUp') || k.has('KeyW')) my -= sp; if (k.has('ArrowDown') || k.has('KeyS')) my += sp;
    if (mx || my) { G.cam.x += mx; G.cam.y += my; clampCam(); if (UI.mouse && UI.mode === 'place') setGhost(s2w(UI.mouse.x, UI.mouse.y).x, s2w(UI.mouse.x, UI.mouse.y).y); }
  }
  UI.hudT -= dt;
  if (UI.hudT <= 0) { UI.hudT = 0.15; hudUpdate(); refreshPanels(false); }
  UI.miniT -= dt;
  if (UI.miniT <= 0) { UI.miniT = 0.25; drawMini(); }
  G.autoT -= dt;
  if (G.autoT <= 0 && !G.over) { G.autoT = 45; saveGame(true); }
}
