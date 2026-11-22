/* ===== Dessins procéduraux : arbres, ressources, bâtiments, unités, icônes ===== */
const SPR = new Map();
const SPR_S = 2;
function sprite(key, w, h, draw) {
  let s = SPR.get(key); if (s) return s;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(w * SPR_S); cv.height = Math.ceil(h * SPR_S);
  const c = cv.getContext('2d'); c.scale(SPR_S, SPR_S); c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  s = { cv, w, h }; SPR.set(key, s); return s;
}
function P_(c, pts, fill, stroke, lw) {
  c.beginPath(); c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
}
function R_(c, x, y, w, h, fill, stroke, lw) {
  if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.strokeRect(x, y, w, h); }
}
function C_(c, x, y, r, fill, stroke, lw) {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
}
function E_(c, x, y, rx, ry, fill) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); c.fillStyle = fill; c.fill(); }
function L_(c, x0, y0, x1, y1, col, lw) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = col; c.lineWidth = lw || 1; c.stroke(); }
function RR_(c, x, y, w, h, r, fill, stroke, lw) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); }
}

/* ----- Arbres ----- */
function treeSprite(v) {
  return sprite('tree' + v, 46, 66, c => {
    const cx = 23, by = 60;
    E_(c, cx + 6, by - 1, 15, 5, 'rgba(8,22,8,0.30)');
    if (v <= 2) {
      const base = ['#3f6f2d', '#4c7a2f', '#36622b'][v], mid = ['#56913a', '#64993c', '#4c8436'][v], hi = ['#7bb24f', '#8cbd52', '#6fa748'][v];
      R_(c, cx - 2.5, by - 17, 5, 17, '#6b4a2b'); R_(c, cx - 2.5, by - 17, 2, 17, '#7f5a35');
      const blobs = [[cx, by - 29, 13], [cx - 9, by - 23, 9.5], [cx + 9, by - 24, 9.5], [cx - 4, by - 38, 10], [cx + 6, by - 36, 9]];
      for (const [x, y, r] of blobs) C_(c, x, y + 1.5, r + 1.4, 'rgba(20,40,15,0.55)');
      for (const [x, y, r] of blobs) C_(c, x, y, r, base);
      for (const [x, y, r] of blobs) C_(c, x - r * 0.18, y - r * 0.2, r * 0.75, mid);
      for (const [x, y, r] of blobs) C_(c, x - r * 0.35, y - r * 0.42, r * 0.35, hi);
    } else if (v <= 4) {
      const d = v === 3 ? '#24502f' : '#2b5a34', l = v === 3 ? '#356b3d' : '#3d7543';
      R_(c, cx - 2, by - 12, 4, 12, '#5a3d24');
      for (let k = 0; k < 4; k++) {
        const y = by - 10 - k * 11, w = 15 - k * 3;
        P_(c, [cx, y - 16, cx + w, y + 2, cx - w, y + 2], 'rgba(10,30,15,0.5)');
        P_(c, [cx, y - 17, cx + w - 1, y, cx - w + 1, y], d);
        P_(c, [cx, y - 17, cx, y, cx - w + 1, y], l);
      }
    } else {
      c.strokeStyle = '#8a6a42'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - 2, by); c.quadraticCurveTo(cx + 6, by - 22, cx + 2, by - 42); c.stroke();
      c.strokeStyle = '#6f5333'; c.lineWidth = 1;
      for (let k = 0; k < 7; k++) { const y = by - 4 - k * 5.5; L_(c, cx - 3 + k * 0.6, y, cx + 2 + k * 0.6, y - 1, '#6f5333', 1); }
      const tx = cx + 2, ty = by - 43;
      const fr = [[-16, 4], [-12, -8], [-2, -13], [10, -10], [16, 2], [6, 8], [-8, 9]];
      for (const [fx, fy] of fr) {
        c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + fx * 0.6, ty + fy * 0.6 - 6, tx + fx, ty + fy);
        c.strokeStyle = '#2f6a2c'; c.lineWidth = 4.5; c.stroke(); c.strokeStyle = '#4f9a3c'; c.lineWidth = 2; c.stroke();
      }
      C_(c, tx, ty + 1, 2.5, '#6b4a1f');
    }
  });
}

/* ----- Ressources ----- */
function goldSprite() {
  return sprite('gold', 76, 80, c => {
    const ox = 6, oy = 14; // empreinte 64x64 à (6,14)
    E_(c, ox + 36, oy + 56, 34, 10, 'rgba(0,0,0,0.28)');
    const rocks = [[ox + 14, oy + 40, 16, '#77736b'], [ox + 46, oy + 42, 18, '#6b675f'], [ox + 30, oy + 24, 20, '#858178'], [ox + 22, oy + 50, 12, '#625e57'], [ox + 50, oy + 22, 12, '#7d7970']];
    for (const [x, y, r, col] of rocks) { C_(c, x, y + 2, r + 1.5, 'rgba(30,28,25,0.6)'); C_(c, x, y, r, col); C_(c, x - r * 0.25, y - r * 0.3, r * 0.55, shade(col, 0.18)); }
    const nug = [[ox + 24, oy + 26, 5], [ox + 36, oy + 18, 4], [ox + 44, oy + 34, 5.5], [ox + 18, oy + 42, 4], [ox + 32, oy + 40, 6], [ox + 50, oy + 44, 3.5], [ox + 40, oy + 50, 4]];
    for (const [x, y, r] of nug) {
      P_(c, [x - r, y, x - r * 0.3, y - r, x + r * 0.8, y - r * 0.6, x + r, y + r * 0.3, x, y + r], '#c9961f', 'rgba(90,60,10,0.7)', 0.8);
      P_(c, [x - r * 0.6, y - 0.2, x - r * 0.2, y - r * 0.75, x + r * 0.5, y - r * 0.45, x + r * 0.2, y + r * 0.1], '#f6d35a');
      C_(c, x - r * 0.15, y - r * 0.4, r * 0.18, '#fff6c8');
    }
  });
}
function berrySprite(level) {
  return sprite('berry' + level, 40, 42, c => {
    const cx = 20, by = 36;
    E_(c, cx + 3, by, 15, 5, 'rgba(0,0,0,0.25)');
    const bl = [[cx - 7, by - 9, 8], [cx + 7, by - 9, 8], [cx, by - 15, 9], [cx - 2, by - 6, 8]];
    for (const [x, y, r] of bl) C_(c, x, y + 1, r + 1.2, 'rgba(15,35,15,0.6)');
    for (const [x, y, r] of bl) C_(c, x, y, r, '#2f6b33');
    for (const [x, y, r] of bl) C_(c, x - 2, y - 2, r * 0.6, '#3f8540');
    const rnd = mulberry32(level * 31 + 7);
    const n = [0, 4, 8, 12][level];
    for (let k = 0; k < n; k++) { const x = cx - 12 + rnd() * 24, y = by - 20 + rnd() * 16; C_(c, x, y, 2.1, k % 3 ? '#c72f45' : '#8e3dbf'); C_(c, x - 0.6, y - 0.7, 0.7, 'rgba(255,255,255,0.7)'); }
  });
}

