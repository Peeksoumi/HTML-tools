// ===== Carte → GPX : algorithmes (aucune dépendance) =====
const Core = (() => {

  // ---------- PDF : extraction de la plus grande image JPEG embarquée ----------
  function extractJpegsFromPdf(bytes) {
    const s = new TextDecoder('latin1').decode(bytes);
    const out = [];
    let i = 0;
    while ((i = s.indexOf('/DCTDecode', i)) !== -1) {
      const dictStart = s.lastIndexOf('<<', i);
      const st = s.indexOf('stream', i);
      if (st === -1) break;
      let p = st + 6;
      if (s[p] === '\r') p++;
      if (s[p] === '\n') p++;
      const end = s.indexOf('endstream', p);
      if (end === -1) break;
      // la vraie fin du JPEG est le dernier FFD9 avant "endstream"
      let e = end;
      while (e > p && !(bytes[e - 2] === 0xFF && bytes[e - 1] === 0xD9)) e--;
      if (bytes[p] === 0xFF && bytes[p + 1] === 0xD8 && e > p) {
        const dict = s.slice(dictStart, st);
        const w = +(dict.match(/\/Width\s+(\d+)/) || [])[1] || 0;
        const h = +(dict.match(/\/Height\s+(\d+)/) || [])[1] || 0;
        out.push({ data: bytes.subarray(p, e), w, h });
      }
      i = end;
    }
    out.sort((a, b) => b.w * b.h - a.w * a.h || b.data.length - a.data.length);
    return out;
  }

  // ---------- Masque couleur ----------
  function colorMask(rgba, w, h, rgb, tol) {
    const m = new Uint8Array(w * h), t2 = tol * tol;
    const [R, G, B] = rgb;
    for (let i = 0, j = 0; i < m.length; i++, j += 4) {
      const dr = rgba[j] - R, dg = rgba[j + 1] - G, db = rgba[j + 2] - B;
      if (dr * dr + dg * dg + db * db <= t2) m[i] = 1;
    }
    return m;
  }

  // ---------- Transformée de distance euclidienne (Felzenszwalb) ----------
  // renvoie la distance² de chaque pixel au pixel "feature" (feat[i]==1) le plus proche
  function edt(feat, w, h) {
    const INF = 1e20, d = new Float32Array(w * h);
    for (let i = 0; i < d.length; i++) d[i] = feat[i] ? 0 : INF;
    const n = Math.max(w, h);
    const f = new Float64Array(n), z = new Float64Array(n + 1), v = new Int32Array(n), dd = new Float64Array(n);
    const pass = (len) => {
      let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
      for (let q = 1; q < len; q++) {
        let s;
        while (true) {
          s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
          if (s <= z[k]) { k--; if (k < 0) { k = 0; break; } } else break;
        }
        k++; v[k] = q; z[k] = s; z[k + 1] = INF;
      }
      k = 0;
      for (let q = 0; q < len; q++) {
        while (z[k + 1] < q) k++;
        dd[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
      }
    };
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) f[y] = d[y * w + x];
      pass(h);
      for (let y = 0; y < h; y++) d[y * w + x] = dd[y];
    }
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) f[x] = d[o + x];
      pass(w);
      for (let x = 0; x < w; x++) d[o + x] = dd[x];
    }
    return d;
  }

  // demi-épaisseur typique du trait épais (pixels), estimée sur la distance au fond
  function estimateHalfWidth(mask, w, h, dist2) {
    const vals = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; if (!mask[i]) continue;
      const v = dist2[i];
      if (v >= 4 && v >= dist2[i - 1] && v >= dist2[i + 1] && v >= dist2[i - w] && v >= dist2[i + w]) vals.push(Math.sqrt(v));
    }
    if (!vals.length) return 2;
    vals.sort((a, b) => a - b);
    return vals[Math.floor(vals.length * 0.97)];
  }

  // ouverture morphologique par un disque de rayon r (supprime les traits fins)
  function openDisk(mask, w, h, r, dist2bg) {
    const d1 = dist2bg || edt(mask.map(v => 1 - v), w, h);
    const core = new Uint8Array(w * h), r2 = r * r;
    for (let i = 0; i < core.length; i++) core[i] = (mask[i] && d1[i] > r2) ? 1 : 0;
    const d2 = edt(core, w, h);
    const out = new Uint8Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = (mask[i] && d2[i] <= r2 + 1) ? 1 : 0;
    return out;
  }

  // ---------- Squelettisation Zhang-Suen ----------
  function thin(mask, w, h) {
    const m = mask.slice();
    for (let x = 0; x < w; x++) { m[x] = 0; m[(h - 1) * w + x] = 0; }
    for (let y = 0; y < h; y++) { m[y * w] = 0; m[y * w + w - 1] = 0; }
    let list = [];
    for (let i = 0; i < m.length; i++) if (m[i]) list.push(i);
    let changed = true;
    while (changed) {
      changed = false;
      for (let step = 0; step < 2; step++) {
        const del = [];
        for (const i of list) {
          if (!m[i]) continue;
          const p2 = m[i - w], p3 = m[i - w + 1], p4 = m[i + 1], p5 = m[i + w + 1],
                p6 = m[i + w], p7 = m[i + w - 1], p8 = m[i - 1], p9 = m[i - w - 1];
          const B = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9;
          if (B < 2 || B > 6) continue;
          const A = (!p2 && p3) + (!p3 && p4) + (!p4 && p5) + (!p5 && p6) + (!p6 && p7) + (!p7 && p8) + (!p8 && p9) + (!p9 && p2);
          if (A !== 1) continue;
          if (step === 0) { if (p2 * p4 * p6 || p4 * p6 * p8) continue; }
          else { if (p2 * p4 * p8 || p2 * p6 * p8) continue; }
          del.push(i);
        }
        if (del.length) { changed = true; for (const i of del) m[i] = 0; }
      }
      list = list.filter(i => m[i]);
    }
    return m;
  }

  // ---------- Composantes du squelette → chemin le plus long de chacune ----------
  function skeletonPaths(sk, w, h) {
    const seen = new Uint8Array(w * h), paths = [];
    const nb = [-w - 1, -w, -w + 1, -1, 1, w - 1, w, w + 1];
    const bfs = (start, comp) => {
      const dist = new Map([[start, 0]]), par = new Map([[start, -1]]);
      const q = [start]; let far = start;
      for (let qi = 0; qi < q.length; qi++) {
        const c = q[qi];
        for (const o of nb) {
          const n = c + o;
          if (sk[n] && comp.has(n) && !dist.has(n)) { dist.set(n, dist.get(c) + 1); par.set(n, c); q.push(n); if (dist.get(n) > dist.get(far)) far = n; }
        }
      }
      return { far, par };
    };
    for (let i = 0; i < sk.length; i++) {
      if (!sk[i] || seen[i]) continue;
      const comp = new Set([i]); const q = [i]; seen[i] = 1;
      for (let qi = 0; qi < q.length; qi++) for (const o of nb) { const n = q[qi] + o; if (sk[n] && !seen[n]) { seen[n] = 1; comp.add(n); q.push(n); } }
      if (comp.size < 3) continue;
      const a = bfs(i, comp).far, r = bfs(a, comp);
      const path = []; for (let c = r.far; c !== -1; c = r.par.get(c)) path.push([c % w, (c / w) | 0]);
      let sx = 0, sy = 0; for (const c of comp) { sx += c % w; sy += (c / w) | 0; }
      path.c = [sx / comp.size, sy / comp.size];
      paths.push(path);
    }
    return paths;
  }

  const plen = p => { let s = 0; for (let i = 1; i < p.length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
  const dst = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  // ---------- Enchaînement des morceaux ----------
  function chainFrom(segs, first, reversed, maxGap) {
    const used = new Set([first]);
    let route = reversed ? segs[first].slice().reverse() : segs[first].slice();
    let total = plen(route);
    while (true) {
      const end = route[route.length - 1];
      let best = null;
      segs.forEach((s, i) => {
        if (used.has(i)) return;
        const d0 = dst(s[0], end), d1 = dst(s[s.length - 1], end);
        const c = d0 <= d1 ? { d: d0, i, rev: false } : { d: d1, i, rev: true };
        if (!best || c.d < best.d) best = c;
      });
      if (!best || best.d > maxGap) break;
      used.add(best.i);
      const s = best.rev ? segs[best.i].slice().reverse() : segs[best.i];
      route = route.concat(s); total += plen(s);
    }
    return { route, total, used };
  }

  function chain(segs, maxGap, startPt) {
    if (!segs.length) return { route: [], used: new Set() };
    if (startPt) {
      let b = null;
      segs.forEach((s, i) => {
        const d0 = dst(s[0], startPt), d1 = dst(s[s.length - 1], startPt);
        if (!b || Math.min(d0, d1) < b.d) b = { d: Math.min(d0, d1), i, rev: d1 < d0 };
      });
      return chainFrom(segs, b.i, b.rev, maxGap);
    }
    let best = null;
    segs.forEach((s, i) => [false, true].forEach(rev => {
      const c = chainFrom(segs, i, rev, maxGap);
      if (!best || c.total > best.total + 1e-6) best = c;
    }));
    return best;
  }

  // ---------- Simplification Douglas-Peucker ----------
  function simplify(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const f0 = pts[0], l0 = pts[pts.length - 1];
    if (pts.length > 3 && f0[0] === l0[0] && f0[1] === l0[1]) {   // boucle fermée : on coupe au point le plus éloigné
      let mi = 1, md = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - f0[0], pts[i][1] - f0[1]); if (d > md) { md = d; mi = i; } }
      return simplify(pts.slice(0, mi + 1), eps).concat(simplify(pts.slice(mi), eps).slice(1));
    }
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); let md = -1, mi = -1;
      const [x1, y1] = pts[a], [x2, y2] = pts[b], L = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
      for (let i = a + 1; i < b; i++) {
        const d = Math.abs((x2 - x1) * (y1 - pts[i][1]) - (x1 - pts[i][0]) * (y2 - y1)) / L;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  }

  // ---------- Pipeline : 1) préparation (masque → squelette), 2) assemblage ----------
  function prepare(rgba, w, h, o) {
    const mask = colorMask(rgba, w, h, o.rgb, o.tol);
    for (const r of (o.exclude || [])) {
      const x0 = Math.max(0, Math.floor(Math.min(r[0], r[2]))), x1 = Math.min(w - 1, Math.ceil(Math.max(r[0], r[2])));
      const y0 = Math.max(0, Math.floor(Math.min(r[1], r[3]))), y1 = Math.min(h - 1, Math.ceil(Math.max(r[1], r[3])));
      for (let y = y0; y <= y1; y++) mask.fill(0, y * w + x0, y * w + x1 + 1);
    }
    const inv = new Uint8Array(w * h); for (let i = 0; i < inv.length; i++) inv[i] = 1 - mask[i];
    const d2 = edt(inv, w, h);
    const half = estimateHalfWidth(mask, w, h, d2);
    const radius = o.radius || Math.max(1, half * 0.6);
    const opened = openDisk(mask, w, h, radius, d2);
    const all = skeletonPaths(thin(opened, w, h), w, h);
    return { w, h, half, radius, lineW: 2 * half, opened, all };
  }

  function assemble(prep, o = {}) {
    const { all, lineW } = prep;
    const minLen = o.minLen || Math.max(8, 4 * lineW);
    const maxGap = o.maxGap || Math.max(30, 25 * lineW);
    const segs = all.filter(p => plen(p) >= minLen);
    const ch = chain(segs, maxGap, o.startPt);
    let full = ch.route;
    // petits éléments (cercles départ/arrivée) juste au bout du tracé : on y ajoute leur centre
    if (full.length) {
      const small = all.filter(p => plen(p) < minLen && p.length >= 3);
      const near = (pt) => { let b = null; for (const p of small) { const d = Math.min(...p.map(q => dst(q, pt))); if (d < 5 * lineW && (!b || d < b.d)) b = { d, c: p.c }; } return b; };
      const a = near(full[0]), z = near(full[full.length - 1]);
      if (a) full = [a.c, ...full];
      if (z) full = [...full, z.c];
    }
    // boucle (les deux bouts se touchent, souvent cachés par un numéro) : on la ferme
    if (full.length > 20 && o.closeLoop !== false) {
      const gap = dst(full[0], full[full.length - 1]);
      if (gap > 2 * lineW && gap <= maxGap * 0.6 && plen(full) > 6 * gap) full = [...full, full[0]];
    }
    if (o.reverse) full = full.slice().reverse();
    const route = simplify(full, o.eps || 0.7);
    return { route, minLen, maxGap, nSegs: segs.length, nUsed: ch.used.size };
  }

  function extractRoute(rgba, w, h, o) {
    const p = prepare(rgba, w, h, o);
    return Object.assign(assemble(p, o), { half: p.half, radius: p.radius, opened: p.opened });
  }

  // ---------- Réduction (moyenne par blocs) pour les analyses rapides ----------
  function downscale(rgba, w, h, maxSide) {
    const k = Math.min(1, maxSide / Math.max(w, h));
    if (k >= 1) return { rgba, w, h, k: 1 };
    const nw = Math.max(1, Math.round(w * k)), nh = Math.max(1, Math.round(h * k));
    const acc = new Float32Array(nw * nh * 4), cnt = new Uint32Array(nw * nh);
    for (let y = 0; y < h; y++) {
      const dy = Math.min(nh - 1, (y * nh / h) | 0);
      for (let x = 0; x < w; x++) {
        const di = dy * nw + Math.min(nw - 1, (x * nw / w) | 0), j = (y * w + x) * 4;
        acc[di * 4] += rgba[j]; acc[di * 4 + 1] += rgba[j + 1]; acc[di * 4 + 2] += rgba[j + 2]; cnt[di]++;
      }
    }
    const out = new Uint8ClampedArray(nw * nh * 4);
    for (let i = 0; i < cnt.length; i++) { const c = cnt[i] || 1; out[i * 4] = acc[i * 4] / c; out[i * 4 + 1] = acc[i * 4 + 1] / c; out[i * 4 + 2] = acc[i * 4 + 2] / c; out[i * 4 + 3] = 255; }
    return { rgba: out, w: nw, h: nh, k: nw / w };
  }

  // ---------- Couleur du tracé : on essaie les couleurs vives dominantes, on garde celle qui donne le plus long tracé ----------
  function autoColor(rgba, w, h) {
    const d = downscale(rgba, w, h, 1600);
    const bins = new Map();
    for (let i = 0, j = 0; i < d.w * d.h; i++, j += 4) {
      const r = d.rgba[j], g = d.rgba[j + 1], b = d.rgba[j + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if (mx < 90 || (mx - mn) / mx < 0.55) continue;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let e = bins.get(key); if (!e) { e = [0, 0, 0, 0]; bins.set(key, e); }
      e[0]++; e[1] += r; e[2] += g; e[3] += b;
    }
    const cand = [];
    for (const e of [...bins.values()].sort((a, b) => b[0] - a[0])) {
      if (e[0] < 30) break;
      const c = [e[1] / e[0], e[2] / e[0], e[3] / e[0]];
      if (cand.some(o => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 70)) continue;
      cand.push(c); if (cand.length >= 6) break;
    }
    let best = null; const tested = [];
    for (const rgb of cand) {
      const prep = prepare(d.rgba, d.w, d.h, { rgb, tol: 55 });
      const a = assemble(prep, {});
      const score = plen(a.route) / Math.max(d.w, d.h);   // longueur du tracé chaîné, en largeurs d'image
      tested.push({ rgb: rgb.map(Math.round), score });
      if (!best || score > best.score) best = { rgb: rgb.map(Math.round), tol: 55, score };
    }
    return best ? Object.assign(best, { tested }) : null;
  }

  // ---------- Barre d'échelle (capture d'appli) : longue ligne sombre fine avec traits aux extrémités ----------
  function detectScaleBar(rgba, w, h) {
    const dark = (x, y) => { const j = (y * w + x) * 4; return rgba[j] < 95 && rgba[j + 1] < 95 && rgba[j + 2] < 95; };
    const zones = [[0, Math.round(h * 0.18)], [Math.round(h * 0.82), h]];
    let best = null;
    for (const [y0, y1] of zones) for (let y = y0; y < y1; y++) {
      let x = 0;
      while (x < w * 0.7) {
        if (!dark(x, y)) { x++; continue; }
        let x2 = x; while (x2 < w && dark(x2, y)) x2++;
        const len = x2 - x;
        if (len >= Math.max(40, w * 0.08) && len <= w * 0.6) {
          // trait fin (≤ 4 px d'épaisseur) et traits verticaux aux deux extrémités
          let th = 1; while (y + th < h && th < 8 && dark(x + (len >> 1), y + th)) th++;
          const tick = (xx) => { let n = 0; for (let k = 1; k <= 8; k++) { if (y - k >= 0 && dark(xx, y - k)) n++; } for (let k = 1; k <= 8; k++) { if (y + th + k < h && dark(xx, y + th + k)) n++; } return n; };
          const t1 = tick(x + 1), t2 = tick(x2 - 2);
          if (th <= 4 && t1 >= 3 && t2 >= 3 && (!best || len > best.len)) best = { x1: x, x2: x2 - 1, y: y + th / 2, len };
        }
        x = x2 + 1;
      }
    }
    return best;
  }

  // ---------- Détection de la grille kilométrique (lignes grises) ----------
  function detectGrid(rgba, w, h) {
    const rows = new Float64Array(h), cols = new Float64Array(w);
    for (let y = 0, j = 0; y < h; y++) for (let x = 0; x < w; x++, j += 4) {
      const r = rgba[j], g = rgba[j + 1], b = rgba[j + 2];
      if (Math.abs(r - g) < 14 && Math.abs(g - b) < 14 && r > 95 && r < 180) { rows[y]++; cols[x]++; }
    }
    const lines = (prof, len) => {
      const sorted = Array.from(prof).sort((a, b) => a - b), med = sorted[sorted.length >> 1];
      const thr = Math.max(0.16 * len, 4 * med);
      const cand = [];
      for (let i = 0; i < prof.length; i++) {
        if (prof[i] <= thr) continue;
        let j = i, sw = 0, s = 0;
        while (j < prof.length && prof[j] > thr * 0.5) { sw += prof[j]; s += prof[j] * j; j++; }
        cand.push(s / sw); i = j;
      }
      if (cand.length < 2) return null;
      let best = null;
      for (let a = 0; a < cand.length; a++) for (let b = a + 1; b < cand.length; b++) {
        const d = cand[b] - cand[a]; if (d < 40) continue;
        const fit = cand.filter(c => { const k = (c - cand[a]) / d; return Math.abs(k - Math.round(k)) * d < Math.max(2, 0.012 * d); });
        if (fit.length >= 2 && (!best || fit.length > best.fit.length || (fit.length === best.fit.length && d < best.d))) best = { d, fit };
      }
      if (!best) return null;
      // affine la période par moindres carrés sur les indices entiers
      const p0 = best.fit[0], ks = best.fit.map(c => Math.round((c - p0) / best.d));
      const n = ks.length, mk = ks.reduce((a, b) => a + b) / n, mc = best.fit.reduce((a, b) => a + b) / n;
      let num = 0, den = 0; ks.forEach((k, i) => { num += (k - mk) * (best.fit[i] - mc); den += (k - mk) ** 2; });
      const period = den ? num / den : best.d;
      return { lines: best.fit, period };
    };
    return { x: lines(cols, h), y: lines(rows, w) };
  }

  return { extractJpegsFromPdf, colorMask, edt, openDisk, thin, skeletonPaths, chain, simplify, prepare, assemble, extractRoute, downscale, autoColor, detectScaleBar, detectGrid, plen };
})();

