// Test du serveur de jeu : deux clients WebSocket (sans dépendance) créent, rejoignent et jouent une partie avec une IA.
// Usage : node server/test_server.js   (lance le serveur sur un port libre, puis l'arrête)
'use strict';
const net = require('net'), crypto = require('crypto'), path = require('path'), { spawn } = require('child_process');
const PORT = 18000 + Math.floor(Math.random() * 1000);
const fail = m => { console.error('ÉCHEC :', m); process.exitCode = 1; };
const ok = (c, m) => { console.log((c ? '✔ ' : '✘ ') + m); if (!c) process.exitCode = 1; };
const wait = ms => new Promise(r => setTimeout(r, ms));

function client(name, token) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(PORT, '127.0.0.1');
    const key = crypto.randomBytes(16).toString('base64');
    const c = { msgs: [], last: {}, snaps: 0, ents: new Map(), sock };
    let buf = Buffer.alloc(0), up = false;
    c.send = o => {
      const p = Buffer.from(JSON.stringify(o)), mask = crypto.randomBytes(4);
      const h = p.length < 126 ? Buffer.from([0x81, 0x80 | p.length]) : Buffer.from([0x81, 0x80 | 126, p.length >> 8, p.length & 255]);
      const m = Buffer.from(p); for (let i = 0; i < m.length; i++) m[i] ^= mask[i & 3];
      sock.write(Buffer.concat([h, mask, m]));
    };
    c.wait = (t, ms = 4000) => new Promise((res, rej) => {
      const t0 = Date.now();
      const iv = setInterval(() => { const i = c.msgs.findIndex(x => x.t === t); if (i >= 0) { clearInterval(iv); res(c.msgs.splice(i, 1)[0]); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error(name + ' : pas de message ' + t)); } }, 20);
    });
    sock.on('connect', () => sock.write('GET /mythomachie/ws HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ' + key + '\r\nSec-WebSocket-Version: 13\r\n\r\n'));
    sock.on('data', d => {
      buf = Buffer.concat([buf, d]);
      if (!up) { const i = buf.indexOf('\r\n\r\n'); if (i < 0) return; if (!/101/.test(buf.subarray(0, i).toString())) return reject(new Error('poignée de main refusée')); buf = buf.subarray(i + 4); up = true; c.send({ t: 'hi', name, token }); resolve(c); }
      for (;;) {
        if (buf.length < 2) break;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) break; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) break; len = buf.readUInt32BE(6); off = 10; }
        if (buf.length < off + len) break;
        const op = buf[0] & 0x0f, p = buf.subarray(off, off + len); buf = buf.subarray(off + len);
        if (op !== 1) continue;
        const m = JSON.parse(p.toString());
        if (m.t === 's') { c.snaps++; for (const id of m.rm) c.ents.delete(id); for (const r of m.u) c.ents.set(r[0], { k: 'u', r }); for (const r of m.b) c.ents.set(r[0], { k: 'b', r }); c.last.s = m; }
        else c.msgs.push(m);
      }
    });
    sock.on('error', reject);
  });
}
(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], { env: Object.assign({}, process.env, { PORT: String(PORT) }), stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; srv.stdout.on('data', d => { out += d; }); srv.stderr.on('data', d => { out += d; });
  try {
    for (let i = 0; i < 50 && !/serveur de jeu/.test(out); i++) await wait(100);
    const a = await client('Alice'), b = await client('Bob');
    await a.wait('welcome'); const wb = await b.wait('welcome');
    await a.wait('rooms'); await b.wait('rooms');
    a.send({ t: 'create', opts: { map: 'small', ais: 1, diff: 'easy', mode: 'ffa' }, patron: 'zeus' });
    const ra = await a.wait('room');
    ok(/^[A-Z]{4}$/.test(ra.room.code) && ra.host, 'salon créé : ' + ra.room.code);
    b.send({ t: 'list' }); const list = await b.wait('rooms');
    ok(list.rooms.some(r => r.code === ra.room.code), 'le salon apparaît dans la liste');
    b.send({ t: 'join', code: ra.room.code, patron: 'odin' }); const rb = await b.wait('room');
    ok(rb.room.members.length === 2 && !rb.host, 'Bob a rejoint (2 joueurs + 1 IA)');
    b.send({ t: 'go' }); const err = await b.wait('err'); ok(/./.test(err.msg), 'seul l’hôte peut lancer');
    a.send({ t: 'go' });
    const sa = await a.wait('start'), sb = await b.wait('start');
    ok(sa.me === 0 && sb.me === 1 && sa.pl.length === 3 && sa.pl[2].ai, 'partie lancée : 3 camps dont une IA');
    await wait(900);
    ok(a.snaps >= 5 && b.snaps >= 5, 'états reçus : ' + a.snaps + ' et ' + b.snaps);
    const mine = [...a.ents.values()].filter(e => e.k === 'u' && e.r[2] === 0 && e.r[1] === 0).map(e => e.r);
    const others = [...a.ents.values()].filter(e => e.k === 'u' && e.r[2] !== 0);
    ok(mine.length === 4, 'Alice voit ses 4 citoyens');
    ok(others.length === 0, 'Alice ne voit pas les unités adverses (brouillard)');
    const city = [...a.ents.values()].find(e => e.k === 'b' && e.r[2] === 0 && e.r[1] === 0).r;
    a.send({ t: 'c', c: ['move', mine.map(r => r[0]), city[3] * 32 + 64, city[4] * 32 + 220, 0] });
    a.send({ t: 'c', c: ['train', city[0], 'villager'] });
    b.send({ t: 'c', c: ['move', mine.map(r => r[0]), 0, 0, 0] });
    await wait(1500);
    const moved = mine.filter(r0 => { const e = a.ents.get(r0[0]); return e && (Math.abs(e.r[3] - r0[3]) + Math.abs(e.r[4] - r0[4]) > 10); }).length;
    ok(moved >= 3, 'les ordres d’Alice déplacent ses citoyens (' + moved + '/4)');
    const cityNow = a.ents.get(city[0]).r;
    ok(Array.isArray(cityNow[10]) && cityNow[10].length === 1 && a.last.s.p[0] === 250, 'citoyen en formation, 50 de nourriture payés');
    b.send({ t: 'chat', text: 'Bonjour <b>Alice</b>' }); const ch = await a.wait('chat');
    ok(ch.from === 'Bob' && ch.text === 'Bonjour bAlice/b', 'message de discussion reçu et nettoyé');
    b.sock.destroy(); await wait(300);
    const b2 = await client('Bob', wb.token);
    const w2 = await b2.wait('welcome'), s2 = await b2.wait('start');
    ok(w2.token === wb.token && s2.me === 1, 'Bob se reconnecte et reprend son camp');
    await wait(400);
    ok(b2.snaps >= 2 && [...b2.ents.values()].some(e => e.k === 'u' && e.r[2] === 1), 'Bob reçoit de nouveau l’état complet');
    a.sock.destroy(); b2.sock.destroy();
    // Salon : l'hôte part envoyer le lien (appli en arrière-plan, connexion coupée) ; le salon l'attend et son amie peut entrer.
    const h = await client('Hector'); const wh = await h.wait('welcome'); await h.wait('rooms');
    h.send({ t: 'create', opts: { map: 'small', ais: 0, diff: 'easy', mode: 'ffa' }, patron: 'ra' }); const rh = await h.wait('room');
    h.sock.destroy();
    await wait(26000); // au-delà des 20 s après lesquelles l'ancienne version fermait le salon
    const f = await client('Fanny'); await f.wait('welcome'); await f.wait('rooms');
    f.send({ t: 'join', code: rh.room.code, patron: 'odin' }); const rf = await f.wait('room');
    ok(rf.room.members.length === 2 && rf.room.members[0].on === false && !rf.host, 'salon gardé 26 s après le départ de l’hôte : son amie y entre');
    const h2 = await client('Hector', wh.token); await h2.wait('welcome'); const rh2 = await h2.wait('room');
    ok(rh2.host && rh2.room.members.every(m => m.on), 'l’hôte revient dans son salon et reste l’hôte');
    h2.send({ t: 'go' }); const sh = await h2.wait('start'); ok(sh.pl.length === 2, 'il lance la partie avec son amie');
    const z = await client('Zoé'); await z.wait('welcome'); await z.wait('rooms');
    z.send({ t: 'go' }); const ez = await z.wait('err'), lz = await z.wait('rooms');
    ok(/existe plus/.test(ez.msg) && Array.isArray(lz.rooms), 'lancement demandé hors salon : erreur et liste des salons');
    h2.sock.destroy(); f.sock.destroy(); z.sock.destroy();
    const st = await new Promise(res => require('http').get('http://127.0.0.1:' + PORT + '/mythomachie/api/status', r => { let d = ''; r.on('data', x => { d += x; }); r.on('end', () => res(JSON.parse(d))); }));
    ok(st.ok && st.parties === 2, 'état du serveur : ' + JSON.stringify(st));
  } catch (e) { fail(e.message); console.log(out); }
  srv.kill();
  if (!process.exitCode) console.log('OK');
})();