/* ----- Bâtiments ----- */
const STY = {
  greek: { wall: '#efe8da', wallD: '#d8cfbd', roofL: '#c8663d', roofR: '#9a4628', stone: '#cfc6b2', stoneTop: '#e6e0d2', dark: '#4d3b2c', trim: '#e2b850', edge: 'rgba(58,38,26,0.55)', crop: '#d9b54a' },
  norse: { wall: '#7c5435', wallD: '#5f3f27', roofL: '#7f8c46', roofR: '#5c6935', stone: '#8f8b82', stoneTop: '#aaa69c', dark: '#24180f', trim: '#c9a46a', edge: 'rgba(28,16,8,0.6)', crop: '#c7b259' },
  egypt: { wall: '#e3c48c', wallD: '#c9a76c', roofL: '#ecd5a4', roofR: '#cdb07a', stone: '#d6bb85', stoneTop: '#efdcae', dark: '#4e3820', trim: '#2f63b0', edge: 'rgba(80,55,25,0.55)', crop: '#7fb24a' },
};
function gable(c, x, y, w, d, h, rh, o, wall, wallD, roofL, roofR, edge) {
  const yF = y + d - h, yB = y - h, mx = x + w / 2;
  P_(c, [mx, yF - rh, x + w + o, yF + 1, x + w + o, yB + 1, mx, yB - rh], roofR, edge, 1);
  P_(c, [mx, yF - rh, x - o, yF + 1, x - o, yB + 1, mx, yB - rh], roofL, edge, 1);
  L_(c, mx, yF - rh, mx, yB - rh, 'rgba(255,255,255,0.25)', 1);
  P_(c, [x, yF, mx, yF - rh + 1.5, x + w, yF], wallD, edge, 1);
  R_(c, x, yF, w, h, wall, edge, 1);
  return yF;
}
function flatBox(c, x, y, w, d, h, wall, top, edge) {
  R_(c, x, y - h, w, d, top, edge, 1);
  R_(c, x, y + d - h, w, h, wall, edge, 1);
  return y + d - h;
}
function banner(c, x, yBase, h, col) {
  L_(c, x, yBase, x, yBase - h, '#4a3524', 1.6);
  P_(c, [x + 0.5, yBase - h + 1, x + 11, yBase - h + 4, x + 0.5, yBase - h + 8], col, 'rgba(0,0,0,0.35)', 0.8);
  C_(c, x, yBase - h - 1, 1.4, '#e8c45a');
}
function shieldDisc(c, x, y, r, field, rim) { C_(c, x, y, r, rim || '#b98a3e'); C_(c, x, y, r * 0.72, field); C_(c, x, y, r * 0.2, rim || '#b98a3e'); }
function cols(c, x0, x1, yT, yB, n, col, sh) {
  const step = (x1 - x0) / (n - 1);
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step;
    R_(c, x - 2.6, yT, 5.2, yB - yT, col); R_(c, x + 1, yT, 1.6, yB - yT, sh);
    R_(c, x - 3.6, yT - 2, 7.2, 2.4, col); R_(c, x - 3.6, yB - 2, 7.2, 2.4, sh);
  }
}
function brazier(c, x, y) {
  R_(c, x - 2, y - 6, 4, 6, '#6b5333');
  E_(c, x, y - 7, 4.5, 1.8, '#3b2c1c');
  P_(c, [x - 3, y - 7, x, y - 15, x + 3, y - 7], '#ff9a2e'); P_(c, [x - 1.5, y - 7, x, y - 12, x + 1.5, y - 7], '#ffe27a');
}
function shadowBox(c, x, y, w, d, h) { P_(c, [x + 4, y + d, x + w + 4, y + d, x + w + 4 + h * 0.5, y + d - h * 0.15, x + w + h * 0.5, y + 4], 'rgba(0,0,0,0.22)'); }