// ===== Géodésie =====
const Geo = (() => {
  function wgs2lv95(lat, lon) {
    const p = (lat * 3600 - 169028.66) / 10000, l = (lon * 3600 - 26782.5) / 10000;
    return [2600072.37 + 211455.93 * l - 10938.51 * l * p - 0.36 * l * p * p - 44.54 * l ** 3,
            1200147.07 + 308807.95 * p + 3745.25 * l * l + 76.63 * p * p - 194.56 * l * l * p + 119.79 * p ** 3];
  }
  function lv952wgs(E, N) {
    const y = (E - 2600000) / 1e6, x = (N - 1200000) / 1e6;
    const l = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y ** 3;
    const p = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x ** 3;
    return [p * 100 / 36, l * 100 / 36];
  }
  const R = 6378137;
  const wgs2merc = (lat, lon) => [R * lon * Math.PI / 180, R * Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))];
  const merc2wgs = (x, y) => [(2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180 / Math.PI, x / R * 180 / Math.PI];
  const inCH = (lat, lon) => lat > 45.7 && lat < 47.9 && lon > 5.8 && lon < 10.6;
  const hav = (a, b) => {
    const r = 6371008.8, t = Math.PI / 180, dla = (b[0] - a[0]) * t, dlo = (b[1] - a[1]) * t;
    const s = Math.sin(dla / 2) ** 2 + Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dlo / 2) ** 2;
    return 2 * r * Math.asin(Math.sqrt(s));
  };

  // lecture souple de coordonnées : WGS84 décimal ou DMS, LV95, LV03
  function parseCoord(txt) {
    if (!txt) return null;
    let t = txt.trim();
    if (/[°]/.test(t)) {
      const parts = [...t.matchAll(/(-?\d+(?:[.,]\d+)?)\s*°\s*(?:(\d+(?:[.,]\d+)?)\s*['′’]\s*)?(?:(\d+(?:[.,]\d+)?)\s*(?:["″”]|''))?\s*([NSEWO])?/gi)];
      if (parts.length >= 2) {
        const v = parts.slice(0, 2).map(m => {
          let d = Math.abs(parseFloat(m[1].replace(',', '.'))) + (m[2] ? parseFloat(m[2].replace(',', '.')) / 60 : 0) + (m[3] ? parseFloat(m[3].replace(',', '.')) / 3600 : 0);
          if (m[1].startsWith('-') || /[SW]/i.test(m[4] || '')) d = -d;
          return { d, h: (m[4] || '').toUpperCase() };
        });
        let lat = v[0].d, lon = v[1].d;
        if (/[EWO]/.test(v[0].h) || /[NS]/.test(v[1].h)) [lat, lon] = [lon, lat];
        return { lat, lon };
      }
    }
    const cd = t.match(/^\s*(-?\d+,\d+)\s*[;\s]\s*(-?\d+,\d+)\s*$/);
    if (cd) t = cd[1].replace(',', '.') + ' ' + cd[2].replace(',', '.');
    t = t.replace(/(\d)['’ ](?=\d{3}\b)/g, '$1');
    const nums = (t.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (nums.length < 2) {
      const c = (t.match(/-?\d+,\d+/g) || []).map(s => Number(s.replace(',', '.')));
      if (c.length >= 2) nums.splice(0, nums.length, ...c); else return null;
    }
    let [a, b] = nums;
    if (Math.abs(a) > 1000 && Math.abs(b) > 1000) {
      let E = Math.max(a, b), N = Math.min(a, b);
      if (E < 1e6) { E += 2e6; N += 1e6; }
      const [lat, lon] = lv952wgs(E, N);
      return { lat, lon };
    }
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) {
      if (inCH(b, a) && !inCH(a, b)) [a, b] = [b, a];
      return { lat: a, lon: b };
    }
    return null;
  }

  return { wgs2lv95, lv952wgs, wgs2merc, merc2wgs, inCH, hav, parseCoord };
})();

// ===== Ajustement pixel → coordonnées =====
const Fit = (() => {
  function solve(A, b) { // moindres carrés via équations normales
    const n = A[0].length, M = Array.from({ length: n }, () => new Float64Array(n + 1));
    A.forEach((row, k) => { for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) M[i][j] += row[i] * row[j]; M[i][n] += row[i] * b[k]; } });
    for (let c = 0; c < n; c++) {
      let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (Math.abs(M[c][c]) < 1e-12) return null;
      for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map((r, i) => r[n] / r[i]);
  }
  // similarité avec axe y image inversé : E = a x + b y + tx ; N = b x − a y + ty
  function similarity(pts) {
    const A2 = [], b2 = [];
    pts.forEach(p => { A2.push([p.px, p.py, 1, 0]); b2.push(p.E); A2.push([-p.py, p.px, 0, 1]); b2.push(p.N); });
    const s = solve(A2, b2); if (!s) return null;
    const [a, bb, tx, ty] = s;
    return (x, y) => [a * x + bb * y + tx, bb * x - a * y + ty];
  }
  function affine(pts) {
    const A = pts.map(p => [p.px, p.py, 1]);
    const e = solve(A, pts.map(p => p.E)), n = solve(A, pts.map(p => p.N));
    if (!e || !n) return null;
    return (x, y) => [e[0] * x + e[1] * y + e[2], n[0] * x + n[1] * y + n[2]];
  }
  const STD = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000];
  // calage sur la grille : lignes verticales = E constants, horizontales = N constants
  function gridSnap(approx, grid, spacing, W, H) {
    const ym = H / 2, xm = W / 2;
    const ex = grid.x.lines.map(x => [x, approx(x, ym)[0]]);
    const ny = grid.y.lines.map(y => [y, approx(xm, y)[1]]);
    if (!spacing) {
      const est = Math.abs(approx(grid.x.period, ym)[0] - approx(0, ym)[0]);
      spacing = STD.reduce((a, b) => Math.abs(Math.log(b / est)) < Math.abs(Math.log(a / est)) ? b : a);
    }
    let maxOff = 0;
    const lin = (arr) => {
      const v = arr.map(([p, c]) => { const r = Math.round(c / spacing) * spacing; maxOff = Math.max(maxOff, Math.abs(r - c)); return [p, r]; });
      const n = v.length, mp = v.reduce((s, a) => s + a[0], 0) / n, mc = v.reduce((s, a) => s + a[1], 0) / n;
      let num = 0, den = 0; v.forEach(([p, c]) => { num += (p - mp) * (c - mc); den += (p - mp) ** 2; });
      const k = num / den; return [k, mc - k * mp];
    };
    const [kx, bx] = lin(ex), [ky, by] = lin(ny);
    return { f: (x, y) => [kx * x + bx, ky * y + by], spacing, maxOff, mPerPx: (Math.abs(kx) + Math.abs(ky)) / 2 };
  }
  return { similarity, affine, gridSnap, STD };
})();

// ===== GPX =====
function buildGpx({ name, desc, stages, waypoints }) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pt = (tag, p, inner = '') => `<${tag} lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}">${p.ele != null ? `<ele>${p.ele.toFixed(1)}</ele>` : ''}${inner}</${tag}>`;
  const w = waypoints.map(p => '  ' + pt('wpt', p, `<name>${esc(p.name)}</name>`)).join('\n');
  const t = stages.map(s => `  <trk>\n    <name>${esc(s.name)}</name>\n    <type>hiking</type>\n    <trkseg>\n${s.points.map(p => '      ' + pt('trkpt', p)).join('\n')}\n    </trkseg>\n  </trk>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Carte vers GPX" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata>\n    <name>${esc(name)}</name>\n    <desc>${esc(desc)}</desc>\n  </metadata>\n${w}\n${t}\n</gpx>\n`;
}

if (typeof module !== 'undefined') module.exports = { Core, Geo, Fit, buildGpx };
