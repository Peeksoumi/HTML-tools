#!/usr/bin/env node
'use strict';
/* Mythomachie — serveur de jeu en ligne (Node.js 16 ou plus, aucune dépendance).
   - WebSocket (RFC 6455, compression permessage-deflate) sur /mythomachie/ws ; état JSON sur /mythomachie/api/status.
   - Salons : créer, lister, rejoindre par code ; l'hôte règle carte, IA, difficulté et mode, puis lance.
   - Partie autoritaire : le serveur fait tourner le moteur de la page (src/js/00 à 06) à 20 pas par seconde,
     applique les ordres validés et envoie à chaque joueur, 10 fois par seconde, ce que voit son équipe.
   - Déconnexion : reprise avec le même jeton ; après 45 s d'absence, une IA tient le camp (rendu au retour).
   - Se relance de lui-même (via systemd) quand son code change, dès qu'aucune partie n'est en cours.
   Lancement : PORT=8093 node server.js */
const http = require('http'), crypto = require('crypto'), zlib = require('zlib'), fs = require('fs'), path = require('path'), vm = require('vm');
const PORT = +(process.env.PORT || 8093), HOST = process.env.HOST || '127.0.0.1';
const JS = path.join(__dirname, '..', 'src', 'js');
const simFiles = () => fs.readdirSync(JS).filter(f => /^0[0-6]-.*\.js$/.test(f)).sort().map(f => path.join(JS, f));
const SIM = new vm.Script(simFiles().map(f => fs.readFileSync(f, 'utf8')).join('\n') +
  '\n;globalThis.__api = { setup: netSetup, tick, cmd: applyCmd, view: netView, init: netInit, snap: netSnapshot, setAI: netSetAI, state: netState };',
  { filename: 'mythomachie-moteur.js' });
const VERSION = 1;
const MAX_ROOMS = 30, MAX_CLIENTS = 160, MAX_PLAYERS = 4;
const AI_NAMES = { zeus: 'IA Olympe', odin: 'IA Asgard', ra: 'IA Héliopolis' };
const PATRONS = ['zeus', 'odin', 'ra'];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------- WebSocket minimal ---------- */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const TAIL = Buffer.from([0, 0, 0xff, 0xff]);
class Conn {
  constructor(sock, deflate, head) {
    this.sock = sock; this.deflate = deflate; this.buf = Buffer.alloc(0); this.frag = null; this.open = true;
    this.id = crypto.randomBytes(4).toString('hex'); this.lastPong = Date.now(); this.bucket = 40; this.bucketT = Date.now();
    sock.setNoDelay(true);
    sock.on('data', d => this._data(d));
    sock.on('close', () => this._closed());
    sock.on('error', () => this._closed());
    if (head && head.length) this._data(head);
  }
  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    if (this.buf.length > 1 << 20) { this.close(1009); return; }
    while (this.open && this._frame());
  }
  _frame() {
    const b = this.buf; if (b.length < 2) return false;
    const fin = b[0] & 0x80, rsv1 = b[0] & 0x40, op = b[0] & 0x0f, masked = b[1] & 0x80;
    let len = b[1] & 0x7f, off = 2;
    if (len === 126) { if (b.length < 4) return false; len = b.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (b.length < 10) return false; if (b.readUInt32BE(2)) { this.close(1009); return false; } len = b.readUInt32BE(6); off = 10; }
    if (!masked) { this.close(1002); return false; }
    if (len > 256 * 1024) { this.close(1009); return false; }
    if (b.length < off + 4 + len) return false;
    const mask = b.subarray(off, off + 4); off += 4;
    const p = Buffer.from(b.subarray(off, off + len));
    for (let i = 0; i < len; i++) p[i] ^= mask[i & 3];
    this.buf = b.subarray(off + len);
    if (op === 8) { this.close(1000); return false; }
    if (op === 9) { this._send(0x8a, p); return true; }
    if (op === 10) { this.lastPong = Date.now(); return true; }
    if (op === 1 || op === 2) this.frag = { op, rsv1, parts: [p] };
    else if (op === 0 && this.frag) this.frag.parts.push(p);
    else return true;
    if (!fin) return true;
    const f = this.frag; this.frag = null;
    let data = Buffer.concat(f.parts);
    if (f.rsv1) {
      if (!this.deflate) { this.close(1002); return false; }
      try { data = zlib.inflateRawSync(Buffer.concat([data, TAIL]), { finishFlush: zlib.constants.Z_SYNC_FLUSH }); } catch (_) { this.close(1007); return false; }
    }
    if (f.op === 1 && this.onmessage) { try { this.onmessage(data.toString('utf8')); } catch (e) { log('erreur message', e && e.stack || e); } }
    return true;
  }
  _send(b0, payload) {
    if (!this.open) return;
    const n = payload.length; let h;
    if (n < 126) h = Buffer.from([b0, n]);
    else if (n < 65536) { h = Buffer.alloc(4); h[0] = b0; h[1] = 126; h.writeUInt16BE(n, 2); }
    else { h = Buffer.alloc(10); h[0] = b0; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(n, 6); }
    this.sock.write(Buffer.concat([h, payload]));
  }
  send(obj) {
    if (!this.open) return;
    let data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8'), b0 = 0x81;
    if (this.deflate && data.length > 200) {
      const z = zlib.deflateRawSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
      data = z.subarray(0, z.length - 4); b0 |= 0x40;
    }
    this._send(b0, data);
  }
  get busy() { return this.sock.writableLength > 384 * 1024; }
  ping() { this._send(0x89, Buffer.alloc(0)); }
  close(code) {
    if (!this.open) return;
    const p = Buffer.alloc(2); p.writeUInt16BE(code || 1000, 0);
    try { this._send(0x88, p); } catch (_) { }
    this.open = false; try { this.sock.end(); } catch (_) { }
    setTimeout(() => { try { this.sock.destroy(); } catch (_) { } }, 1000);
    this._closed();
  }
  _closed() { if (this.gone) return; this.gone = true; this.open = false; if (this.onclose) this.onclose(); }
}