function drawBuildingArt(c, t, style, col, fx, fy) {
  const S = STY[style], s = B[t].size * T, e = S.edge;
  if (t === 'farm') {
    RR_(c, fx + 3, fy + 3, s - 6, s - 6, 4, '#7a5a37', 'rgba(50,30,15,0.6)', 1);
    for (let i = 0; i < 8; i++) { const y = fy + 9 + i * 10.5; L_(c, fx + 7, y, fx + s - 7, y, '#5f4428', 2.5); for (let k = 0; k < 10; k++) { const x = fx + 10 + k * 8 + (i % 2) * 3; P_(c, [x - 2, y - 1, x, y - 6, x + 2, y - 1], S.crop); } }
    for (const [x, y] of [[fx + 2, fy + 2], [fx + s - 2, fy + 2], [fx + 2, fy + s - 2], [fx + s - 2, fy + s - 2], [fx + s / 2, fy + 2], [fx + 2, fy + s / 2], [fx + s - 2, fy + s / 2], [fx + s / 2, fy + s - 2]]) R_(c, x - 1.5, y - 6, 3, 7, '#5b4128');
    // épouvantail aux couleurs du camp
    const x = fx + s - 16, y = fy + 22; L_(c, x, y, x, y - 18, '#5b4128', 2); L_(c, x - 7, y - 12, x + 7, y - 12, '#5b4128', 2);
    R_(c, x - 4, y - 14, 8, 7, col); C_(c, x, y - 18, 3, '#d9b46a');
    return;
  }
  if (style === 'greek') {
    if (t === 'house') {
      shadowBox(c, fx + 8, fy + 16, 48, 40, 24);
      flatBox(c, fx + 5, fy + 20, 54, 38, 3, S.stone, S.stoneTop, e);
      const yF = gable(c, fx + 8, fy + 18, 48, 38, 20, 13, 4, S.wall, S.wallD, S.roofL, S.roofR, e);
      R_(c, fx + 28, yF + 8, 8, 12, S.dark); R_(c, fx + 14, yF + 6, 6, 5, '#6d5a47'); R_(c, fx + 44, yF + 6, 6, 5, '#6d5a47');
      P_(c, [fx + 25, yF + 8, fx + 39, yF + 8, fx + 37, yF + 5, fx + 27, yF + 5], col);
    } else if (t === 'city') {
      shadowBox(c, fx + 8, fy + 20, 112, 100, 50);
      flatBox(c, fx + 4, fy + 34, 120, 90, 9, S.stone, S.stoneTop, e);
      for (let k = 0; k < 3; k++) L_(c, fx + 4, fy + 116 - k * 3, fx + 124, fy + 116 - k * 3, 'rgba(90,70,50,0.35)', 1);
      R_(c, fx + 18, fy + 58, 92, 34, '#6f604c', e);
      const yF = fy + 92 - 34;
      gable(c, fx + 16, fy + 28, 96, 30, 0, 22, 5, S.wall, S.wallD, S.roofL, S.roofR, e);
      cols(c, fx + 22, fx + 106, yF, fy + 92, 7, S.wall, '#cbbfa8');
      P_(c, [fx + 16, yF, fx + 64, yF - 21, fx + 112, yF], S.wallD, e);
      C_(c, fx + 64, yF - 8, 5.5, col, e); C_(c, fx + 64, yF - 8, 2, '#f3d77a');
      R_(c, fx + 16, yF - 1, 96, 3, S.trim);
      banner(c, fx + 10, fy + 110, 50, col); banner(c, fx + 116, fy + 110, 50, col);
      brazier(c, fx + 40, fy + 110); brazier(c, fx + 88, fy + 110);
    } else if (t === 'temple') {
      shadowBox(c, fx + 8, fy + 16, 82, 76, 44);
      for (let k = 0; k < 3; k++) flatBox(c, fx + 4 + k * 3, fy + 30 + k * 2, 88 - k * 6, 62 - k * 2, 3, S.stone, S.stoneTop, e);
      R_(c, fx + 18, fy + 46, 60, 34, '#6f604c', e);
      const yF = fy + 46;
      gable(c, fx + 13, fy + 18, 70, 28, 0, 18, 4, S.wall, S.wallD, S.roofL, S.roofR, e);
      cols(c, fx + 18, fx + 78, yF, fy + 80, 5, S.wall, '#cbbfa8');
      P_(c, [fx + 13, yF, fx + 48, yF - 17, fx + 83, yF], S.wallD, e);
      R_(c, fx + 13, yF - 1, 70, 2.5, S.trim);
      C_(c, fx + 48, yF - 7, 3.5, '#f3d77a');
      P_(c, [fx + 48, yF - 20, fx + 51, yF - 26, fx + 45, yF - 26], S.trim);
      brazier(c, fx + 48, fy + 92);
      banner(c, fx + 8, fy + 88, 40, col);
    } else if (t === 'barracks') {
      shadowBox(c, fx + 8, fy + 22, 80, 62, 34);
      flatBox(c, fx + 5, fy + 30, 86, 58, 3, S.stone, S.stoneTop, e);
      const yF = gable(c, fx + 10, fy + 26, 76, 56, 26, 16, 4, S.wall, S.wallD, S.roofL, S.roofR, e);
      R_(c, fx + 41, yF + 10, 14, 16, S.dark);
      shieldDisc(c, fx + 22, yF + 12, 6, col); shieldDisc(c, fx + 74, yF + 12, 6, col);
      for (let k = 0; k < 4; k++) L_(c, fx + 88 + k * 2, fy + 86, fx + 84 + k * 3, fy + 54, '#6d4c2c', 1.4);
    } else if (t === 'store') {
      shadowBox(c, fx + 6, fy + 18, 52, 40, 22);
      const yF = gable(c, fx + 8, fy + 20, 48, 34, 16, 12, 5, S.wall, S.wallD, S.roofL, S.roofR, e);
      R_(c, fx + 14, yF + 3, 36, 13, '#5e4a36');
      for (const [x, y] of [[fx + 12, fy + 60], [fx + 20, fy + 62], [fx + 48, fy + 60]]) { E_(c, x, y - 5, 3.6, 5.5, '#c0703a'); R_(c, x - 1.5, y - 12, 3, 3, '#a45d2f'); }
      R_(c, fx + 30, fy + 54, 9, 8, '#9b7a4a', e); P_(c, [fx + 8, yF, fx + 56, yF, fx + 52, yF - 3, fx + 12, yF - 3], col);
    } else if (t === 'tower') {
      shadowBox(c, fx + 12, fy + 22, 40, 34, 70);
      const yF = flatBox(c, fx + 12, fy + 22, 40, 34, 66, S.wall, S.stoneTop, e);
      for (let k = 0; k < 5; k++) R_(c, fx + 12 + k * 8.5, fy + 22 - 66 - 5, 6, 5, S.wall, e);
      R_(c, fx + 29, yF + 10, 4, 12, S.dark); R_(c, fx + 29, yF + 34, 4, 12, S.dark);
      R_(c, fx + 26, yF + 54, 10, 12, S.dark);
      L_(c, fx + 12, yF + 28, fx + 52, yF + 28, 'rgba(120,100,80,0.4)', 1);
      banner(c, fx + 46, fy + 22 - 66, 18, col);
    }
  } else if (style === 'norse') {
    const planks = (x, y, w, h) => { for (let k = 4; k < w; k += 5) L_(c, x + k, y + 1, x + k, y + h - 1, 'rgba(30,18,8,0.35)', 1); };
    const cross = (mx, y) => { L_(c, mx - 6, y + 5, mx + 4, y - 6, '#4a2e18', 2.4); L_(c, mx + 6, y + 5, mx - 4, y - 6, '#4a2e18', 2.4); };
    if (t === 'house') {
      shadowBox(c, fx + 8, fy + 16, 48, 40, 26);
      flatBox(c, fx + 6, fy + 20, 52, 38, 3, S.stone, S.stoneTop, e);
      const yF = gable(c, fx + 9, fy + 18, 46, 38, 18, 18, 4, S.wall, S.wallD, S.roofL, S.roofR, e);
      planks(fx + 9, yF, 46, 18); cross(fx + 32, yF - 18);
      R_(c, fx + 27, yF + 6, 10, 12, S.dark); P_(c, [fx + 26, yF + 6, fx + 38, yF + 6, fx + 36, yF + 3, fx + 28, yF + 3], col);
    } else if (t === 'city') {
      shadowBox(c, fx + 10, fy + 24, 108, 96, 50);
      flatBox(c, fx + 6, fy + 36, 116, 86, 4, S.stone, S.stoneTop, e);
      const yF = gable(c, fx + 18, fy + 30, 92, 76, 32, 32, 6, S.wall, S.wallD, S.roofL, S.roofR, e);
      planks(fx + 18, yF, 92, 32); cross(fx + 64, yF - 32);
      R_(c, fx + 56, yF + 12, 16, 20, S.dark);
      for (const x of [fx + 30, fx + 44, fx + 84, fx + 98]) shieldDisc(c, x, yF + 15, 5.5, col, '#8a6a3a');
      for (let k = 0; k < 9; k++) { const x = fx + 4 + k * 3.4; P_(c, [x, fy + 120, x + 3, fy + 120, x + 3, fy + 86 + (k % 2) * 3, x + 1.5, fy + 82 + (k % 2) * 3, x, fy + 86 + (k % 2) * 3], '#6a4a2c', e); }
      banner(c, fx + 122, fy + 112, 54, col); brazier(c, fx + 48, fy + 116); brazier(c, fx + 80, fy + 116);
    } else if (t === 'temple') {
      shadowBox(c, fx + 10, fy + 16, 76, 74, 54);
      flatBox(c, fx + 8, fy + 34, 80, 56, 4, S.stone, S.stoneTop, e);
      const yF = gable(c, fx + 18, fy + 30, 60, 54, 26, 20, 4, '#5e3b22', '#4a2e1a', '#3f2c1d', '#2d1f14', e);
      gable(c, fx + 26, fy + 10, 44, 20, 0, 18, 4, '#5e3b22', '#4a2e1a', '#46321f', '#33241a', e);
      planks(fx + 18, yF, 60, 26); cross(fx + 48, yF - 20);
      c.beginPath(); c.moveTo(fx + 40, yF + 26); c.lineTo(fx + 40, yF + 12); c.arc(fx + 48, yF + 12, 8, Math.PI, 0); c.lineTo(fx + 56, yF + 26); c.fillStyle = S.dark; c.fill();
      R_(c, fx + 18, yF - 2, 60, 3, col);
      brazier(c, fx + 26, fy + 92); brazier(c, fx + 70, fy + 92);
    } else if (t === 'barracks') {
      shadowBox(c, fx + 8, fy + 22, 80, 62, 34);
      flatBox(c, fx + 6, fy + 32, 84, 56, 3, S.stone, S.stoneTop, e);
      const yF = gable(c, fx + 10, fy + 28, 76, 56, 24, 22, 4, S.wall, S.wallD, S.roofL, S.roofR, e);
      planks(fx + 10, yF, 76, 24); cross(fx + 48, yF - 22);
      R_(c, fx + 41, yF + 8, 14, 16, S.dark);
      for (const x of [fx + 18, fx + 30, fx + 66, fx + 78]) shieldDisc(c, x, yF + 12, 5, col, '#8a6a3a');
    } else if (t === 'store') {
      shadowBox(c, fx + 6, fy + 18, 52, 40, 22);
      const yF = gable(c, fx + 8, fy + 22, 48, 34, 16, 14, 5, S.wall, S.wallD, S.roofL, S.roofR, e);
      planks(fx + 8, yF, 48, 16);
      for (let k = 0; k < 3; k++) for (let j = 0; j < 3 - k; j++) { C_(c, fx + 15 + j * 7 + k * 3.5, fy + 61 - k * 6, 3.4, '#8b5a2b', 'rgba(40,20,5,0.6)'); C_(c, fx + 15 + j * 7 + k * 3.5, fy + 61 - k * 6, 1.6, '#c99a62'); }
      P_(c, [fx + 8, yF, fx + 56, yF, fx + 52, yF - 3, fx + 12, yF - 3], col);
    } else if (t === 'tower') {
      shadowBox(c, fx + 12, fy + 24, 40, 32, 70);
      for (const x of [fx + 14, fx + 48]) R_(c, x, fy + 6, 4, 50, '#5a3a22', e);
      L_(c, fx + 16, fy + 50, fx + 50, fy + 20, '#4a2e18', 2); L_(c, fx + 50, fy + 50, fx + 16, fy + 20, '#4a2e18', 2);
      const yF = flatBox(c, fx + 10, fy + 6, 44, 30, 12, S.wall, '#8d6a45', e);
      planks(fx + 10, yF, 44, 12);
      gable(c, fx + 10, fy - 6, 44, 30, 0, 18, 4, S.wall, S.wallD, '#4b3523', '#36261a', e);
      banner(c, fx + 32, fy - 30, 14, col);
    }
  } else { // égyptien
    const bands = (x, y, w) => { R_(c, x, y, w, 2.5, S.trim); R_(c, x, y + 2.5, w, 1.5, '#e0b23e'); };
    if (t === 'house') {
      shadowBox(c, fx + 8, fy + 16, 48, 40, 22);
      const yF = flatBox(c, fx + 8, fy + 22, 48, 36, 20, S.wall, S.stoneTop, e);
      R_(c, fx + 8, fy + 22 - 20, 48, 3, S.wallD);
      R_(c, fx + 28, yF + 8, 8, 12, S.dark); R_(c, fx + 14, yF + 5, 5, 4, S.dark); R_(c, fx + 45, yF + 5, 5, 4, S.dark);
      bands(fx + 8, yF, 48);
      E_(c, fx + 18, fy + 6, 4, 3, '#b0703a'); E_(c, fx + 44, fy + 10, 3, 2.5, '#b0703a');
      P_(c, [fx + 26, yF + 8, fx + 38, yF + 8, fx + 36, yF + 5, fx + 28, yF + 5], col);
    } else if (t === 'city') {
      shadowBox(c, fx + 8, fy + 20, 112, 96, 56);
      flatBox(c, fx + 6, fy + 40, 116, 84, 4, S.stone, S.stoneTop, e);
      const py = (x, w, h) => { P_(c, [x, fy + 104, x + w, fy + 104, x + w - 7, fy + 104 - h, x + 7, fy + 104 - h], S.wall, e); P_(c, [x + 7, fy + 104 - h, x + w - 7, fy + 104 - h, x + w - 9, fy + 104 - h - 12, x + 9, fy + 104 - h - 12], S.stoneTop, e); bands(x + 6, fy + 104 - h + 6, w - 12); };
      R_(c, fx + 24, fy + 40, 80, 44, S.wallD, e);
      py(fx + 14, 42, 58); py(fx + 72, 42, 58);
      R_(c, fx + 54, fy + 74, 20, 30, S.dark); R_(c, fx + 52, fy + 70, 24, 5, S.wall, e);
      C_(c, fx + 64, fy + 64, 4.5, '#e0b23e'); P_(c, [fx + 52, fy + 64, fx + 59, fy + 61, fx + 59, fy + 67], S.trim); P_(c, [fx + 76, fy + 64, fx + 69, fy + 61, fx + 69, fy + 67], S.trim);
      for (const x of [fx + 30, fx + 98]) { P_(c, [x - 3, fy + 120, x + 3, fy + 120, x + 1.6, fy + 84, x, fy + 80, x - 1.6, fy + 84], S.stoneTop, e); }
      banner(c, fx + 10, fy + 112, 52, col); banner(c, fx + 118, fy + 112, 52, col);
    } else if (t === 'temple') {
      shadowBox(c, fx + 8, fy + 16, 80, 74, 50);
      flatBox(c, fx + 4, fy + 34, 88, 58, 4, S.stone, S.stoneTop, e);
      R_(c, fx + 20, fy + 22, 56, 40, S.wallD, e);
      cols(c, fx + 26, fx + 70, fy + 30, fy + 62, 4, '#e8cf9a', '#c2a46e');
      const py = (x, w, h) => { P_(c, [x, fy + 88, x + w, fy + 88, x + w - 5, fy + 88 - h, x + 5, fy + 88 - h], S.wall, e); bands(x + 4, fy + 88 - h + 4, w - 8); };
      py(fx + 10, 30, 46); py(fx + 56, 30, 46);
      R_(c, fx + 40, fy + 62, 16, 26, S.dark); R_(c, fx + 38, fy + 58, 20, 5, S.wall, e);
      C_(c, fx + 48, fy + 52, 4, '#e0b23e');
      banner(c, fx + 8, fy + 92, 44, col);
    } else if (t === 'barracks') {
      shadowBox(c, fx + 8, fy + 22, 80, 62, 32);
      const yF = flatBox(c, fx + 8, fy + 30, 80, 56, 26, S.wall, S.stoneTop, e);
      for (let k = 0; k < 8; k++) R_(c, fx + 8 + k * 10.4, fy + 30 - 26 - 4, 7, 4, S.wall, e);
      bands(fx + 8, yF + 2, 80);
      R_(c, fx + 41, yF + 10, 14, 16, S.dark);
      banner(c, fx + 14, fy + 86, 40, col); banner(c, fx + 82, fy + 86, 40, col);
    } else if (t === 'store') {
      shadowBox(c, fx + 6, fy + 18, 52, 40, 20);
      flatBox(c, fx + 6, fy + 30, 52, 30, 6, S.wall, S.stoneTop, e);
      for (const [x, r] of [[fx + 18, 10], [fx + 40, 11]]) { c.beginPath(); c.moveTo(x - r, fy + 54); c.quadraticCurveTo(x - r, fy + 30, x, fy + 22); c.quadraticCurveTo(x + r, fy + 30, x + r, fy + 54); c.closePath(); c.fillStyle = S.wall; c.fill(); c.strokeStyle = e; c.stroke(); R_(c, x - 2.5, fy + 46, 5, 8, S.dark); }
      R_(c, fx + 6, fy + 54, 52, 3, col);
    } else if (t === 'tower') {
      shadowBox(c, fx + 12, fy + 22, 40, 34, 72);
      P_(c, [fx + 10, fy + 58, fx + 54, fy + 58, fx + 49, fy - 12, fx + 15, fy - 12], S.wall, e);
      R_(c, fx + 13, fy - 18, 38, 7, S.stoneTop, e);
      bands(fx + 14, fy - 4, 36); bands(fx + 12, fy + 36, 40);
      R_(c, fx + 30, fy + 8, 4, 12, S.dark); R_(c, fx + 27, fy + 44, 10, 14, S.dark);
      banner(c, fx + 46, fy - 18, 16, col);
    }
  }
}
function bldSprite(t, style, col) {
  const s = B[t].size * T, top = BLD_H[t] + 14;
  return sprite('b:' + t + ':' + style + ':' + col, s + 20, s + top + 8, c => drawBuildingArt(c, t, style, col, 10, top));
}
function bldAnchor(t) { return { ox: 10, oy: BLD_H[t] + 14 }; }

