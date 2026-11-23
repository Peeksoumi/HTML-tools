/* ===== Sons de synthèse ===== */
const AU = { ctx: null, on: true, last: {}, master: null, noise: null };
function audioUnlock() {
  if (!AU.on) return;
  try {
    if (!AU.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      AU.ctx = new AC(); AU.master = AU.ctx.createGain(); AU.master.gain.value = 0.3; AU.master.connect(AU.ctx.destination);
      const n = AU.ctx.sampleRate, buf = AU.ctx.createBuffer(1, n, n), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      AU.noise = buf;
    }
    if (AU.ctx.state === 'suspended') AU.ctx.resume().catch(() => { });
  } catch (_) { }
}
function tone(type, f0, f1, dur, vol, delay) {
  const c = AU.ctx, t = c.currentTime + (delay || 0);
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(AU.master); o.start(t); o.stop(t + dur + 0.05);
}
function noiseB(dur, vol, ft, f, q, delay) {
  const c = AU.ctx, t = c.currentTime + (delay || 0);
  const s = c.createBufferSource(); s.buffer = AU.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const fl = c.createBiquadFilter(); fl.type = ft; fl.frequency.value = f; fl.Q.value = q || 1;
  const g = c.createGain(); g.gain.setValueAtTime(Math.max(0.0002, vol), t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(AU.master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const GAP = { hit: 0.07, arrow: 0.09, build: 0.15, thud: 0.1, die: 0.12, fire: 0.18, thunder: 0.12, collapse: 0.3, horn: 2 };
function sfx(name, vol) {
  if (!AU.on || !AU.ctx || AU.ctx.state !== 'running') return;
  const now = AU.ctx.currentTime, gap = GAP[name] == null ? 0.05 : GAP[name];
  if (AU.last[name] && now - AU.last[name] < gap) return;
  AU.last[name] = now; vol = vol == null ? 1 : vol;
  try {
    switch (name) {
      case 'click': tone('sine', 880, 660, 0.05, 0.1 * vol); break;
      case 'order': tone('triangle', 520, 720, 0.07, 0.11 * vol); break;
      case 'err': tone('square', 190, 140, 0.12, 0.05 * vol); break;
      case 'hit': noiseB(0.06, 0.22 * vol, 'bandpass', 2600, 1.2); tone('triangle', 240, 120, 0.05, 0.08 * vol); break;
      case 'thud': noiseB(0.12, 0.28 * vol, 'lowpass', 500, 0.7); tone('sine', 110, 60, 0.12, 0.18 * vol); break;
      case 'arrow': noiseB(0.1, 0.1 * vol, 'highpass', 3200, 0.7); break;
      case 'fire': noiseB(0.4, 0.18 * vol, 'bandpass', 900, 0.6); break;
      case 'build': noiseB(0.04, 0.16 * vol, 'bandpass', 1400, 3); tone('triangle', 300, 200, 0.05, 0.06 * vol); break;
      case 'die': tone('sawtooth', 220, 90, 0.18, 0.04 * vol); break;
      case 'collapse': noiseB(0.9, 0.32 * vol, 'lowpass', 380, 0.7); break;
      case 'thunder': noiseB(0.06, 0.38 * vol, 'highpass', 2000, 0.7); noiseB(1.3, 0.42 * vol, 'lowpass', 260, 0.8, 0.04); break;
      case 'frost': for (let k = 0; k < 4; k++) tone('sine', 1300 + k * 280, 1700 + k * 300, 0.6, 0.045 * vol, k * 0.05); break;
      case 'heal': tone('sine', 420, 840, 0.5, 0.1 * vol); tone('sine', 630, 1260, 0.5, 0.05 * vol, 0.08); break;
      case 'aegis': tone('triangle', 330, 330, 0.5, 0.1 * vol); tone('sine', 495, 495, 0.6, 0.07 * vol, 0.05); break;
      case 'summon': tone('sawtooth', 110, 220, 0.7, 0.05 * vol); tone('sine', 220, 440, 0.7, 0.07 * vol); break;
      case 'cast': tone('sine', 660, 990, 0.25, 0.09 * vol); break;
      case 'horn': tone('sawtooth', 147, 140, 0.6, 0.06 * vol); tone('triangle', 220, 210, 0.6, 0.05 * vol); break;
      case 'train': tone('sine', 660, 880, 0.12, 0.07 * vol); break;
      case 'done': [523, 659, 784].forEach((f, i) => tone('sine', f, f, 0.16, 0.08 * vol, i * 0.09)); break;
      case 'place': tone('triangle', 260, 180, 0.12, 0.12 * vol); break;
      case 'start': [392, 523, 659, 784].forEach((f, i) => tone('triangle', f, f, 0.3, 0.07, i * 0.12)); break;
      case 'win': [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.42, 0.09, i * 0.15)); break;
      case 'lose': [392, 349, 311, 262].forEach((f, i) => tone('triangle', f, f, 0.42, 0.08, i * 0.18)); break;
    }
  } catch (_) { }
}
function sfxAt(name, x, y, vol, always) {
  if (!AU.ctx || !G || !AU.on) return;
  if (!always) { if (!onScreen(x, y, 40)) return; if (!G.revealAll && !visibleAt(x, y)) return; }
  sfx(name, vol);
}

/* ===== Sauvegarde ===== */
const SAVE_KEY = 'mythomachie.save.v1', META_KEY = 'mythomachie.save.meta';
function serialize() {
  const ents = [];
  for (const e of G.list) {
    if (e.dead) continue;
    const o = {}; for (const k in e) { if (k === 'path' || k === 'needPath' || k === 'pi') continue; o[k] = e[k]; }
    ents.push(o);
  }
  return {
    v: 1, opts: G.opts, time: G.time, nextId: G.nextId, W: G.W, H: G.H, starts: G.starts,
    ter: u8ToB64(G.ter), tree: u8ToB64(Uint8Array.from(G.tree, v => Math.ceil(v))), stump: u8ToB64(G.stump), ex: u8ToB64(G.ex),
    ents, pl: G.pl, ai: G.ai.map(a => { const c = Object.assign({}, a); delete c.I; return c; }), zones: G.zones, timers: G.timers,
    cam: G.cam, speed: G.speed, hints: G.hints, groups: G.groups,
  };
}
function deserialize(s) {
  if (!s || s.v !== 1) throw new Error('version');
  G = newState(s.opts);
  Object.assign(G, { time: s.time, nextId: s.nextId, W: s.W, H: s.H, speed: s.speed || 1, hints: s.hints || 99, starts: s.starts, groups: s.groups || {} });
  const N = G.W * G.H;
  G.ter = b64ToU8(s.ter); G.tree = Float32Array.from(b64ToU8(s.tree)); G.stump = b64ToU8(s.stump); G.ex = b64ToU8(s.ex);
  G.occ = new Int32Array(N); G.blk = new Uint8Array(N); G.vis = new Uint8Array(N);
  computeTreeVars();
  G.pl = s.pl; G.ai = s.ai || []; G.zones = s.zones || []; G.timers = s.timers || [];
  for (const o of s.ents) { o.dead = false; G.list.push(o); G.byId.set(o.id, o); (o.k === 'u' ? G.units : o.k === 'b' ? G.blds : G.ress).push(o); }
  for (const e of G.list) if (e.k !== 'u') { for (let dy = 0; dy < e.size; dy++) for (let dx = 0; dx < e.size; dx++) if (inb(e.tx + dx, e.ty + dy)) G.occ[idx(e.tx + dx, e.ty + dy)] = e.id; }
  for (let i = 0; i < N; i++) updBlk(i);
  pfInit(); rebuildSpatial(); recountPop(); updateFog();
  for (const u of G.units) { u.path = null; u.needPath = false; u.pi = 0; if (u.goal && u.st !== 'idle') requestPath(u, u.goal); }
  G.cam = s.cam || { x: 0, y: 0, z: 1 };
}
function saveGame() {
  if (!G || G.over || G.mp) return false;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serialize()));
    localStorage.setItem(META_KEY, JSON.stringify({ patron: G.pl[G.me].patron, time: G.time }));
    return true;
  } catch (_) { return false; }
}
function loadSaveMeta() { try { const m = JSON.parse(localStorage.getItem(META_KEY) || 'null'); return m && P[m.patron] && localStorage.getItem(SAVE_KEY) ? m : null; } catch (_) { return null; } }
function clearSave() { try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(META_KEY); } catch (_) { } }
function loadGame() {
  try {
    const s = localStorage.getItem(SAVE_KEY); if (!s) return false;
    deserialize(JSON.parse(s)); prepareRender(); enterGame(); clampCam();
    return true;
  } catch (e) { console.warn('chargement impossible', e); G = null; return false; }
}