/* ---------- Salons et parties ---------- */
const rooms = new Map(), clients = new Set();
const rnd = n => crypto.randomInt(n);
function code4() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = ''; for (let i = 0; i < 4; i++) c += A[rnd(A.length)]; } while (rooms.has(c)); return c; }
function clean(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, n || 20); }
function cleanOpts(o, humans) {
  o = o || {};
  const opts = { map: ['small', 'medium', 'large'].includes(o.map) ? o.map : 'medium', diff: ['easy', 'normal', 'hard'].includes(o.diff) ? o.diff : 'normal', mode: o.mode === 'coop' ? 'coop' : 'ffa' };
  opts.ais = Math.max(0, Math.min(MAX_PLAYERS - (humans || 1), (o.ais | 0)));
  return opts;
}
function roomInfo(r) {
  return {
    code: r.code, state: r.state, opts: r.opts, host: r.host,
    members: r.members.map(m => ({ name: m.name, patron: m.patron, token: m.token === r.host ? 'host' : undefined, on: !!m.client, slot: m.slot })),
  };
}
function sendRoom(r) {
  const info = roomInfo(r);
  for (const m of r.members) if (m.client) m.client.send({ t: 'room', room: info, you: r.members.indexOf(m), host: m.token === r.host });
}
function listRooms() {
  const list = [];
  for (const r of rooms.values()) if (r.state === 'lobby') list.push({ code: r.code, host: (r.members.find(m => m.token === r.host) || r.members[0] || {}).name || '?', n: r.members.length + r.opts.ais, opts: r.opts });
  return { t: 'rooms', rooms: list.slice(0, 20) };
}
function member(c) { return c.room ? c.room.members.find(m => m.token === c.token) : null; }
function leaveRoom(c, explicit) {
  const r = c.room; if (!r) return;
  const m = member(c); c.room = null;
  if (!m) return;
  if (r.state === 'lobby') {
    if (explicit) r.members.splice(r.members.indexOf(m), 1); else { m.client = null; m.leftAt = Date.now(); }
    if (r.host === m.token && explicit) { const n = r.members[0]; r.host = n ? n.token : null; }
    if (!r.members.length) rooms.delete(r.code); else sendRoom(r);
  } else if (r.state === 'play') {
    m.client = null; m.leftAt = Date.now();
    if (explicit) { try { r.api.cmd(m.slot, ['resign']); } catch (_) { } m.resigned = true; }
    info(r, m.name + (explicit ? ' a quitté la partie.' : ' s’est déconnecté.'));
  } else if (explicit) { r.members.splice(r.members.indexOf(m), 1); }
}
function info(r, msg) { for (const m of r.members) if (m.client) m.client.send({ t: 'info', msg }); }
function startGame(r) {
  const humans = r.members.filter(m => m.client);
  r.opts = cleanOpts(r.opts, humans.length);
  const total = humans.length + r.opts.ais;
  if (total < 2) return 'Il faut au moins deux camps : invitez un joueur ou ajoutez une IA.';
  if (r.opts.mode === 'coop' && r.opts.ais < 1) return 'En coopération, ajoutez au moins une IA à affronter.';
  if (total > MAX_PLAYERS) return 'Quatre camps au maximum.';
  const players = humans.map((m, i) => ({ name: m.name, patron: PATRONS.includes(m.patron) ? m.patron : 'zeus', ai: false, team: r.opts.mode === 'coop' ? 0 : i }));
  const pool = PATRONS.slice().sort(() => Math.random() - 0.5);
  for (let k = 0; k < r.opts.ais; k++) { const pat = pool[k % 3]; players.push({ name: AI_NAMES[pat] + (k >= 3 ? ' II' : ''), patron: pat, ai: true, team: r.opts.mode === 'coop' ? 1 : players.length }); }
  const ctx = vm.createContext({ console, performance, Date, btoa, atob });
  SIM.runInContext(ctx);
  r.api = ctx.__api;
  r.api.setup({ map: r.opts.map, ais: r.opts.ais, diff: r.opts.diff, mode: r.opts.mode, seed: rnd(1e9), patron: players[0].patron, players });
  r.members = humans;
  humans.forEach((m, i) => { m.slot = i; m.view = r.api.view(); m.client.send(r.api.init(i)); });
  r.state = 'play'; r.startedAt = Date.now(); r.tickN = 0;
  log('partie', r.code, 'lancée :', players.map(p => p.name).join(', '), JSON.stringify(r.opts));
  return null;
}
function endGame(r) {
  const st = r.api.state();
  r.state = 'over'; r.overAt = Date.now();
  for (const m of r.members) if (m.client) { if (!m.client.busy) m.client.send(r.api.snap(m.slot, m.view)); m.client.send({ t: 'end', win: st.win, players: st.players, time: st.time }); }
  log('partie', r.code, 'terminée en', Math.round(st.time), 's, équipe gagnante', st.win);
}
function resume(c) {
  for (const r of rooms.values()) {
    const m = r.members.find(x => x.token === c.token && !x.resigned);
    if (!m) continue;
    if (m.client && m.client !== c) { m.client.send({ t: 'info', msg: 'Partie reprise dans une autre fenêtre.' }); m.client.room = null; m.client.close(4000); }
    m.client = c; c.room = r; m.leftAt = 0;
    if (r.state === 'lobby') { sendRoom(r); return; }
    if (r.state === 'play') {
      if (m.ai) { r.api.setAI(m.slot, false); m.ai = false; }
      m.view = r.api.view(); c.send(r.api.init(m.slot));
      info(r, m.name + ' est de retour.');
      return;
    }
  }
}
function onMessage(c, raw) {
  const now = Date.now();
  c.bucket = Math.min(40, c.bucket + (now - c.bucketT) * 0.03); c.bucketT = now;
  if (--c.bucket < 0) return;
  let m; try { m = JSON.parse(raw); } catch (_) { return; }
  if (!m || typeof m.t !== 'string') return;
  if (m.t !== 'hi' && !c.token) return;
  const r = c.room, me = member(c);
  switch (m.t) {
    case 'hi':
      c.name = clean(m.name) || 'Joueur';
      c.token = typeof m.token === 'string' && /^[a-f0-9]{24}$/.test(m.token) ? m.token : crypto.randomBytes(12).toString('hex');
      c.send({ t: 'welcome', token: c.token, v: VERSION });
      resume(c);
      if (!c.room) c.send(listRooms());
      break;
    case 'name': c.name = clean(m.name) || c.name; if (me && r.state === 'lobby') { me.name = c.name; sendRoom(r); } break;
    case 'list': c.send(listRooms()); break;
    case 'create': {
      if (r) leaveRoom(c, true);
      if (rooms.size >= MAX_ROOMS) { c.send({ t: 'err', msg: 'Serveur plein : réessayez plus tard.' }); break; }
      const nr = { code: code4(), state: 'lobby', opts: cleanOpts(m.opts, 1), host: c.token, members: [{ token: c.token, name: c.name, patron: PATRONS.includes(m.patron) ? m.patron : 'zeus', client: c }], created: now };
      rooms.set(nr.code, nr); c.room = nr; sendRoom(nr);
      log('salon', nr.code, 'créé par', c.name);
      break;
    }
    case 'join': {
      const code = clean(m.code, 4).toUpperCase(), nr = rooms.get(code);
      if (!nr) { c.send({ t: 'err', msg: 'Aucune partie avec le code ' + (code || '?') + '.' }); break; }
      if (nr.members.some(x => x.token === c.token)) { if (c.room !== nr) resume(c); break; } // déjà membre : reprise (une seule fois)
      if (nr.state !== 'lobby') { c.send({ t: 'err', msg: 'Cette partie a déjà commencé.' }); break; }
      if (nr.members.length + nr.opts.ais >= MAX_PLAYERS) { c.send({ t: 'err', msg: 'Partie complète.' }); break; }
      if (r) leaveRoom(c, true);
      nr.members.push({ token: c.token, name: c.name, patron: PATRONS.includes(m.patron) ? m.patron : 'zeus', client: c });
      c.room = nr; sendRoom(nr);
      break;
    }
    case 'leave': leaveRoom(c, true); c.send(listRooms()); break;
    case 'patron': if (me && r.state === 'lobby' && PATRONS.includes(m.patron)) { me.patron = m.patron; sendRoom(r); } break;
    case 'opts': if (me && r.state === 'lobby' && r.host === c.token) { r.opts = cleanOpts(m.opts, r.members.length); sendRoom(r); } break;
    case 'go':
      if (!me || r.state !== 'lobby') break;
      if (r.host !== c.token) { c.send({ t: 'err', msg: 'Seul l’hôte peut lancer la partie.' }); break; }
      { const err = startGame(r); if (err) c.send({ t: 'err', msg: err }); }
      break;
    case 'c': if (me && r.state === 'play' && Array.isArray(m.c) && me.slot != null) { try { r.api.cmd(me.slot, m.c); } catch (e) { log('ordre refusé', e && e.message); } } break;
    case 'chat': {
      const text = clean(m.text, 140); if (!text || !me) break;
      for (const x of r.members) if (x.client) x.client.send({ t: 'chat', from: me.name, slot: me.slot == null ? -1 : me.slot, text });
      break;
    }
    case 'ping': c.send({ t: 'pong', k: m.k }); break;
  }
}

