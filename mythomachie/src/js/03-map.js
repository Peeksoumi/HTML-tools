/* ===== Génération de la carte ===== */
// Terrain : 0 herbe, 1 eau, 2 sable, 3 terre
function computeTreeVars() {
  const W = G.W, H = G.H, seed = G.opts.seed;
  const nk = makeNoise((seed ^ 0x1234) >>> 0);
  G.tvar = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; const h = hash2(x, y, seed);
    if (G.ter[i] === 2) G.tvar[i] = 5;                       // palmier
    else if (fbm(nk, x / 9, y / 9, 2) > 0.56) G.tvar[i] = 3 + (h < 0.5 ? 0 : 1); // sapins
    else G.tvar[i] = (h * 3) | 0;                             // feuillus
  }
}

function setupGame(opts) {
  G = newState(opts);
  const size = MAPS[opts.map].size; G.W = size; G.H = size;
  const W = size, H = size, N = W * H, nP = 1 + opts.ais;
  const seed = opts.seed >>> 0; const r = mulberry32(seed);
  G.ter = new Uint8Array(N); G.tree = new Float32Array(N); G.occ = new Int32Array(N); G.blk = new Uint8Array(N);
  G.stump = new Uint8Array(N); G.ex = new Uint8Array(N); G.vis = new Uint8Array(N);

  // Positions de départ (centre de la cité)
  const m = size <= 48 ? 8 : 10;
  const corners = [[m, m], [W - 1 - m, H - 1 - m], [W - 1 - m, m], [m, H - 1 - m]];
  let order;
  if (nP === 2) order = r() < 0.5 ? [0, 1] : [2, 3];
  else order = shuffle([0, 1, 2, 3], r).slice(0, nP);
  const starts = order.map(k => [corners[k][0] + Math.floor(r() * 3) - 1, corners[k][1] + Math.floor(r() * 3) - 1]);
  G.starts = starts;
  const minD = (x, y) => { let md = 1e9; for (const s of starts) { const d = Math.hypot(x - s[0], y - s[1]); if (d < md) md = d; } return md; };

  // Lacs et terre battue
  const nl = makeNoise((seed ^ 0x51ed) >>> 0), nf = makeNoise((seed ^ 0x2f77) >>> 0), nd = makeNoise((seed ^ 0x7a31) >>> 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, md = minD(x, y);
    const e = fbm(nl, x / 10, y / 10, 3);
    const edge = Math.min(x, y, W - 1 - x, H - 1 - y);
    if (e > 0.64 && md > 12 && edge > 1) G.ter[i] = 1;
    else if (fbm(nd, x / 7, y / 7, 2) > 0.67) G.ter[i] = 3;
  }
  // Rivages
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (G.ter[i] === 1) continue;
    let near = false;
    for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && G.ter[yy * W + xx] === 1) { near = true; break; }
    }
    if (near) G.ter[i] = 2;
  }
  // Forêts
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (G.ter[i] === 1) continue;
    const md = minD(x, y); if (md < 7.5) continue;
    const f = fbm(nf, x / 8, y / 8, 3);
    if (f > 0.6 || r() < 0.016 || (G.ter[i] === 2 && r() < 0.07)) G.tree[i] = 100;
  }
  // Abords des cités : dégagés et terre battue
  for (const [sx, sy] of starts) {
    for (let y = sy - 7; y <= sy + 7; y++) for (let x = sx - 7; x <= sx + 7; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x, d = Math.hypot(x - sx + 0.5, y - sy + 0.5);
      if (d < 6) { G.tree[i] = 0; if (G.ter[i] === 1) G.ter[i] = 2; }
      if (d < 3.6 && G.ter[i] !== 1) G.ter[i] = 3;
    }
  }
  computeTreeVars();
  for (let i = 0; i < N; i++) updBlk(i);

  // Joueurs
  const names = { zeus: 'Olympe', odin: 'Asgard', ra: 'Héliopolis' };
  G.pl.push(makePlayer(0, opts.patron, false, opts.diff, 'Vous'));
  const pool = shuffle(PATRONS.filter(p => p !== opts.patron), r);
  const used = {};
  for (let i = 1; i < nP; i++) {
    const pat = i - 1 < pool.length ? pool[i - 1] : PATRONS[Math.floor(r() * 3)];
    used[pat] = (used[pat] || 0) + 1;
    G.pl.push(makePlayer(i, pat, true, opts.diff, names[pat] + (used[pat] > 1 || pat === opts.patron ? ' II' : '')));
  }

  // Ressources de chaque camp
  const place = (t, cx, cy, s) => {
    const tx = Math.round(cx - s / 2), ty = Math.round(cy - s / 2);
    for (let y = ty - 1; y <= ty + s; y++) for (let x = tx - 1; x <= tx + s; x++) {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return null;
      const i = y * W + x;
      if (x >= tx && x < tx + s && y >= ty && y < ty + s) { if (G.ter[i] === 1 || G.occ[i]) return null; }
      else if (G.occ[i]) return null;
    }
    for (let y = ty; y < ty + s; y++) for (let x = tx; x < tx + s; x++) { G.tree[y * W + x] = 0; updBlk(y * W + x); }
    return makeRes(t, tx, ty, t === 'gold' ? 1600 : 220);
  };
  const tryPlace = (t, sx, sy, ang, dist, s) => {
    for (let k = 0; k < 40; k++) {
      const a = ang + (r() - 0.5) * 0.9 * (1 + k / 10), d = dist + (r() - 0.5) * 2;
      const res = place(t, sx + Math.cos(a) * d, sy + Math.sin(a) * d, s);
      if (res) return res;
    }
    return null;
  };
  starts.forEach(([sx, sy], i) => {
    makeBuilding('city', i, sx - 2, sy - 2, true);
    const toCenter = Math.atan2(H / 2 - sy, W / 2 - sx);
    const a0 = toCenter + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.5);
    // baies
    const b0 = tryPlace('berry', sx, sy, a0, 6.2, 1);
    if (b0) { let n = 0; for (let k = 0; k < 30 && n < 4; k++) { if (place('berry', b0.tx + Math.floor(r() * 4) - 1.5 + 0.5, b0.ty + Math.floor(r() * 4) - 1.5 + 0.5, 1)) n++; } }
    tryPlace('gold', sx, sy, a0 + 2.2, 7.8, 2);
    tryPlace('gold', sx, sy, a0 + 4.1, 13, 2);
    // forêt garantie
    const af = toCenter + Math.PI + (r() - 0.5) * 1.2;
    const fx = sx + Math.cos(af) * 9.5, fy = sy + Math.sin(af) * 9.5;
    for (let y = Math.floor(fy - 4); y <= fy + 4; y++) for (let x = Math.floor(fx - 4); x <= fx + 4; x++) {
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const i = y * W + x; if (G.ter[i] === 1 || G.occ[i]) continue;
      if (Math.hypot(x - fx, y - fy) < 3.6 && Math.hypot(x - sx, y - sy) > 6.5 && r() < 0.9) { G.tree[i] = 100; updBlk(i); }
    }
  });
  // Mines et baies neutres
  const extraGold = Math.round(W * H / 750), extraBerry = Math.round(W * H / 1600);
  const spots = [];
  for (let k = 0; k < 600 && spots.length < extraGold + extraBerry; k++) {
    const x = 4 + r() * (W - 8), y = 4 + r() * (H - 8);
    if (minD(x, y) < 15) continue;
    if (spots.some(s => Math.hypot(s[0] - x, s[1] - y) < 9)) continue;
    const t = spots.length < extraGold ? 'gold' : 'berry';
    const res = place(t, x, y, t === 'gold' ? 2 : 1);
    if (res) {
      if (t === 'gold') res.amt = res.max = 2400;
      else { let n = 0; for (let q = 0; q < 20 && n < 3; q++) if (place('berry', res.tx + Math.floor(r() * 3) - 1 + 0.5, res.ty + Math.floor(r() * 3) - 1 + 0.5, 1)) n++; }
      spots.push([x, y]);
    }
  }
  ensureConnectivity(starts);

  // Unités de départ
  starts.forEach(([sx, sy], i) => {
    const city = G.blds.find(b => b.o === i && b.t === 'city');
    for (let k = 0; k < 4; k++) { const p = spawnPos(city); makeUnit('villager', i, p.x, p.y); }
    const p = spawnPos(city); makeUnit('cavalier', i, p.x, p.y);
  });
  for (const pl of G.pl) if (pl.ai) G.ai.push(aiCreate(pl));
  pfInit();
  recountPop();
}