/* ----- Unités ----- */
const HAIR = { greek: '#4a3020', norse: '#d9b45a', egypt: '#1d1712' };
function legs(c, s, walk, col) {
  c.strokeStyle = col; c.lineWidth = 2.3 * s; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-1.7 * s, -6.5 * s); c.lineTo(-1.7 * s + walk * 2.4 * s, -0.5 * s);
  c.moveTo(1.7 * s, -6.5 * s); c.lineTo(1.7 * s - walk * 2.4 * s, -0.5 * s); c.stroke();
}
function torso(c, s, col, dark) { RR_(c, -4 * s, -14 * s, 8 * s, 8.5 * s, 2.5 * s, col, dark, 0.9); }
function headC(c, s, skin, y) { C_(c, 0.4 * s, (y || -17) * s, 3.4 * s, skin, 'rgba(60,35,20,0.55)', 0.7); }
function helmet(c, s, style, col, kind) {
  const hy = -17 * s;
  if (style === 'greek') {
    c.beginPath(); c.arc(0.4 * s, hy, 3.8 * s, Math.PI * 1.05, Math.PI * 2.05); c.fillStyle = '#c99a3f'; c.fill();
    if (kind === 'hoplite' || kind === 'einherjar') { c.beginPath(); c.moveTo(-3.6 * s, hy - 2.4 * s); c.quadraticCurveTo(0.4 * s, hy - 9 * s, 4.4 * s, hy - 2.6 * s); c.strokeStyle = col; c.lineWidth = 2.2 * s; c.stroke(); }
  } else if (style === 'norse') {
    P_(c, [-3.6 * s, hy - 0.5 * s, 0.4 * s, hy - 6.5 * s, 4.4 * s, hy - 0.5 * s], '#9aa0a6', 'rgba(40,40,40,0.6)', 0.6);
    L_(c, 2.6 * s, hy - 0.8 * s, 2.6 * s, hy + 2.4 * s, '#7e858c', 1.2 * s);
  } else {
    P_(c, [-3.8 * s, hy - 1.5 * s, 0.4 * s, hy - 4.6 * s, 4.6 * s, hy - 1.5 * s, 4.2 * s, hy + 3.5 * s, 2.5 * s, hy + 1 * s, -2 * s, hy + 1 * s, -4 * s, hy + 4.5 * s], '#2f63b0');
    L_(c, -3.6 * s, hy - 0.6 * s, 4.4 * s, hy - 0.6 * s, '#e0b23e', 1.1 * s);
  }
}
function drawUnitBody(c, u, col, style, ghost) {
  const t = u.t, walk = u.moving ? Math.sin(u.anim * 13) : 0, atk = u.atkAnim > 0 ? Math.sin((0.3 - u.atkAnim) / 0.3 * Math.PI) : 0;
  const skin = ghost ? '#bff7ff' : (u.skin || SKINS[1]);
  if (t === 'villager') {
    legs(c, 1, walk, '#4a3626');
    if (u.carry && u.carry.amt > 0) { const cc = { wood: '#8b5a2b', gold: '#f2c94c', food: '#c0392b' }[u.carry.type] || '#999'; RR_(c, -8, -16, 5, 8, 1.5, cc, 'rgba(0,0,0,0.4)', 0.6); }
    torso(c, 1, shade(col, 0.38), 'rgba(40,30,20,0.5)'); L_(c, -4, -9, 4, -9, '#6b4a2b', 1.2);
    headC(c, 1, skin); c.beginPath(); c.arc(0.4, -17.6, 3.5, Math.PI * 1.1, Math.PI * 1.95); c.fillStyle = HAIR[style]; c.fill();
    const working = (u.st === 'gather' && u.sub === 'work') || (u.st === 'build' && !u.moving && !u.path);
    if (working) {
      const a = Math.sin(u.work * 9) * 0.9 - 0.3; const tool = u.st === 'build' ? 'hammer' : u.lastType === 'wood' ? 'axe' : u.lastType === 'gold' ? 'pick' : 'basket';
      if (tool === 'basket') { E_(c, 5, -9 + Math.sin(u.work * 6), 3.5, 2.5, '#b08a4a'); }
      else {
        c.save(); c.translate(3, -11); c.rotate(a);
        L_(c, 0, 0, 9, -2, '#7a5530', 1.6);
        if (tool === 'axe') P_(c, [8, -5, 11, -4, 11, 1, 8, 0], '#a9b0b5');
        else if (tool === 'pick') { c.beginPath(); c.moveTo(6, -6); c.quadraticCurveTo(10, -3, 7, 3); c.strokeStyle = '#a9b0b5'; c.lineWidth = 1.6; c.stroke(); }
        else R_(c, 7, -4, 4, 4, '#8d8d8d');
        c.restore();
      }
    }
  } else if (t === 'hoplite' || t === 'einherjar') {
    legs(c, 1, walk, ghost ? '#7fd6e6' : '#5a4330');
    const th = atk * 4;
    L_(c, -4 + th, -5, 11 + th, -25, ghost ? '#dffcff' : '#6b4a2b', 1.6); P_(c, [11 + th, -25, 9.5 + th, -21.5, 12.6 + th, -22.2], ghost ? '#ffffff' : '#c9ccd0');
    torso(c, 1, ghost ? 'rgba(120,230,240,0.85)' : (style === 'greek' ? '#c89b4a' : style === 'norse' ? '#8c9196' : '#efe6d2'), 'rgba(40,30,20,0.5)');
    if (!ghost) R_(c, -4, -8.5, 8, 2.5, col);
    headC(c, 1, skin); helmet(c, 1, style, ghost ? '#8ff0e0' : col, t);
    if (style === 'egypt' && !ghost) { RR_(c, 1.5, -16, 6, 11, 2.5, '#d9c7a1', '#7a5a2a', 0.8); R_(c, 2.6, -14.5, 3.8, 8, col); }
    else { C_(c, 4, -10, 5.4, ghost ? 'rgba(200,250,255,0.9)' : (style === 'greek' ? '#b98a3e' : '#7a5533'), 'rgba(40,25,10,0.6)', 0.8); C_(c, 4, -10, 3.8, ghost ? 'rgba(120,220,235,0.9)' : col); C_(c, 4, -10, 1.2, '#e8c45a'); }
  } else if (t === 'archer') {
    legs(c, 1, walk, '#4a3a2a');
    R_(c, -7, -19, 3, 9, '#6b4423'); L_(c, -6, -19, -7, -22, '#e8e2d0', 1); L_(c, -5, -19, -4.5, -22, '#e8e2d0', 1);
    torso(c, 1, shade(col, 0.15), 'rgba(40,30,20,0.5)'); R_(c, -4, -9, 8, 1.5, '#5a3d22');
    headC(c, 1, skin);
    if (style === 'greek') { E_(c, 0.4, -20.2, 5.4, 1.4, '#a9874f'); c.beginPath(); c.arc(0.4, -20, 2.6, Math.PI, 0); c.fillStyle = '#a9874f'; c.fill(); }
    else if (style === 'norse') { c.beginPath(); c.arc(0.4, -17, 4.2, Math.PI * 0.85, Math.PI * 2.15); c.strokeStyle = '#5d6b3a'; c.lineWidth = 2; c.stroke(); }
    else { L_(c, -3, -19, 3.8, -19, col, 1.6); c.beginPath(); c.arc(0.4, -17.8, 3.5, Math.PI * 1.1, Math.PI * 1.95); c.fillStyle = HAIR.egypt; c.fill(); }
    const pull = atk * 3;
    c.beginPath(); c.arc(4, -13, 8, -1.2, 1.2); c.strokeStyle = '#7a4f28'; c.lineWidth = 1.8; c.stroke();
    L_(c, 4 + Math.cos(-1.2) * 8, -13 + Math.sin(-1.2) * 8, 4 - pull, -13, '#ede4cc', 0.7); L_(c, 4 - pull, -13, 4 + Math.cos(1.2) * 8, -13 + Math.sin(1.2) * 8, '#ede4cc', 0.7);
  } else if (t === 'cavalier') {
    const hc = ['#6b4423', '#8a5a35', '#3b2a1e', '#cfc2a6'][(u.id || 0) % 4];
    const g = walk * 3;
    for (const [x, ph] of [[-8, 1], [-5, -1], [5, -1], [8, 1]]) L_(c, x, -10, x + g * ph, -0.5, shade(hc, -0.2), 2.4);
    c.beginPath(); c.moveTo(-11, -13); c.quadraticCurveTo(-17, -10, -15, -4); c.strokeStyle = shade(hc, -0.35); c.lineWidth = 2.2; c.stroke();
    E_(c, 0, -13, 11.5, 5.2, hc);
    P_(c, [6, -15, 9, -24, 13.5, -25, 12, -20, 9, -12], hc);
    E_(c, 13.5, -24, 4.4, 2.5, hc); L_(c, 7, -17, 9.5, -24, shade(hc, -0.4), 1.6);
    RR_(c, -5, -18, 9, 6, 1.5, col, 'rgba(0,0,0,0.35)', 0.6);
    RR_(c, -3.5, -27, 6.5, 9, 2, shade(col, -0.1), 'rgba(0,0,0,0.4)', 0.7);
    c.save(); c.translate(0, -12); headC(c, 1, skin, -17.5); helmet(c, 1, style, col, 'cav'); c.restore();
    const th = atk * 5;
    L_(c, -9 + th, -21, 17 + th, -31, '#6b4a2b', 1.5); P_(c, [17 + th, -31, 14 + th, -30.5, 15.5 + th, -28], '#c9ccd0');
    P_(c, [-2 + th, -23.6, -2 + th + 6, -24.7, -2 + th + 1, -21.5], col);
  } else if (t === 'ram') {
    const th = atk * 7;
    C_(c, -8, -4, 3.8, '#4a321e'); C_(c, 8, -4, 3.8, '#4a321e'); C_(c, -8, -4, 1.4, '#9a7a4a'); C_(c, 8, -4, 1.4, '#9a7a4a');
    R_(c, 8 + th, -12.5, 9, 4.5, '#6b4a2b'); P_(c, [16 + th, -14, 21 + th, -10.2, 16 + th, -6.5], '#8a8f94');
    R_(c, -13, -17, 26, 12, '#7b5634', 'rgba(30,15,5,0.6)', 0.8);
    for (let k = -9; k < 13; k += 5) L_(c, k, -16.5, k, -5.5, 'rgba(40,22,8,0.5)', 0.8);
    P_(c, [-15, -16, 0, -27, 15, -16], '#5e4026', 'rgba(30,15,5,0.6)', 0.8);
    P_(c, [-6, -20, 6, -20, 3, -23.5, -3, -23.5], col);
  } else if (t === 'cyclops') {
    const s = 1.85, ss = '#c9a27c', sd = '#a07a55';
    legs(c, s, walk, sd);
    torso(c, s, ss, 'rgba(70,40,20,0.6)'); R_(c, -4 * s, -8.5 * s, 8 * s, 3 * s, col);
    L_(c, -4 * s, -13 * s, -6 * s, -7 * s, ss, 2.6 * s);
    const a = -0.6 + atk * 1.9;
    c.save(); c.translate(4 * s, -12 * s); c.rotate(a);
    L_(c, 0, 0, 3, -15 * s * 0.8, '#6e4b28', 3.4); C_(c, 3, -15 * s * 0.8, 4.6, '#5a3c20');
    c.restore();
    L_(c, 4 * s, -13 * s, 4 * s, -9 * s, ss, 2.6 * s);
    C_(c, 0.4 * s, -17.2 * s, 3.7 * s, ss, 'rgba(70,40,20,0.6)', 0.8);
    C_(c, 1.4 * s, -17.6 * s, 1.7 * s, '#ffffff'); C_(c, 1.9 * s, -17.6 * s, 0.85 * s, '#1d1a26');
    L_(c, -1.2 * s, -19.8 * s, 3.8 * s, -19.6 * s, '#5a3c20', 1.4);
  } else if (t === 'valkyrie') {
    const fl = Math.sin(u.anim * 9) * 0.35;
    c.save(); c.translate(-2, -16); c.rotate(-0.5 - fl); E_(c, -7, 0, 9, 3.6, '#f4f7ff'); E_(c, -6, 1, 6, 2, '#c9d6ee'); c.restore();
    c.save(); c.translate(-2, -16); c.rotate(0.15 + fl); E_(c, -8, -3, 8, 3, '#e6edfb'); c.restore();
    legs(c, 1.05, walk * 0.5, '#9aa3ad');
    P_(c, [-4.4, -8, 4.4, -8, 6, -1.5, -6, -1.5], col);
    torso(c, 1.05, '#c3cad3', 'rgba(40,40,60,0.5)');
    headC(c, 1.05, skin);
    c.beginPath(); c.arc(0.4, -18, 3.8, Math.PI * 1.05, Math.PI * 2.0); c.fillStyle = '#b8c0c9'; c.fill();
    P_(c, [-3, -20, -8, -24, -4, -19], '#ffffff'); P_(c, [3.5, -20, 8, -24.5, 4.5, -19], '#ffffff');
    L_(c, -3 + atk * 4, -6, 12 + atk * 4, -24, '#8a6a3a', 1.5); P_(c, [12 + atk * 4, -24, 10.4 + atk * 4, -20.8, 13.6 + atk * 4, -21.2], '#e6eef7');
  } else if (t === 'phoenix') {
    const fl = Math.sin(u.anim * 10);
    c.globalCompositeOperation = 'lighter';
    const g = c.createRadialGradient(0, -12, 2, 0, -12, 22); g.addColorStop(0, 'rgba(255,190,80,0.55)'); g.addColorStop(1, 'rgba(255,90,20,0)');
    c.fillStyle = g; c.beginPath(); c.arc(0, -12, 22, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
    for (const sgn of [-1, 1]) {
      const wy = -12 - fl * 9 * (sgn > 0 ? 1 : 0.8);
      P_(c, [-2, -12, -14, wy - 6 * sgn * 0.2, -20, wy + 2, -10, -9], sgn > 0 ? '#ff8a2a' : '#ff6a1a');
      P_(c, [-2, -12, -12, wy - 3, -16, wy + 2, -8, -10], '#ffd25a');
    }
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(-6, -10); c.quadraticCurveTo(-14, -6 + k * 3, -20 - k * 2, -2 + k * 4 + Math.sin(u.anim * 7 + k) * 2); c.strokeStyle = ['#ff5a1a', '#ff9a2a', '#ffd25a'][k]; c.lineWidth = 2.2 - k * 0.4; c.stroke(); }
    E_(c, 0, -12, 8, 4.6, '#ff9a2e'); E_(c, 1, -13, 5, 2.6, '#ffe07a');
    C_(c, 8, -15, 3.2, '#ffb347'); P_(c, [10.6, -15.8, 14, -14.4, 10.6, -13.6], '#ffe9a8'); C_(c, 8.8, -15.6, 0.8, '#3a1a0a');
    P_(c, [6, -18, 8, -22, 9, -17.5], col);
  }
}
function drawUnitAt(c, u, x, y, col, style) {
  const d = U[u.t], fly = !!d.fly;
  const bob = fly ? -22 + Math.sin(u.anim * 3) * 2.5 : (u.t === 'valkyrie' ? -4 + Math.sin(u.anim * 3) * 1.5 : 0);
  E_(c, x + 1.5, y + 1, d.r * 0.95, d.r * 0.42, fly ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.28)');
  c.save(); c.translate(x, y + bob);
  if (u.face < 0) c.scale(-1, 1);
  const ghost = u.t === 'einherjar';
  if (ghost) { c.globalAlpha = 0.72 + Math.sin(G ? G.time * 6 : 0) * 0.08; }
  drawUnitBody(c, u, col, style, ghost);
  c.restore();
  if (G && u.frozen > G.time) {
    E_(c, x, y - d.h * 0.45 + bob, d.r + 4, d.h * 0.55, 'rgba(170,225,255,0.45)');
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; L_(c, x + Math.cos(a) * (d.r), y - d.h * 0.4 + Math.sin(a) * 6 + bob, x + Math.cos(a) * (d.r + 5), y - d.h * 0.4 + Math.sin(a) * 9 + bob, '#ffffff', 1.2); }
  }
  if (G && u.shield > G.time) { c.beginPath(); c.ellipse(x, y - d.h * 0.4 + bob, d.r + 6, d.h * 0.6, 0, 0, TAU); c.strokeStyle = 'rgba(255,214,90,' + (0.5 + Math.sin(G.time * 5) * 0.2) + ')'; c.lineWidth = 1.6; c.stroke(); }
  if (G && u.buff > G.time && Math.random() < 0.15) addParts(x, y - d.h * 0.5 + bob, 1, '#ffe27a', d.r * 2, 30, 0.6, 2, -10);
}