/* ---------- Boucle de jeu ---------- */
let last = process.hrtime.bigint(), acc = 0, beat = 0;
setInterval(() => {
  const now = process.hrtime.bigint(); acc += Number(now - last) / 1e9; last = now;
  let steps = 0;
  while (acc >= 0.05 && steps < 4) {
    acc -= 0.05; steps++; beat++;
    for (const r of rooms.values()) {
      if (r.state !== 'play') continue;
      try { r.api.tick(0.05); } catch (e) { log('erreur moteur', r.code, e && e.stack || e); info(r, 'Erreur du serveur : la partie est arrêtée.'); r.state = 'over'; r.overAt = Date.now(); continue; }
      r.tickN++;
      if (r.api.state().over) { endGame(r); continue; }
      if (r.tickN % 2 === 0) {
        const on = r.members.map(m => m.client ? 1 : 0);
        for (const m of r.members) {
          if (!m.client || m.client.busy) continue;
          const s = r.api.snap(m.slot, m.view);
          s.on = on;
          m.client.send(s);
        }
      }
    }
  }
  if (acc > 1) acc = 0;
  if (beat % 100 === 0) housekeeping();
}, 25);
function housekeeping() {
  const now = Date.now();
  for (const r of [...rooms.values()]) {
    if (r.state === 'lobby') {
      r.members = r.members.filter(m => m.client || now - m.leftAt < 20000);
      if (r.host && !r.members.some(m => m.token === r.host)) r.host = r.members[0] ? r.members[0].token : null;
      if (!r.members.length) rooms.delete(r.code);
    } else if (r.state === 'play') {
      for (const m of r.members) if (!m.client && !m.ai && !m.resigned && m.leftAt && now - m.leftAt > 45000) {
        r.api.setAI(m.slot, true); m.ai = true; info(r, 'L’IA prend le relais de ' + m.name + '.');
      }
      if (!r.members.some(m => m.client) && r.members.every(m => !m.leftAt || now - m.leftAt > 180000)) { rooms.delete(r.code); log('partie', r.code, 'abandonnée'); }
    } else if (now - r.overAt > 60000) rooms.delete(r.code);
  }
  for (const c of clients) { if (now - c.lastPong > 70000) c.close(1001); else c.ping(); }
  checkReload();
}
let sig = null, pendingSince = 0;
function signature() { return simFiles().concat([__filename]).map(f => { try { return fs.statSync(f).mtimeMs; } catch (_) { return 0; } }).join(','); }
function checkReload() {
  const s = signature();
  if (sig === null) { sig = s; return; }
  if (s === sig) return;
  if (!pendingSince) { pendingSince = Date.now(); log('code modifié : relance dès que possible'); }
  const playing = [...rooms.values()].some(r => r.state === 'play');
  if (!playing || Date.now() - pendingSince > 30 * 60000) { log('relance pour charger le nouveau code'); process.exit(0); }
}