function bfsFrom(sx, sy) {
  const W = G.W, H = G.H, seen = new Uint8Array(W * H), q = [];
  const s = nearestFree(sx, sy, 8); if (!s) return seen;
  seen[s[1] * W + s[0]] = 1; q.push(s[1] * W + s[0]);
  for (let h = 0; h < q.length; h++) {
    const c = q[h], x = c % W, y = (c / W) | 0;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of nb) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx; if (seen[ni] || G.blk[ni]) continue;
      seen[ni] = 1; q.push(ni);
    }
  }
  return seen;
}
function ensureConnectivity(starts) {
  const W = G.W;
  for (let pass = 0; pass < 4; pass++) {
    const seen = bfsFrom(starts[0][0], starts[0][1] + 3);
    let allOk = true;
    for (let i = 1; i < starts.length; i++) {
      const f = nearestFree(starts[i][0], starts[i][1] + 3, 8);
      if (f && seen[f[1] * W + f[0]]) continue;
      allOk = false;
      // creuser un passage en ligne droite
      const [ax, ay] = starts[0], [bx, by] = starts[i];
      const L = Math.hypot(bx - ax, by - ay);
      for (let s = 0; s <= L; s += 0.5) {
        const x = ax + (bx - ax) * s / L, y = ay + (by - ay) * s / L;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const tx = Math.round(x + dx), ty = Math.round(y + dy); if (!inb(tx, ty)) continue;
          const k = idx(tx, ty);
          if (G.tree[k] > 0) G.tree[k] = 0;
          if (G.ter[k] === 1) G.ter[k] = 2;
          updBlk(k);
        }
      }
    }
    if (allOk) return;
  }
}
function spawnPos(b) {
  const s = b.size;
  for (let ring = 1; ring < 6; ring++) {
    const cand = [];
    for (let x = b.tx - ring; x < b.tx + s + ring; x++) { cand.push([x, b.ty + s - 1 + ring]); }
    for (let y = b.ty - ring; y < b.ty + s + ring; y++) { cand.push([b.tx - ring, y]); cand.push([b.tx + s - 1 + ring, y]); }
    for (let x = b.tx - ring; x < b.tx + s + ring; x++) { cand.push([x, b.ty - ring]); }
    const start = Math.floor(Math.random() * Math.max(1, s + 2 * ring));
    for (let k = 0; k < cand.length; k++) {
      const [x, y] = cand[(k < s + 2 * ring) ? (start + k) % (s + 2 * ring) : k];
      if (inb(x, y) && !G.blk[idx(x, y)]) return { x: x * T + T / 2 + (Math.random() - 0.5) * 10, y: y * T + T / 2 + (Math.random() - 0.5) * 10 };
    }
  }
  return { x: b.x, y: b.y + s * T / 2 + T / 2 };
}