/* ----- Icônes (images pour l'interface) ----- */
const ICO = new Map();
function iconURL(key, draw, size) {
  let u = ICO.get(key); if (u) return u;
  size = size || 64;
  const cv = document.createElement('canvas'); cv.width = size * 2; cv.height = size * 2;
  const c = cv.getContext('2d'); c.scale(2 * size / 64, 2 * size / 64); c.lineJoin = 'round'; c.lineCap = 'round';
  draw(c);
  u = cv.toDataURL('image/png'); ICO.set(key, u); return u;
}
function unitIcon(t, col, style) {
  return iconURL('u:' + t + col + style, c => {
    const d = U[t]; const big = d.h > 30 ? 0.95 : 1.55;
    c.translate(32, 54); c.scale(big, big);
    const fake = { t, id: 1, anim: 0.4, moving: false, atkAnim: 0, carry: { amt: 0 }, skin: SKINS[1], st: 'idle', face: 1 };
    if (t === 'phoenix') c.translate(0, 10);
    drawUnitBody(c, fake, col, style, t === 'einherjar');
  });
}
function bldIcon(t, style, col) {
  return iconURL('b:' + t + style + col, c => {
    const spr = bldSprite(t, style, col);
    const k = Math.min(60 / spr.w, 60 / spr.h);
    c.drawImage(spr.cv, 32 - spr.w * k / 2, 32 - spr.h * k / 2, spr.w * k, spr.h * k);
  });
}
function glyph(c, kind, color) {
  c.fillStyle = color; c.strokeStyle = color;
  switch (kind) {
    case 'bolt': P_(c, [36, 6, 18, 36, 30, 36, 24, 58, 46, 26, 33, 26, 40, 6], color, 'rgba(0,0,0,0.35)', 1.2); break;
    case 'aegis': c.beginPath(); c.moveTo(32, 8); c.lineTo(52, 16); c.quadraticCurveTo(52, 44, 32, 58); c.quadraticCurveTo(12, 44, 12, 16); c.closePath(); c.fill(); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1.5; c.stroke();
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8; L_(c, 32, 30, 32 + Math.cos(a) * 9, 30 + Math.sin(a) * 9, '#7a5a1a', 2); } C_(c, 32, 30, 4, '#7a5a1a'); break;
    case 'frost': c.lineWidth = 3.4; for (let k = 0; k < 6; k++) { const a = k * TAU / 6; const ex = 32 + Math.cos(a) * 24, ey = 32 + Math.sin(a) * 24; L_(c, 32, 32, ex, ey, color, 3.4); const mx = 32 + Math.cos(a) * 15, my = 32 + Math.sin(a) * 15; L_(c, mx, my, mx + Math.cos(a + 0.7) * 7, my + Math.sin(a + 0.7) * 7, color, 2.6); L_(c, mx, my, mx + Math.cos(a - 0.7) * 7, my + Math.sin(a - 0.7) * 7, color, 2.6); } break;
    case 'einherjar': c.beginPath(); c.arc(32, 32, 17, Math.PI, 0); c.lineTo(49, 44); c.lineTo(38, 44); c.lineTo(38, 56); c.lineTo(26, 56); c.lineTo(26, 44); c.lineTo(15, 44); c.closePath(); c.fill(); R_(c, 30, 28, 4, 24, 'rgba(0,40,50,0.55)'); L_(c, 18, 36, 46, 36, 'rgba(0,40,50,0.55)', 3); break;
    case 'sun': C_(c, 32, 32, 13, color); for (let k = 0; k < 12; k++) { const a = k * TAU / 12; P_(c, [32 + Math.cos(a - 0.12) * 16, 32 + Math.sin(a - 0.12) * 16, 32 + Math.cos(a) * 27, 32 + Math.sin(a) * 27, 32 + Math.cos(a + 0.12) * 16, 32 + Math.sin(a + 0.12) * 16], color); } C_(c, 32, 32, 7, '#fff1b8'); break;
    case 'blessing': c.lineWidth = 6; c.beginPath(); c.ellipse(32, 19, 8, 11, 0, 0, TAU); c.stroke(); L_(c, 32, 30, 32, 58, color, 6); L_(c, 16, 34, 48, 34, color, 6); break;
    case 'tools': c.save(); c.translate(32, 32); c.rotate(-0.7); R_(c, -3, -22, 6, 44, '#8a5a30'); R_(c, -12, -24, 24, 9, color); c.restore(); c.save(); c.translate(32, 32); c.rotate(0.7); R_(c, -2.5, -20, 5, 42, '#a0703c'); c.beginPath(); c.moveTo(-14, -14); c.quadraticCurveTo(0, -26, 14, -14); c.lineWidth = 5; c.strokeStyle = color; c.stroke(); c.restore(); break;
    case 'walls': for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) R_(c, 8 + k * 12 + (r % 2) * 6 - 3, 22 + r * 9, 11, 8, color, 'rgba(0,0,0,0.3)'); for (let k = 0; k < 4; k++) R_(c, 8 + k * 13, 12, 8, 9, color); break;
    case 'iron': c.save(); c.translate(32, 32); c.rotate(0.78); P_(c, [-3.5, -26, 3.5, -26, 3.5, 12, 0, 18, -3.5, 12], color); R_(c, -11, 10, 22, 5, '#8a6a3a'); R_(c, -2.5, 15, 5, 12, '#6b4a2b'); c.restore(); break;
    case 'shields': C_(c, 32, 32, 24, color); C_(c, 32, 32, 17, 'rgba(0,0,0,0.25)'); C_(c, 32, 32, 6, color); break;
    case 'rites': P_(c, [18, 40, 46, 40, 40, 54, 24, 54], '#8a6a3a'); P_(c, [22, 40, 32, 8, 42, 40], color); P_(c, [27, 40, 32, 20, 37, 40], '#fff1b8'); break;
    case 'blood': c.beginPath(); c.moveTo(32, 6); c.quadraticCurveTo(52, 34, 46, 44); c.arc(32, 42, 14, 0.15, Math.PI - 0.15); c.quadraticCurveTo(12, 34, 32, 6); c.fill(); break;
    case 'stop': RR_(c, 16, 16, 32, 32, 5, color); break;
    case 'amove': for (const s of [-1, 1]) { c.save(); c.translate(32, 32); c.rotate(s * 0.78); R_(c, -2.5, -24, 5, 34, color); R_(c, -8, 8, 16, 4, color); R_(c, -2, 12, 4, 10, color); c.restore(); } break;
    case 'rally': L_(c, 20, 56, 20, 8, color, 4); P_(c, [22, 9, 50, 18, 22, 28], color); break;
    case 'del': L_(c, 16, 16, 48, 48, color, 7); L_(c, 48, 16, 16, 48, color, 7); break;
    case 'army': c.beginPath(); c.arc(32, 36, 18, Math.PI, 0); c.lineTo(50, 50); c.lineTo(14, 50); c.closePath(); c.fill(); c.beginPath(); c.moveTo(14, 22); c.quadraticCurveTo(32, 2, 50, 22); c.lineWidth = 6; c.stroke(); break;
    case 'idle': C_(c, 26, 22, 8, color); RR_(c, 15, 32, 22, 22, 6, color); c.font = 'bold 20px Georgia, serif'; c.fillText('z', 40, 26); c.font = 'bold 14px Georgia, serif'; c.fillText('z', 50, 14); break;
    case 'box': c.setLineDash([6, 5]); c.lineWidth = 4; c.strokeRect(12, 14, 40, 36); c.setLineDash([]); P_(c, [38, 36, 54, 46, 46, 48, 50, 58, 46, 60, 42, 50, 36, 54], color); break;
    case 'city': P_(c, [8, 30, 32, 10, 56, 30], color); R_(c, 14, 30, 36, 24, color); R_(c, 28, 40, 8, 14, 'rgba(0,0,0,0.4)'); break;
    case 'food': c.lineWidth = 3; for (let k = -2; k <= 2; k++) { L_(c, 32, 58, 32 + k * 7, 20, '#b08a2a', 3); E_(c, 32 + k * 7.5, 18, 4, 9, color); } R_(c, 22, 40, 20, 5, '#8a6a2a'); break;
    case 'wood': for (const [x, y] of [[20, 36], [44, 36], [32, 20]]) { RR_(c, x - 14, y - 7, 28, 14, 7, '#8b5a2b', 'rgba(0,0,0,0.35)', 1); C_(c, x + 10, y, 5.5, color); C_(c, x + 10, y, 2.4, '#8b5a2b'); } break;
    case 'gold': for (const [x, y] of [[24, 40], [40, 40], [32, 26]]) { E_(c, x, y, 13, 9, '#a8781a'); E_(c, x, y - 2.5, 13, 9, color); E_(c, x - 3, y - 5, 4, 2, '#fff3b0'); } break;
    case 'foi': c.globalCompositeOperation = 'lighter'; { const g = c.createRadialGradient(32, 34, 2, 32, 34, 26); g.addColorStop(0, 'rgba(190,170,255,0.9)'); g.addColorStop(1, 'rgba(120,90,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); } c.globalCompositeOperation = 'source-over'; P_(c, [32, 6, 38, 26, 58, 32, 38, 38, 32, 58, 26, 38, 6, 32, 26, 26], color); break;
    case 'chat': RR_(c, 8, 10, 48, 34, 10, color); P_(c, [18, 42, 14, 56, 30, 43], color); for (const x of [22, 32, 42]) C_(c, x, 27, 3.6, '#1a2050'); break;
    case 'pop': C_(c, 32, 20, 10, color); c.beginPath(); c.moveTo(12, 58); c.quadraticCurveTo(12, 34, 32, 34); c.quadraticCurveTo(52, 34, 52, 58); c.closePath(); c.fill(); break;
  }
}
const GLYPH_COL = { bolt: '#cfe6ff', aegis: '#ffd35a', frost: '#bdf0ff', einherjar: '#8ff0e0', sun: '#ffae42', blessing: '#c8ff7a', tools: '#c9ccd0', walls: '#d8cbb0', iron: '#d7dde3', shields: '#c99a3f', rites: '#ffb347', blood: '#d0283c', stop: '#f2e6c4', amove: '#f2e6c4', rally: '#f2e6c4', del: '#ff8a7a', chat: '#f2e6c4', army: '#f2e6c4', idle: '#f2e6c4', box: '#f2e6c4', city: '#f2e6c4', food: '#e3b23c', wood: '#d9b07a', gold: '#f4cf4a', foi: '#cdb8ff', pop: '#e8e1cf' };
function glyphIcon(kind, color) { return iconURL('g:' + kind + (color || ''), c => glyph(c, kind, color || GLYPH_COL[kind] || '#fff')); }
/* Emblèmes des dieux (menu) */
function drawEmblem(c, patron, size) {
  const r = size / 2; c.save(); c.translate(r, r);
  const g = c.createRadialGradient(0, -r * 0.3, r * 0.1, 0, 0, r);
  const pal = { zeus: ['#33407e', '#141a3d'], odin: ['#2a4a66', '#0e1c2c'], ra: ['#7a3a1a', '#2c1208'] }[patron];
  g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r - 2, 0, TAU); c.fill();
  c.strokeStyle = '#d9b552'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, r - 3, 0, TAU); c.stroke();
  c.strokeStyle = 'rgba(217,181,82,0.45)'; c.lineWidth = 1; c.beginPath(); c.arc(0, 0, r - 9, 0, TAU); c.stroke();
  for (let k = 0; k < 24; k++) { const a = k * TAU / 24; C_(c, Math.cos(a) * (r - 6), Math.sin(a) * (r - 6), 1.1, 'rgba(243,221,146,0.8)'); }
  const k = size / 64; c.scale(k, k); c.translate(-32, -32);
  if (patron === 'zeus') { glyph(c, 'bolt', '#f3dd92'); }
  else if (patron === 'odin') {
    c.lineWidth = 5; c.strokeStyle = '#cfe6ff'; c.lineCap = 'round';
    L_(c, 26, 12, 26, 54, '#cfe6ff', 5); L_(c, 26, 14, 40, 24, '#cfe6ff', 5); L_(c, 26, 26, 40, 36, '#cfe6ff', 5);
  } else {
    C_(c, 32, 32, 10, '#f5c74a'); C_(c, 32, 32, 6, '#ffe9a0');
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(32 + s * 10, 30); c.quadraticCurveTo(32 + s * 24, 20, 32 + s * 28, 24); c.quadraticCurveTo(32 + s * 22, 30, 32 + s * 26, 32); c.quadraticCurveTo(32 + s * 20, 36, 32 + s * 10, 35); c.closePath(); c.fillStyle = '#e0b23e'; c.fill(); }
  }
  c.restore();
}