/* ---------- HTTP ---------- */
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/mythomachie/api/status' || u === '/api/status') {
    const list = [...rooms.values()];
    const body = JSON.stringify({ ok: true, v: VERSION, salons: list.filter(r => r.state === 'lobby').length, parties: list.filter(r => r.state === 'play').length, joueurs: clients.size, depuis: Math.round(process.uptime()) });
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(body); return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Mythomachie : connectez-vous en WebSocket sur /mythomachie/ws');
});
server.on('upgrade', (req, sock, head) => {
  const u = req.url.split('?')[0];
  const key = req.headers['sec-websocket-key'];
  if ((u !== '/mythomachie/ws' && u !== '/ws') || !key || clients.size >= MAX_CLIENTS) { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
  const deflate = /permessage-deflate/.test(String(req.headers['sec-websocket-extensions'] || ''));
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n' +
    (deflate ? 'Sec-WebSocket-Extensions: permessage-deflate; server_no_context_takeover; client_no_context_takeover\r\n' : '') + '\r\n');
  const c = new Conn(sock, deflate, head);
  clients.add(c);
  c.onmessage = raw => onMessage(c, raw);
  c.onclose = () => { clients.delete(c); leaveRoom(c, false); };
});
server.listen(PORT, HOST, () => { sig = signature(); log('Mythomachie : serveur de jeu sur', HOST + ':' + PORT); });
