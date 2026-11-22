/* ===== Jeu en ligne côté navigateur : connexion, salon, ordres, discussion ===== */
const NET = { ws: null, state: 'off', token: null, room: null, host: false, rooms: [], retry: 0, want: false, on: [], needCenter: false, autoJoin: null, wasDefeated: false };
const MPO = { map: 'medium', ais: 1, diff: 'normal', mode: 'ffa' };
function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (_) { } }
function netUrl() {
  const o = lsGet('mythomachie.serveur'); if (o) return o;
  const h = location.hostname, web = location.protocol === 'https:' || location.protocol === 'http:';
  if (web && (h === 'peeksoumi.com' || h === 'www.peeksoumi.com' || h === '141.227.151.70')) return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/mythomachie/ws';
  return 'wss://peeksoumi.com/mythomachie/ws';
}
function shareUrl(code) {
  const h = location.hostname;
  const base = (h === 'peeksoumi.com' || h === 'www.peeksoumi.com' || h === '141.227.151.70') ? location.origin + location.pathname : 'https://peeksoumi.com/mythomachie/';
  return base + '#' + code;
}
function myName() { const v = ($('mp-name').value || '').trim().slice(0, 20); return v || ('Héros ' + (10 + ((Math.random() * 89) | 0))); }
function setNetState(s) {
  NET.state = s;
  const el = $('net-state'); if (!el) return;
  el.textContent = { connecting: 'Connexion…', on: 'Connecté', off: 'Hors ligne', error: 'Serveur injoignable' }[s] || s;
  el.className = 'netstate ' + s;
  $('mp-create').disabled = s !== 'on'; $('mp-join').disabled = s !== 'on';
}
function netConnect() {
  NET.want = true;
  if (NET.ws && NET.ws.readyState <= 1) return;
  setNetState('connecting');
  let ws;
  try { ws = new WebSocket(netUrl()); } catch (_) { setNetState('error'); return; }
  NET.ws = ws;
  ws.onopen = () => { NET.retry = 0; setNetState('on'); ws.send(JSON.stringify({ t: 'hi', name: myName(), token: NET.token })); };
  ws.onmessage = ev => { let m; try { m = JSON.parse(ev.data); } catch (_) { return; } netOnMessage(m); };
  ws.onclose = () => {
    if (NET.ws === ws) NET.ws = null;
    setNetState(NET.retry > 2 ? 'error' : 'off');
    if (NET.want) { const d = Math.min(8000, 700 * Math.pow(2, NET.retry++)); setTimeout(() => { if (NET.want) netConnect(); }, d); }
    if (G && G.mp && !G.over) toast('Connexion perdue : reconnexion…', 'warn');
    if (NET.retry === 3 && !(G && G.mp)) mpMsg('Le serveur de jeu ne répond pas. Le jeu en ligne fonctionne depuis peeksoumi.com/mythomachie.');
  };
}
function netSend(o) { if (NET.ws && NET.ws.readyState === 1) { NET.ws.send(JSON.stringify(o)); return true; } return false; }
function netCmd(c) { if (!netSend({ t: 'c', c })) toast('Connexion perdue : ordre non transmis.', 'warn'); }
function mpMsg(t) { const el = $('mp-msg'); if (el) { el.textContent = t || ''; el.hidden = !t; } }
function netOnMessage(m) {
  switch (m.t) {
    case 'welcome':
      NET.token = m.token; lsSet('mythomachie.jeton', m.token);
      if (NET.autoJoin) { netSend({ t: 'join', code: NET.autoJoin, patron: MENU.patron }); NET.autoJoin = null; }
      break;
    case 'rooms': NET.rooms = m.rooms; if (!(G && G.mp)) lsSet('mythomachie.enligne', ''); if (!NET.room) renderOnline(); break;
    case 'room': NET.room = m.room; NET.host = m.host; mpMsg(''); renderOnline(); break;
    case 'err': if (G && G.mp) toast(m.msg, 'warn'); else mpMsg(m.msg); sfx('err'); break;
    case 'info': if (G && G.mp) toast(m.msg, 'info'); else mpMsg(m.msg); break;
    case 'start': mpBegin(m); break;
    case 's':
      if (!G || !G.mp) break;
      netClientSnap(m);
      if (m.on) NET.on = m.on;
      if (NET.needCenter) { const c = G.blds.find(b => b.o === G.me && b.t === 'city'); if (c) { centerOn(c.x, c.y + 40); NET.needCenter = false; } }
      if (!NET.wasDefeated && G.pl[G.me].defeated && !G.over) { NET.wasDefeated = true; G.revealAll = true; cancelMode(); setTimeout(() => showEnd(false, true), 1200); }
      break;
    case 'end': mpEnd(m); break;
    case 'chat': chatToast(m); break;
  }
}
function mpBegin(m) {
  const keep = G && G.mp && G.terCv ? Object.assign({}, G.cam) : null;
  netClientStart(m); prepareRender();
  $('online').hidden = true; $('menu').hidden = true;
  G.cam.z = VW < 700 ? 1.05 : 1.3;
  NET.room = null; NET.wasDefeated = false; NET.endMsg = null;
  lsSet('mythomachie.enligne', '1');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search); // le code d'invitation ne sert plus
  enterGame();
  if (keep) { G.cam = keep; clampCam(); } else NET.needCenter = true;
  sfx('start');
}
function mpEnd(m) {
  if (!G || !G.mp) return;
  NET.endMsg = m; G.over = true; G.revealAll = true; cancelMode(); lsSet('mythomachie.enligne', '');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  setTimeout(() => { if (G && G.mp) showEnd(m.win === G.pl[G.me].team, false); }, 1500);
}
function chatToast(m) {
  const box = $('toasts'); if (!box) return;
  const el = document.createElement('div'); el.className = 'toast chat';
  const b = document.createElement('b'); b.textContent = m.from + ' : ';
  if (G && G.pl[m.slot]) b.style.color = G.pl[m.slot].color;
  el.appendChild(b); el.appendChild(document.createTextNode(m.text));
  box.prepend(el); while (box.children.length > 5) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 7000); setTimeout(() => el.remove(), 7500);
  if (!G || !G.mp) mpMsg(m.from + ' : ' + m.text); else sfx('click');
}
function openChat() {
  if (!G || !G.mp) return;
  $('chatbar').hidden = false; const i = $('chat-in'); i.value = ''; i.focus();
}
/* ----- Ordres : directs en solo, envoyés au serveur en ligne ----- */
const ids = units => units.map(u => u.id);
const ACT = {
  move(units, x, y, amove) { if (!G.mp) return cmdMove(units, x, y, amove); netCmd(['move', ids(units), Math.round(x), Math.round(y), amove ? 1 : 0]); },
  attack(units, t) { if (!G.mp) return cmdAttack(units, t); netCmd(['attack', ids(units), t.id]); },
  gather(units, spec) { if (!G.mp) return cmdGather(units, spec); netCmd(['gather', ids(units), spec]); },
  build(units, b) { if (!G.mp) return cmdBuild(units, b); netCmd(['build', ids(units), b.id]); },
  deposit(units, b) { if (!G.mp) return cmdDeposit(units, b); netCmd(['deposit', ids(units), b.id]); },
  stop(units) { if (!G.mp) return cmdStop(units); netCmd(['stop', ids(units)]); },
  place(t, tx, ty, units) {
    if (!G.mp) { const b = placeBuilding(G.pl[G.me], t, tx, ty); if (b && units.length) cmdBuild(units, b); return b; }
    netCmd(['place', t, tx, ty, ids(units)]);
    return { x: (tx + B[t].size / 2) * T, y: (ty + B[t].size / 2) * T };
  },
  queue(b, k, id) {
    if (!G.mp) return enqueue(b, k, id);
    if (b.q.length >= 6) return 'full';
    if (!afford(G.pl[G.me], k === 'u' ? U[id].cost : R[id].cost)) return 'cost';
    netCmd([k === 'u' ? 'train' : 'research', b.id, id]); return 'ok';
  },
  unq(b, i) { if (!G.mp) return dequeue(b, i); netCmd(['unq', b.id, i]); },
  rally(b, x, y, spec) { b.rally = { x, y, spec }; if (G.mp) netCmd(['rally', b.id, Math.round(x), Math.round(y), spec]); },
  demolish(b) {
    if (G.mp) { netCmd(['demolish', b.id]); return; }
    if (!b.built) refund(G.pl[G.me], B[b.t].cost, b.prog < 0.05 ? 1 : 0.5);
    kill(b, null, true);
  },
  power(pid, x, y) {
    if (!G.mp) return castPower(G.me, pid, x, y);
    if (!canCast(G.pl[G.me], pid)) return false;
    netCmd(['power', pid, Math.round(x), Math.round(y)]); return true;
  },
};
/* ----- Écran « Jouer en ligne » ----- */
function openOnline() {
  $('online').hidden = false; mpMsg('');
  if (!$('mp-name').value) $('mp-name').value = lsGet('mythomachie.nom') || '';
  syncOnline(); renderOnline(); netConnect();
  if (NET.state === 'on' && !NET.room) netSend({ t: 'list' });
}
function closeOnline() {
  if (NET.room) netSend({ t: 'leave' });
  NET.room = null; NET.want = false; $('online').hidden = true;
  if (NET.ws) try { NET.ws.close(); } catch (_) { }
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
function syncOnline() {
  for (const b of $('mp-god').children) b.setAttribute('aria-pressed', String(b.dataset.v === MENU.patron));
  const o = NET.room && !NET.host ? NET.room.opts : MPO;
  for (const seg of document.querySelectorAll('#mp-opts .seg[data-mpo]')) for (const b of seg.children) b.setAttribute('aria-pressed', String(String(o[seg.dataset.mpo]) === b.dataset.v));
}
function optsText(o) { return MAPS[o.map].name + ' carte · ' + (o.ais ? o.ais + ' IA ' + DIFF[o.diff].name.toLowerCase() : 'sans IA') + ' · ' + (o.mode === 'coop' ? 'ensemble contre l’IA' : 'chacun pour soi'); }
function renderOnline() {
  if ($('online').hidden) return;
  const r = NET.room;
  $('mp-lobby').hidden = !!r; $('mp-room').hidden = !r; $('mp-roomgo').hidden = !r;
  $('mp-opts').hidden = !!(r && !NET.host);
  $('mp-create').hidden = !!r;
  if (!r) {
    const list = $('mp-rooms');
    if (!NET.rooms.length) list.innerHTML = '<p class="sub">' + (NET.state === 'on' ? 'Aucune partie ouverte pour l’instant : créez-en une ou entrez le code d’un ami.' : '') + '</p>';
    else list.innerHTML = NET.rooms.map(x => '<button class="roomrow" type="button" data-code="' + esc(x.code) + '"><b>' + esc(x.host) + '</b><span>' + x.n + ' / 4 camps · ' + esc(optsText(x.opts)) + '</span><i>' + esc(x.code) + '</i></button>').join('');
  } else {
    $('mp-roomcode').textContent = r.code;
    const rows = r.members.map((m, i) => '<li><i class="dot" style="background:' + TEAM[i] + '"></i><b>' + esc(m.name) + '</b> <span class="sub">' + P[m.patron].name + (m.token === 'host' ? ' · hôte' : '') + (m.on ? '' : ' · hors ligne') + '</span></li>');
    for (let k = 0; k < r.opts.ais; k++) rows.push('<li><i class="dot" style="background:' + TEAM[r.members.length + k] + '"></i><b>Ordinateur</b> <span class="sub">' + DIFF[r.opts.diff].name + '</span></li>');
    $('mp-members').innerHTML = rows.join('');
    $('mp-optsum').textContent = optsText(r.opts);
    $('mp-go').hidden = !NET.host; $('mp-wait').hidden = NET.host;
    const total = r.members.length + r.opts.ais;
    $('mp-go').disabled = total < 2 || (r.opts.mode === 'coop' && r.opts.ais < 1);
    $('mp-go').textContent = total < 2 ? 'Invitez un joueur ou ajoutez une IA' : 'Lancer la partie';
  }
  syncOnline();
}
function mpPlayersHTML() {
  return G.pl.map((p, i) => {
    const st = p.defeated ? 'vaincu' : p.ai ? 'ordinateur' : (NET.on[i] === 0 ? 'déconnecté' : 'en ligne');
    return '<li><i class="dot" style="background:' + p.color + '"></i><b>' + esc(p.name) + '</b> <span class="sub">' + P[p.patron].name + ' · ' + st + (i === G.me ? ' · vous' : '') + '</span></li>';
  }).join('');
}
function initNetUI() {
  NET.token = lsGet('mythomachie.jeton');
  try { const o = JSON.parse(lsGet('mythomachie.mpo') || 'null'); if (o) for (const k in MPO) if (o[k] != null) MPO[k] = o[k]; } catch (_) { }
  $('b-online').addEventListener('click', () => { audioUnlock(); openOnline(); });
  $('mp-close').addEventListener('click', closeOnline);
  $('mp-name').addEventListener('change', () => { const n = myName(); $('mp-name').value = n; lsSet('mythomachie.nom', n); netSend({ t: 'name', name: n }); });
  $('mp-god').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; MENU.patron = b.dataset.v; syncMenu(); syncOnline(); if (NET.room) netSend({ t: 'patron', patron: MENU.patron }); });
  $('mp-opts').addEventListener('click', e => {
    const b = e.target.closest('button'); const seg = b && b.closest('.seg[data-mpo]'); if (!seg) return;
    const k = seg.dataset.mpo; MPO[k] = k === 'ais' ? +b.dataset.v : b.dataset.v; lsSet('mythomachie.mpo', JSON.stringify(MPO));
    syncOnline(); if (NET.room && NET.host) netSend({ t: 'opts', opts: MPO });
  });
  $('mp-create').addEventListener('click', () => { lsSet('mythomachie.nom', myName()); netSend({ t: 'name', name: myName() }); netSend({ t: 'create', opts: MPO, patron: MENU.patron }); });
  const join = code => { code = (code || '').trim().toUpperCase(); if (!/^[A-Z]{4}$/.test(code)) { mpMsg('Le code fait 4 lettres.'); return; } lsSet('mythomachie.nom', myName()); netSend({ t: 'name', name: myName() }); netSend({ t: 'join', code, patron: MENU.patron }); };
  $('mp-join').addEventListener('click', () => join($('mp-code').value));
  $('mp-code').addEventListener('keydown', e => { if (e.key === 'Enter') join($('mp-code').value); });
  $('mp-rooms').addEventListener('click', e => { const b = e.target.closest('.roomrow'); if (b) join(b.dataset.code); });
  $('mp-go').addEventListener('click', () => netSend({ t: 'go' }));
  $('mp-leave').addEventListener('click', () => { netSend({ t: 'leave' }); NET.room = null; renderOnline(); });
  $('mp-copy').addEventListener('click', async () => {
    const url = shareUrl(NET.room.code);
    try { await navigator.clipboard.writeText(url); mpMsg('Lien copié : ' + url); } catch (_) { mpMsg('Lien à partager : ' + url); }
  });
  $('b-chat').addEventListener('click', openChat);
  $('chatbar').addEventListener('submit', e => {
    e.preventDefault(); const t = $('chat-in').value.trim();
    if (t) netSend({ t: 'chat', text: t });
    $('chatbar').hidden = true; $('chat-in').blur();
  });
  $('chat-in').addEventListener('keydown', e => { if (e.key === 'Escape') { $('chatbar').hidden = true; e.target.blur(); } });
  const m = /^#([A-Za-z]{4})$/.exec(location.hash || '');
  if (m) { NET.autoJoin = m[1].toUpperCase(); setTimeout(openOnline, 50); }
  else if (lsGet('mythomachie.enligne') === '1') setTimeout(openOnline, 50); // reprise d'une partie en ligne après rechargement
}
