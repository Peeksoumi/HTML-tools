/* ===== Rendu du monde ===== */
let CV = null, CTX = null, DPR = 1, VW = 0, VH = 0;
const DLP = []; let DLN = 0;
function dlPush(y, k, r, a) { let e = DLP[DLN]; if (!e) e = DLP[DLN] = { y: 0, k: 0, r: null, a: 0 }; e.y = y; e.k = k; e.r = r; e.a = a; DLN++; }
const DL_SORT = (a, b) => a.y - b.y;
const MARKS = [];

function waterDepth() {
  const W = G.W, N = W * G.H, d = new Uint8Array(N).fill(255), q = [];
  for (let i = 0; i < N; i++) if (G.ter[i] !== 1) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, y = (c / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= G.H) continue;
      const ni = ny * W + nx; if (d[ni] <= d[c] + 1) continue; d[ni] = d[c] + 1; q.push(ni);
    }
  }
  return d;
}
function landCol(n1, n2, t, x, y) {
  const v = fbm(n1, x / 6, y / 6, 3), w = n2(x * 0.7, y * 0.7);
  if (t === 0) return 'hsl(' + ((86 + v * 26) | 0) + ',' + ((36 + v * 14) | 0) + '%,' + ((29 + v * 11 + w * 3) | 0) + '%)';
  if (t === 3) return 'hsl(' + ((32 + v * 8) | 0) + ',' + ((30 + v * 10) | 0) + '%,' + ((37 + v * 9) | 0) + '%)';
  return 'hsl(' + ((42 + v * 6) | 0) + ',' + ((44 + v * 8) | 0) + '%,' + ((63 + v * 8) | 0) + '%)';
}
function buildTerrain() {
  const W = G.W, H2 = G.H, sc = G.terSc = Math.min(1, 2048 / (W * T));
  const cv = document.createElement('canvas'); cv.width = Math.round(W * T * sc); cv.height = Math.round(H2 * T * sc);
  const c = cv.getContext('2d'); c.setTransform(sc, 0, 0, sc, 0, 0);
  const seed = G.opts.seed >>> 0, n1 = makeNoise((seed ^ 0x9e37) >>> 0), n2 = makeNoise((seed ^ 0x4f1b) >>> 0), rnd = mulberry32(seed ^ 0xbeef);
  const depth = G.wdepth = waterDepth();
  for (let y = 0; y < H2; y++) for (let x = 0; x < W; x++) { const t = G.ter[y * W + x]; c.fillStyle = landCol(n1, n2, t === 1 ? 2 : t, x, y); c.fillRect(x * T, y * T, T + 0.6, T + 0.6); }
  for (let y = 0; y < H2; y++) for (let x = 0; x < W; x++) {
    const t = G.ter[y * W + x]; if (t === 1) continue;
    c.fillStyle = landCol(n1, n2, t, x, y); c.globalAlpha = 0.55;
    for (let k = 0; k < 2; k++) { c.beginPath(); c.arc(x * T + T / 2 + (rnd() - 0.5) * T * 0.9, y * T + T / 2 + (rnd() - 0.5) * T * 0.9, T * (0.42 + rnd() * 0.3), 0, TAU); c.fill(); }
  }
  c.globalAlpha = 1;
  const layers = [[1, '#79b9cf', 0.8], [1, '#4b93bb', 0.7], [2, '#3279a8', 0.72], [3, '#28689a', 0.74], [4, '#205a8a', 0.76]];
  for (const [lv, col, rad] of layers) {
    c.fillStyle = col;
    for (let y = 0; y < H2; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (G.ter[i] !== 1 || depth[i] < lv) continue;
      c.beginPath(); c.arc(x * T + T / 2, y * T + T / 2, T * rad, 0, TAU); c.fill();
    }
  }
  for (let y = 0; y < H2; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = G.ter[i];
    if (t === 0) {
      for (let k = 0; k < 3; k++) {
        const px = x * T + rnd() * T, py = y * T + rnd() * T, dark = rnd() < 0.5;
        c.strokeStyle = dark ? 'rgba(30,60,20,0.35)' : 'rgba(170,210,110,0.22)'; c.lineWidth = 1.2;
        c.beginPath(); c.moveTo(px, py); c.lineTo(px - 1.5, py - 4); c.moveTo(px + 1, py); c.lineTo(px + 2, py - 4.5); c.stroke();
      }
      if (rnd() < 0.035) { const cols = ['#f4efe0', '#f2d15a', '#c99ae8']; const col = cols[(rnd() * 3) | 0]; for (let k = 0; k < 3; k++) { c.fillStyle = col; c.beginPath(); c.arc(x * T + rnd() * T, y * T + rnd() * T, 1.3, 0, TAU); c.fill(); } }
    } else if (t === 3) {
      if (rnd() < 0.35) { c.fillStyle = 'rgba(90,75,55,0.45)'; c.beginPath(); c.ellipse(x * T + rnd() * T, y * T + rnd() * T, 2 + rnd() * 2, 1.4 + rnd(), 0, 0, TAU); c.fill(); }
    } else if (t === 2) {
      if (rnd() < 0.3) { c.fillStyle = 'rgba(150,120,70,0.35)'; c.fillRect(x * T + rnd() * T, y * T + rnd() * T, 1.5, 1.5); }
    }
  }
  const g = c.createRadialGradient(W * T / 2, H2 * T / 2, W * T * 0.35, W * T / 2, H2 * T / 2, W * T * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,0.35)');
  c.fillStyle = g; c.fillRect(0, 0, W * T, H2 * T);
  G.terCv = cv; G.terCtx = c;
}
const MINI_COL = { 0: [79, 127, 55], 1: [47, 111, 159], 2: [205, 184, 134], 3: [138, 117, 80] };
function buildMini() {
  const cv = document.createElement('canvas'); cv.width = G.W; cv.height = G.H;
  const c = cv.getContext('2d'); const img = c.createImageData(G.W, G.H);
  for (let i = 0; i < G.W * G.H; i++) { const col = G.tree[i] > 0 ? [35, 74, 36] : MINI_COL[G.ter[i]]; img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255; }
  c.putImageData(img, 0, 0); G.miniCv = cv; G.miniCtx = c;
}
function buildFog() {
  const cv = document.createElement('canvas'); cv.width = G.W; cv.height = G.H;
  G.fogCv = cv; G.fogCtx = cv.getContext('2d'); G.fogImg = G.fogCtx.createImageData(G.W, G.H); G.fogDirty = true;
}
function refreshFog() {
  if (!G.fogDirty) return; G.fogDirty = false;
  const d = G.fogImg.data, vis = G.vis, ex = G.ex;
  for (let i = 0; i < vis.length; i++) { const o = i * 4; d[o] = 6; d[o + 1] = 8; d[o + 2] = 20; d[o + 3] = vis[i] ? 0 : ex[i] ? 118 : 255; }
  G.fogCtx.putImageData(G.fogImg, 0, 0);
}
function prepareRender() {
  buildTerrain(); buildMini(); buildFog();
  H.onTreeGone = (tx, ty) => { if (!G.miniCtx) return; const c = MINI_COL[G.ter[idx(tx, ty)]]; G.miniCtx.fillStyle = 'rgb(' + c.join(',') + ')'; G.miniCtx.fillRect(tx, ty, 1, 1); };
  H.onScorch = (e) => {
    const c = G.terCtx; if (!c) return; const r = mulberry32(e.id * 977);
    c.save(); c.globalAlpha = 0.28; c.fillStyle = '#2a2116';
    for (let k = 0; k < 10; k++) { c.beginPath(); c.arc(e.tx * T + r() * e.size * T, e.ty * T + r() * e.size * T, T * (0.3 + r() * 0.5), 0, TAU); c.fill(); }
    c.restore();
  };
}