/* ===== Téléchargement de la page ===== */
async function downloadGame() {
  const msg = $('dl-msg'), name = 'mythomachie.html';
  const say = t => { msg.hidden = false; msg.textContent = t; };
  try {
    if (window.claude && typeof window.claude.use === 'function') {
      const dl = await window.claude.use('downloads');
      if (dl) { await dl.save({ filename: name, data: PRISTINE }); say('Fichier enregistré : ouvrez « mythomachie.html » avec votre navigateur, même sans connexion.'); return; }
    }
  } catch (err) { if (err && err.code === 'declined') return; }
  try {
    const url = URL.createObjectURL(new Blob([PRISTINE], { type: 'text/html' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    say('Téléchargement lancé : ouvrez « mythomachie.html » avec votre navigateur, même sans connexion.');
  } catch (_) { say('Le téléchargement n’est pas disponible ici.'); }
}

/* ===== Boucle principale ===== */
let lastT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = lastT ? Math.min(0.1, Math.max(0, (now - lastT) / 1000)) : 0.016; lastT = now;
  if (G && G.terCv) {
    if (G.mp) netClientFrame(dt);
    else if (!G.paused) { let sim = dt * G.speed; while (sim > 1e-4) { const s = Math.min(0.05, sim); tick(s); sim -= s; } }
    // qualité adaptative : si l'appareil peine, on passe en résolution 1x
    if (!G.paused && !PERF.low) { PERF.acc += dt; PERF.n++; if (PERF.acc > 3) { if (PERF.acc / PERF.n > 0.034 && DPR > 1) { PERF.low = true; layout(); } PERF.acc = 0; PERF.n = 0; } }
    uiFrame(dt); render();
  }
}
function hotBoot() {
  const hot = window.claude && window.claude.hot;
  const start = data => {
    if (data && data.save) { try { deserialize(data.save); prepareRender(); enterGame(); } catch (e) { G = null; } }
  };
  try { if (hot && hot.snapshot) hot.snapshot(() => ({ save: G && !G.over && !G.mp && G.terCv ? serialize() : null })); } catch (_) { }
  if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
}
function boot() { initUI(); initNetUI(); hotBoot(); requestAnimationFrame(frame); }
window.MYTH = {
  get G() { return G; },
  start(o) { startNewGame(o); },
  autoplay() { if (G && !G.ai.some(a => a.p === 0)) G.ai.unshift(aiCreate(G.pl[0])); },
  fast(sec) { const n = Math.round(sec * 20); for (let i = 0; i < n && G && !G.over; i++) tick(0.05); },
  serialize: () => serialize(), load: s => { deserialize(s); prepareRender(); enterGame(); },
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