/* ----- Caméra ----- */
function s2w(sx, sy) { return { x: G.cam.x + sx / G.cam.z, y: G.cam.y + sy / G.cam.z }; }
function w2s(wx, wy) { return { x: (wx - G.cam.x) * G.cam.z, y: (wy - G.cam.y) * G.cam.z }; }
function clampCam() {
  const z = G.cam.z, vw = VW / z, vh = VH / z, mw = G.W * T, mh = G.H * T;
  const top = (UI.topH || 0) / z, bot = (UI.botH || 0) / z, m = 60;
  if (vw > mw + 2 * m) G.cam.x = (mw - vw) / 2; else G.cam.x = clamp(G.cam.x, -m, mw - vw + m);
  if (vh > mh + top + bot + 2 * m) G.cam.y = (mh - vh) / 2; else G.cam.y = clamp(G.cam.y, -m - top, mh - vh + m + bot);
}
function centerOn(x, y) { G.cam.x = x - VW / G.cam.z / 2; G.cam.y = y - (VH - (UI.botH || 0) + (UI.topH || 0)) / G.cam.z / 2; clampCam(); }
function onScreen(x, y, m) { m = m || 0; const p = w2s(x, y); return p.x > -m && p.y > -m && p.x < VW + m && p.y < VH + m; }

/* ----- Dessin ----- */
function hpBar(c, x, y, w, f) {
  c.fillStyle = 'rgba(0,0,0,0.65)'; c.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  c.fillStyle = f > 0.6 ? '#62d66a' : f > 0.3 ? '#f2c94c' : '#ef5350'; c.fillRect(x - w / 2, y, w * clamp(f, 0, 1), 3);
}
function drawBuilding(c, b, ghostAlpha) {
  const pl = G.pl[b.o], style = P[pl.patron].style;
  const spr = bldSprite(b.t, style, pl.color), an = bldAnchor(b.t);
  const x0 = b.tx * T - an.ox, y0 = b.ty * T - an.oy;
  if (ghostAlpha) { c.globalAlpha = ghostAlpha; c.drawImage(spr.cv, x0, y0, spr.w, spr.h); c.globalAlpha = 1; return; }
  if (b.built) c.drawImage(spr.cv, x0, y0, spr.w, spr.h);
  else {
    const s = b.size * T;
    R_(c, b.tx * T + 2, b.ty * T + 2, s - 4, s - 4, 'rgba(110,90,60,0.35)', 'rgba(235,215,165,0.7)', 1.2);
    const p = clamp(b.prog, 0, 1), vis = spr.h * (0.12 + 0.88 * p);
    c.save(); c.globalAlpha = 0.5 + 0.45 * p; c.beginPath(); c.rect(x0, y0 + spr.h - vis, spr.w, vis); c.clip(); c.drawImage(spr.cv, x0, y0, spr.w, spr.h); c.restore();
    const hgt = BLD_H[b.t] * (0.4 + 0.6 * p);
    for (const fx of [0.12, 0.88]) { const x = b.tx * T + s * fx; L_(c, x, (b.ty + b.size) * T - 4, x, (b.ty + b.size) * T - 4 - hgt, '#8a6a3f', 1.6); }
    L_(c, b.tx * T + s * 0.12, (b.ty + b.size) * T - 4 - hgt * 0.6, b.tx * T + s * 0.88, (b.ty + b.size) * T - 4 - hgt * 0.6, '#8a6a3f', 1.4);
  }
  if (b.built && b.hp < b.mhp * 0.5 && Math.random() < 0.12) addParts(b.x + (Math.random() - 0.5) * b.size * T * 0.6, b.y - BLD_H[b.t] * 0.4, 1, b.hp < b.mhp * 0.25 ? '#ff8a3a' : '#6b6560', 8, 30, 1.6, 5, -6);
}
function drawRes(c, r) {
  if (r.t === 'gold') { const s = goldSprite(); c.drawImage(s.cv, r.tx * T - 6, r.ty * T - 14, s.w, s.h); }
  else { const f = r.amt / r.max, lv = f > 0.66 ? 3 : f > 0.33 ? 2 : f > 0 ? 1 : 0; const s = berrySprite(lv); c.drawImage(s.cv, r.tx * T - 4, r.ty * T - 8, s.w, s.h); }
}
function drawTree(c, tx, ty, v) { const s = treeSprite(v); c.drawImage(s.cv, tx * T + 16 - 23, ty * T + 29 - 60, s.w, s.h); }
function drawCorpse(c, f, a) {
  const pl = G.pl[f.o]; if (!pl) return; const style = P[pl.patron].style;
  c.save(); c.globalAlpha = a; c.translate(f.x, f.y);
  if (f.t === 'phoenix' || f.t === 'einherjar') { c.restore(); return; }
  c.rotate((f.face || 1) * Math.PI / 2 * 0.9); if ((f.face || 1) < 0) c.scale(-1, 1);
  drawUnitBody(c, { t: f.t, id: 1, anim: 0, moving: false, atkAnim: 0, carry: { amt: 0 }, skin: f.skin, st: 'idle', face: 1 }, shade(pl.color, -0.25), style, false);
  c.restore();
}
function jagged(c, x, y, seed, len) {
  const r = mulberry32((seed * 1000) | 0); c.beginPath(); c.moveTo(x + (r() - 0.5) * 30, y - len);
  for (let k = 1; k <= 9; k++) c.lineTo(x + (r() - 0.5) * (k < 9 ? 26 : 0), y - len + len * k / 9);
}
function drawFxGround(c, vx0, vy0, vx1, vy1) {
  for (const z of G.zones) {
    if (z.x + z.r < vx0 || z.x - z.r > vx1 || z.y + z.r < vy0 || z.y - z.r > vy1) continue;
    const a = 0.32 + Math.sin(G.time * 9 + z.x) * 0.06;
    const g = c.createRadialGradient(z.x, z.y, 4, z.x, z.y, z.r); g.addColorStop(0, 'rgba(255,220,120,' + (a + 0.25) + ')'); g.addColorStop(0.6, 'rgba(255,120,30,' + a + ')'); g.addColorStop(1, 'rgba(255,80,0,0)');
    c.fillStyle = g; c.beginPath(); c.ellipse(z.x, z.y, z.r, z.r * 0.8, 0, 0, TAU); c.fill();
  }
  for (const f of G.fx) {
    const age = G.time - f.t0, p = age / f.life;
    if (f.x < vx0 - 160 || f.x > vx1 + 160 || f.y < vy0 - 160 || f.y > vy1 + 220) continue;
    if (f.k === 'scorch') { E_(c, f.x, f.y, 16, 7, 'rgba(25,18,10,' + (0.5 * (1 - p)) + ')'); }
    else if (f.k === 'rubble') {
      const r = mulberry32(f.x * 7 + f.y), a = p > 0.8 ? (1 - p) * 5 : 1, s = f.size * T;
      c.globalAlpha = a; for (let k = 0; k < 14; k++) { const x = f.x + (r() - 0.5) * s * 0.9, y = f.y + (r() - 0.5) * s * 0.8; P_(c, [x - 4, y, x - 1, y - 4, x + 4, y - 2, x + 3, y + 2], r() < 0.5 ? '#8f877a' : '#6d655a'); }
      c.globalAlpha = 1;
    } else if (f.k === 'frost') {
      const a = p < 0.85 ? 0.42 : (1 - p) * 2.8;
      const g = c.createRadialGradient(f.x, f.y, 4, f.x, f.y, f.r); g.addColorStop(0, 'rgba(225,248,255,' + a + ')'); g.addColorStop(1, 'rgba(150,210,255,0)');
      c.fillStyle = g; c.beginPath(); c.ellipse(f.x, f.y, f.r, f.r * 0.8, 0, 0, TAU); c.fill();
    } else if (f.k === 'corpse') drawCorpse(c, f, p > 0.6 ? (1 - p) / 0.4 : 1);
  }
}
function drawFxAir(c, vx0, vy0, vx1, vy1) {
  for (const f of G.fx) {
    const age = G.time - f.t0, p = age / f.life;
    if (f.x < vx0 - 200 || f.x > vx1 + 200 || f.y < vy0 - 100 || f.y > vy1 + 500) continue;
    switch (f.k) {
      case 'bolt': {
        const a = 1 - p;
        jagged(c, f.x, f.y, f.seed, 380); c.strokeStyle = 'rgba(150,190,255,' + (0.45 * a) + ')'; c.lineWidth = 8; c.stroke();
        jagged(c, f.x, f.y, f.seed, 380); c.strokeStyle = 'rgba(255,255,255,' + a + ')'; c.lineWidth = 2.2; c.stroke();
        const g = c.createRadialGradient(f.x, f.y, 2, f.x, f.y, 34); g.addColorStop(0, 'rgba(255,255,255,' + a + ')'); g.addColorStop(1, 'rgba(160,200,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, 34, 0, TAU); c.fill(); break;
      }
      case 'cast': { c.beginPath(); c.ellipse(f.x, f.y, f.r * Math.min(1, p * 2), f.r * 0.8 * Math.min(1, p * 2), 0, 0, TAU); c.strokeStyle = rgba(f.color, 1 - p); c.lineWidth = 3; c.stroke(); break; }
      case 'dome': { c.beginPath(); c.ellipse(f.x, f.y - 6, f.r, f.r * 0.8, 0, 0, TAU); c.fillStyle = 'rgba(255,214,90,' + (0.25 * (1 - p)) + ')'; c.fill(); c.strokeStyle = 'rgba(255,230,140,' + (0.8 * (1 - p)) + ')'; c.lineWidth = 2; c.stroke(); break; }
      case 'bless': { const r = mulberry32(f.t0 * 1000); for (let k = 0; k < 16; k++) { const a = r() * TAU, rr = r() * f.r, x = f.x + Math.cos(a) * rr, y = f.y + Math.sin(a) * rr * 0.8; L_(c, x, y - p * 50, x, y - p * 50 - 16, 'rgba(210,255,140,' + (0.8 * (1 - p)) + ')', 2); } break; }
      case 'summon': case 'spawn': case 'vanish': {
        const col = f.k === 'spawn' ? '255,215,110' : '140,240,230';
        c.beginPath(); c.ellipse(f.x, f.y, 6 + p * 22, (6 + p * 22) * 0.6, 0, 0, TAU); c.strokeStyle = 'rgba(' + col + ',' + (1 - p) + ')'; c.lineWidth = 2.5; c.stroke();
        if (f.k !== 'vanish') { c.beginPath(); c.arc(f.x, f.y - 14, 14 * (1 - p) + 2, 0, TAU); c.fillStyle = 'rgba(' + col + ',' + 0.25 * (1 - p) + ')'; c.fill(); }
        break;
      }
      case 'boom': { const g = c.createRadialGradient(f.x, f.y, 1, f.x, f.y, 6 + p * 20); g.addColorStop(0, 'rgba(255,240,170,' + (1 - p) + ')'); g.addColorStop(1, 'rgba(255,90,20,0)'); c.fillStyle = g; c.beginPath(); c.arc(f.x, f.y, 6 + p * 20, 0, TAU); c.fill(); break; }
    }
  }
  for (const p of G.parts) {
    if (p.x < vx0 - 20 || p.x > vx1 + 20 || p.y < vy0 - 40 || p.y > vy1 + 40) continue;
    c.globalAlpha = clamp(p.life / p.max, 0, 1); c.fillStyle = p.color; c.beginPath(); c.arc(p.x, p.y, p.size * (0.5 + 0.5 * p.life / p.max), 0, TAU); c.fill();
  }
  c.globalAlpha = 1;
}
function drawProj(c) {
  for (const p of G.proj) {
    const d = Math.hypot(p.tx - p.x, p.ty - p.y), prog = clamp(1 - d / p.d0, 0, 1), arc = Math.sin(prog * Math.PI) * Math.min(42, p.d0 * 0.22);
    const x = p.x, y = p.y - arc;
    if (p.kind === 'fire') {
      const g = c.createRadialGradient(x, y, 1, x, y, 9); g.addColorStop(0, '#fff3c0'); g.addColorStop(0.5, 'rgba(255,150,40,0.9)'); g.addColorStop(1, 'rgba(255,60,0,0)');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fill();
      if (Math.random() < 0.5) addParts(x, y, 1, '#ff9a2a', 4, 10, 0.4, 2.5, 0);
    } else {
      const vx = p.tx - p.x, vy = (p.ty - p.y) - Math.cos(prog * Math.PI) * Math.min(42, p.d0 * 0.22) * 2.2, l = Math.hypot(vx, vy) || 1;
      L_(c, x - vx / l * 9, y - vy / l * 9, x, y, '#3b2a1a', 1.5); L_(c, x - vx / l * 9, y - vy / l * 9, x - vx / l * 6, y - vy / l * 6, '#e8e2d0', 1.8);
    }
  }
}
function render() {
  if (!G || !CTX) return;
  const c = CTX, z = G.cam.z;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#05060d'; c.fillRect(0, 0, CV.width, CV.height);
  c.setTransform(DPR * z, 0, 0, DPR * z, -G.cam.x * DPR * z, -G.cam.y * DPR * z);
  const vx0 = G.cam.x, vy0 = G.cam.y, vx1 = vx0 + VW / z, vy1 = vy0 + VH / z;
  const mw = G.W * T, mh = G.H * T, sc = G.terSc;
  c.imageSmoothingEnabled = true;
  const sx = Math.max(0, vx0), sy = Math.max(0, vy0), ex = Math.min(mw, vx1), ey = Math.min(mh, vy1);
  if (ex > sx && ey > sy) c.drawImage(G.terCv, sx * sc, sy * sc, (ex - sx) * sc, (ey - sy) * sc, sx, sy, ex - sx, ey - sy);
  const W = G.W;
  const tx0 = Math.max(0, Math.floor(vx0 / T) - 1), ty0 = Math.max(0, Math.floor(vy0 / T) - 1);
  const tx1 = Math.min(G.W - 1, Math.ceil(vx1 / T) + 1), ty1 = Math.min(G.H - 1, Math.ceil(vy1 / T) + 3);
  // reflets sur l'eau et souches
  const tt = G.time;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * W + tx;
    if (G.ter[i] === 1 && G.wdepth[i] >= 1) {
      const h = hash2(tx, ty, 7); if (h > 0.4) continue;
      const ox = ((h * 97 + tt * 7) % T), oy = hash2(ty, tx, 3) * T;
      L_(c, tx * T + ox, ty * T + oy, tx * T + ox + 7, ty * T + oy, 'rgba(220,240,255,' + (0.12 + 0.1 * Math.sin(tt * 2 + h * 30)) + ')', 1.3);
    } else if (G.stump[i] && G.ex[i]) { E_(c, tx * T + 16, ty * T + 24, 4.5, 2.8, '#6b4a2b'); E_(c, tx * T + 16, ty * T + 23, 3.5, 2, '#b08a5a'); }
  }
  drawFxGround(c, vx0, vy0, vx1, vy1);
  const sel = new Set(G.sel);
  const rv = G.revealAll;
  // fermes au sol
  for (const b of G.blds) {
    if (b.t !== 'farm' || b.dead) continue;
    if ((b.tx + 3) * T < vx0 || b.tx * T > vx1 || (b.ty + 3) * T < vy0 || b.ty * T > vy1) continue;
    if (b.o !== 0 && !rv && !G.ex[idx(b.tx + 1, b.ty + 1)]) continue;
    drawBuilding(c, b);
  }
  // anneaux de sélection
  for (const id of G.sel) {
    const e = G.byId.get(id); if (!e) continue;
    const col = e.k === 'r' ? '#ffe08a' : e.o === 0 ? '#a6f5a0' : '#ff7b6b';
    if (e.k === 'u') { c.beginPath(); c.ellipse(e.x, e.y + 1, U[e.t].r + 3, (U[e.t].r + 3) * 0.48, 0, 0, TAU); c.strokeStyle = col; c.lineWidth = 1.8; c.stroke(); }
    else { const s = e.size * T; c.beginPath(); c.ellipse(e.x, e.y + 4, s * 0.62, s * 0.5, 0, 0, TAU); c.strokeStyle = col; c.lineWidth = 2; c.setLineDash([7, 5]); c.stroke(); c.setLineDash([]); }
  }
  // liste triée par profondeur
  DLN = 0;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * W + tx; if (G.tree[i] > 0 && (G.ex[i] || rv)) dlPush(ty * T + T, 0, null, i);
  }
  for (const r of G.ress) {
    if (r.dead || (r.tx + r.size) * T < vx0 - 20 || r.tx * T > vx1 + 20 || (r.ty + r.size) * T < vy0 || r.ty * T > vy1 + 40) continue;
    if (!rv && !G.ex[idx(r.tx, r.ty)]) continue;
    dlPush((r.ty + r.size) * T, 1, r, 0);
  }
  for (const b of G.blds) {
    if (b.dead || b.t === 'farm') continue;
    if ((b.tx + b.size) * T < vx0 - 30 || b.tx * T > vx1 + 30 || (b.ty + b.size) * T < vy0 || b.ty * T - 100 > vy1) continue;
    if (b.o !== 0 && !rv && !G.ex[idx(b.tx + (b.size >> 1), b.ty + (b.size >> 1))]) continue;
    dlPush((b.ty + b.size) * T - 2, 2, b, 0);
  }
  const fly = [];
  for (const u of G.units) {
    if (u.dead || u.x < vx0 - 40 || u.x > vx1 + 40 || u.y < vy0 - 20 || u.y > vy1 + 70) continue;
    if (u.o !== 0 && !rv && !visibleAt(u.x, u.y)) continue;
    if (U[u.t].fly) fly.push(u); else dlPush(u.y, 3, u, 0);
  }
  const list = DLP.slice(0, DLN).sort(DL_SORT);
  for (const e of list) {
    if (e.k === 0) { const i = e.a; drawTree(c, i % W, (i / W) | 0, G.tvar[i]); }
    else if (e.k === 1) drawRes(c, e.r);
    else if (e.k === 2) drawBuilding(c, e.r);
    else { const u = e.r, pl = G.pl[u.o]; drawUnitAt(c, u, u.x, u.y, pl.color, P[pl.patron].style); }
  }
  for (const u of fly) { const pl = G.pl[u.o]; drawUnitAt(c, u, u.x, u.y, pl.color, P[pl.patron].style); }
  drawProj(c);
  drawFxAir(c, vx0, vy0, vx1, vy1);
  // brouillard
  if (!rv) { refreshFog(); c.imageSmoothingEnabled = true; c.drawImage(G.fogCv, 0, 0, G.W, G.H, 0, 0, mw, mh); }
  // barres de vie
  for (const u of G.units) {
    if (u.dead || u.x < vx0 - 30 || u.x > vx1 + 30 || u.y < vy0 - 10 || u.y > vy1 + 60) continue;
    if (u.o !== 0 && !rv && !visibleAt(u.x, u.y)) continue;
    const d = U[u.t];
    if (sel.has(u.id) || (u.hp < u.mhp && G.time - u.hitT < 5)) hpBar(c, u.x, u.y - d.h - (d.fly ? 28 : d.t === 'valkyrie' ? 6 : 4) - 4, d.cls === 'myth' ? 30 : 20, u.hp / u.mhp);
  }
  for (const b of G.blds) {
    if (b.dead || b.t === 'farm' && !sel.has(b.id)) continue;
    if (!(sel.has(b.id) || (b.hp < b.mhp && (G.time - b.hitT < 6 || !b.built)))) continue;
    if (b.o !== 0 && !rv && !G.ex[idx(b.tx + (b.size >> 1), b.ty + (b.size >> 1))]) continue;
    hpBar(c, b.x, b.ty * T - BLD_H[b.t] - 4, b.size * T * 0.6, b.built ? b.hp / b.mhp : b.prog);
  }
  for (const id of G.sel) { const e = G.byId.get(id); if (e && e.k === 'r') hpBar(c, e.x, e.ty * T - 10, 28, e.amt / e.max); }
  // point de ralliement
  if (G.sel.length === 1) {
    const b = G.byId.get(G.sel[0]);
    if (b && b.k === 'b' && b.o === 0 && b.rally) {
      c.setLineDash([5, 6]); L_(c, b.x, b.y, b.rally.x, b.rally.y, 'rgba(255,240,200,0.6)', 1.4); c.setLineDash([]);
      L_(c, b.rally.x, b.rally.y, b.rally.x, b.rally.y - 22, '#4a3524', 2); P_(c, [b.rally.x, b.rally.y - 22, b.rally.x + 13, b.rally.y - 18, b.rally.x, b.rally.y - 13], G.pl[0].color);
    }
  }
  // marques d'ordre
  for (let i = MARKS.length - 1; i >= 0; i--) {
    const m = MARKS[i], p = (performance.now() - m.t0) / 600; if (p >= 1) { MARKS.splice(i, 1); continue; }
    c.beginPath(); c.ellipse(m.x, m.y, 4 + p * 14, (4 + p * 14) * 0.5, 0, 0, TAU); c.strokeStyle = m.col.replace('A', String(1 - p)); c.lineWidth = 2; c.stroke();
  }
  drawModeOverlay(c);
  if (UI.box) {
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    const b = UI.box, x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1), w = Math.abs(b.x1 - b.x0), h = Math.abs(b.y1 - b.y0);
    c.fillStyle = 'rgba(166,245,160,0.12)'; c.fillRect(x, y, w, h); c.strokeStyle = 'rgba(166,245,160,0.9)'; c.lineWidth = 1.5; c.strokeRect(x, y, w, h);
  }
}
function drawModeOverlay(c) {
  if (UI.mode === 'place' && UI.ghost) {
    const t = UI.placeType, s = B[t].size, g = UI.ghost;
    const fake = { t, o: 0, tx: g.tx, ty: g.ty, size: s, x: (g.tx + s / 2) * T, y: (g.ty + s / 2) * T, built: true, prog: 1, hp: 1, mhp: 1 };
    const ok = canPlace(t, 0, g.tx, g.ty, false);
    for (let y = g.ty; y < g.ty + s; y++) for (let x = g.tx; x < g.tx + s; x++) {
      let good = inb(x, y) && x > 0 && y > 0 && x < G.W - 1 && y < G.H - 1;
      if (good) { const i = idx(x, y); good = G.ter[i] !== 1 && !G.tree[i] && !G.occ[i] && G.ex[i]; }
      c.fillStyle = good ? 'rgba(120,255,140,0.28)' : 'rgba(255,80,70,0.42)'; c.fillRect(x * T + 1, y * T + 1, T - 2, T - 2);
    }
    drawBuilding(c, fake, ok ? 0.75 : 0.4);
  } else if (UI.mode === 'power' && UI.ptarget) {
    const gp = GP[UI.powerId], r = gp.r * T, p = UI.ptarget;
    c.beginPath(); c.ellipse(p.x, p.y, r, r * 0.8, 0, 0, TAU); c.fillStyle = rgba(gp.color, 0.16); c.fill();
    c.setLineDash([8, 6]); c.lineDashOffset = -performance.now() / 40; c.strokeStyle = rgba(gp.color, 0.9); c.lineWidth = 2; c.stroke(); c.setLineDash([]);
  }
}

/* ----- Minicarte ----- */
function drawMini() {
  const m = UI.mini; if (!m || !G || !G.miniCv) return;
  const c = m.ctx, w = m.w, h = m.h, k = Math.min(w / G.W, h / G.H), ox = (w - G.W * k) / 2, oy = (h - G.H * k) / 2;
  m.k = k; m.ox = ox; m.oy = oy;
  c.setTransform(m.dpr, 0, 0, m.dpr, 0, 0);
  c.fillStyle = '#05060d'; c.fillRect(0, 0, w, h);
  c.imageSmoothingEnabled = false; c.drawImage(G.miniCv, ox, oy, G.W * k, G.H * k);
  for (const r of G.ress) { if (r.dead || (!G.revealAll && !G.ex[idx(r.tx, r.ty)])) continue; c.fillStyle = r.t === 'gold' ? '#f4cf4a' : '#d94a6a'; c.fillRect(ox + r.tx * k, oy + r.ty * k, Math.max(2, r.size * k), Math.max(2, r.size * k)); }
  if (!G.revealAll) { c.imageSmoothingEnabled = true; c.drawImage(G.fogCv, ox, oy, G.W * k, G.H * k); }
  for (const b of G.blds) {
    if (b.dead) continue;
    if (b.o !== 0 && !G.revealAll && !G.ex[idx(b.tx, b.ty)]) continue;
    c.fillStyle = G.pl[b.o].color; c.fillRect(ox + b.tx * k - 0.5, oy + b.ty * k - 0.5, b.size * k + 1, b.size * k + 1);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 0.6; c.strokeRect(ox + b.tx * k - 0.5, oy + b.ty * k - 0.5, b.size * k + 1, b.size * k + 1);
  }
  for (const u of G.units) {
    if (u.dead) continue;
    if (u.o !== 0 && !G.revealAll && !visibleAt(u.x, u.y)) continue;
    c.fillStyle = G.pl[u.o].color; const s = U[u.t].cls === 'myth' ? 3 : 2;
    c.fillRect(ox + u.x / T * k - s / 2, oy + u.y / T * k - s / 2, s, s);
  }
  const now = performance.now();
  for (let i = UI.pings.length - 1; i >= 0; i--) {
    const p = UI.pings[i], a = (now - p.t0) / 2200; if (a >= 1) { UI.pings.splice(i, 1); continue; }
    c.beginPath(); c.arc(ox + p.x / T * k, oy + p.y / T * k, 3 + (a * 3 % 1) * 9, 0, TAU); c.strokeStyle = rgba(p.col, 1 - a); c.lineWidth = 1.5; c.stroke();
  }
  const z = G.cam.z;
  c.strokeStyle = 'rgba(255,248,225,0.9)'; c.lineWidth = 1;
  c.strokeRect(ox + G.cam.x / T * k, oy + G.cam.y / T * k, VW / z / T * k, VH / z / T * k);
}
