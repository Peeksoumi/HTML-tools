// Moteur de calcul : marée harmonique (REFMAR/TICON-4) + renverses de courant (tables Port de Nantes Saint-Nazaire).
// Aucune dépendance. Les constantes (STATIONS) viennent de stations-data.js, inliné devant ce fichier par build.py.

const D2R = Math.PI / 180;
const MIN = 60000;
const HOUR = 3600000;

// --- Arguments astronomiques (degrés) -----------------------------------
function astro(ms) {
  const d = (ms - Date.UTC(2000, 0, 1, 12)) / 864e5;
  const mod = (x) => ((x % 360) + 360) % 360;
  const utH = (((ms % 864e5) + 864e5) % 864e5) / HOUR;
  return {
    T: mod(15 * utH + 180),
    s: mod(218.3164477 + 13.17639648 * d),
    h: mod(280.4664567 + 0.98564736 * d),
    p: mod(83.3532465 + 0.11140353 * d),
    N: mod(125.0445479 - 0.05295377 * d),
    p1: mod(282.9373 + 0.0000470684 * d),
  };
}

// Corrections nodales (Schureman), N en degrés.
const NODAL = {
  M2: (N) => ({ f: 1 - 0.03731 * Math.cos(N * D2R) + 0.00052 * Math.cos(2 * N * D2R), u: -2.14 * Math.sin(N * D2R) }),
  K1: (N) => ({ f: 1.006 + 0.115 * Math.cos(N * D2R) - 0.0088 * Math.cos(2 * N * D2R), u: -8.86 * Math.sin(N * D2R) + 0.68 * Math.sin(2 * N * D2R) }),
  O1: (N) => ({ f: 1.0089 + 0.1871 * Math.cos(N * D2R) - 0.0147 * Math.cos(2 * N * D2R), u: 10.8 * Math.sin(N * D2R) - 1.34 * Math.sin(2 * N * D2R) }),
  K2: (N) => ({ f: 1.0241 + 0.2863 * Math.cos(N * D2R) + 0.0083 * Math.cos(2 * N * D2R), u: -17.74 * Math.sin(N * D2R) + 0.68 * Math.sin(2 * N * D2R) }),
  MM: (N) => ({ f: 1 - 0.13 * Math.cos(N * D2R), u: 0 }),
  MF: (N) => ({ f: 1.043 + 0.414 * Math.cos(N * D2R), u: -23.74 * Math.sin(N * D2R) }),
};

// nom : [T, s, h, p, p1, décalage°, [[type nodal, puissance], ...]]
const CONSTITUENTS = {
  M2: [2, -2, 2, 0, 0, 0, [['M2', 1]]],
  N2: [2, -3, 2, 1, 0, 0, [['M2', 1]]],
  S2: [2, 0, 0, 0, 0, 0, []],
  K2: [2, 0, 2, 0, 0, 0, [['K2', 1]]],
  '2N2': [2, -4, 2, 2, 0, 0, [['M2', 1]]],
  MU2: [2, -4, 4, 0, 0, 0, [['M2', 1]]],
  NU2: [2, -3, 4, -1, 0, 0, [['M2', 1]]],
  LAMBDA2: [2, -1, 0, 1, 0, 180, [['M2', 1]]],
  L2: [2, -1, 2, -1, 0, 180, [['M2', 1]]],
  T2: [2, 0, -1, 0, 1, 0, []],
  R2: [2, 0, 1, 0, -1, 180, []],
  K1: [1, 0, 1, 0, 0, -90, [['K1', 1]]],
  O1: [1, -2, 1, 0, 0, 90, [['O1', 1]]],
  P1: [1, 0, -1, 0, 0, 90, []],
  Q1: [1, -3, 1, 1, 0, 90, [['O1', 1]]],
  S1: [1, 0, 0, 0, 0, 0, []],
  M3: [3, -3, 3, 0, 0, 0, [['M2', 1.5]]],
  M4: [4, -4, 4, 0, 0, 0, [['M2', 2]]],
  MS4: [4, -2, 2, 0, 0, 0, [['M2', 1]]],
  MN4: [4, -5, 4, 1, 0, 0, [['M2', 2]]],
  N4: [4, -6, 4, 2, 0, 0, [['M2', 2]]],
  S4: [4, 0, 0, 0, 0, 0, []],
  M6: [6, -6, 6, 0, 0, 0, [['M2', 3]]],
  M8: [8, -8, 8, 0, 0, 0, [['M2', 4]]],
  '2MS6': [6, -4, 4, 0, 0, 0, [['M2', 2]]],
  '2SM2': [2, 2, -2, 0, 0, 0, [['M2', 1]]],
  MKS2: [2, -2, 4, 0, 0, 0, [['M2', 1], ['K2', 1]]],
  MSF: [0, 2, -2, 0, 0, 0, [['M2', 1]]],
  MM: [0, 1, 0, -1, 0, 0, [['MM', 1]]],
  MF: [0, 2, 0, 0, 0, 0, [['MF', 1]]],
  SA: [0, 0, 1, 0, 0, 0, []],
  SSA: [0, 0, 2, 0, 0, 0, []],
  MA2: [2, -2, 1, 0, 0, 0, [['M2', 1]]],
  MB2: [2, -2, 3, 0, 0, 0, [['M2', 1]]],
};

// Une « station » = liste de composantes {A, G, def} ; hauteur = Σ A·f·cos(V + u − G).
function makeStation(constants) {
  const comps = [];
  for (const [name, [A, G]] of Object.entries(constants)) {
    if (CONSTITUENTS[name]) comps.push({ A, G, def: CONSTITUENTS[name] });
  }
  return { comps };
}

// Station fictive située à la fraction w (0..1) du trajet de a vers b (interpolation des amplitudes et phases).
function blendStations(a, b, w) {
  const wrap = (x) => ((x + 540) % 360) - 180;
  const out = {};
  for (const name of Object.keys(a)) {
    if (!b[name]) continue;
    const [A1, G1] = a[name];
    const [A2, G2] = b[name];
    out[name] = [A1 + w * (A2 - A1), (G1 + w * wrap(G2 - G1) + 360) % 360];
  }
  return out;
}

function predict(station, ms) {
  const a = astro(ms);
  const nod = {};
  for (const k of Object.keys(NODAL)) nod[k] = NODAL[k](a.N);
  let h = 0;
  for (const { A, G, def } of station.comps) {
    let f = 1;
    let u = 0;
    for (const [type, mult] of def[6]) {
      f *= Math.pow(nod[type].f, mult);
      u += mult * nod[type].u;
    }
    const V = def[0] * a.T + def[1] * a.s + def[2] * a.h + def[3] * a.p + def[4] * a.p1 + def[5];
    h += A * f * Math.cos((V + u - G) * D2R);
  }
  return h;
}

// Pleines et basses mers entre t0 et t1 : [{t, type:'PM'|'BM', h}], triées.
function extremes(station, t0, t1) {
  const step = 6 * MIN;
  const out = [];
  let hm = predict(station, t0 - step);
  let h0 = predict(station, t0);
  for (let t = t0; t <= t1; t += step) {
    const hp = predict(station, t + step);
    const isMax = h0 > hm && h0 >= hp;
    const isMin = h0 < hm && h0 <= hp;
    if (isMax || isMin) {
      // affinage par sections dorées sur [t - step, t + step]
      let lo = t - step;
      let hi = t + step;
      const sign = isMax ? 1 : -1;
      const g = 0.6180339887;
      let x1 = hi - g * (hi - lo);
      let x2 = lo + g * (hi - lo);
      let f1 = sign * predict(station, x1);
      let f2 = sign * predict(station, x2);
      while (hi - lo > 1000) {
        if (f1 < f2) {
          lo = x1; x1 = x2; f1 = f2;
          x2 = lo + g * (hi - lo); f2 = sign * predict(station, x2);
        } else {
          hi = x2; x2 = x1; f2 = f1;
          x1 = hi - g * (hi - lo); f1 = sign * predict(station, x1);
        }
      }
      const tt = Math.round((lo + hi) / 2);
      out.push({ t: tt, type: isMax ? 'PM' : 'BM', h: predict(station, tt) });
    }
    hm = h0;
    h0 = hp;
  }
  return out;
}

// --- Coefficient de marée (d'après le marnage de Brest) ------------------
// coefficient = 100 × marnage de Brest / 6,10 m ; marnage = PM − moyenne des deux BM voisines.
function coefficientAt(brest, ms) {
  const ex = extremes(brest, ms - 22 * HOUR, ms + 16 * HOUR);
  let best = -1;
  let bestD = Infinity;
  ex.forEach((e, i) => {
    if (e.type !== 'PM' || i === 0 || i === ex.length - 1) return;
    const d = Math.abs(e.t - (ms - 2.5 * HOUR));
    if (d < bestD) { bestD = d; best = i; }
  });
  if (best < 0) return null;
  const range = ex[best].h - (ex[best - 1].h + ex[best + 1].h) / 2;
  return (100 * range) / 6.1;
}

// --- Tables 5 du Port de Nantes Saint-Nazaire (renverses de courant) -----
// Δt en minutes par rapport à l'étale (PM pour le jusant, BM pour le flot) ; v = vitesse max (nœuds).
// Colonnes de débit à Montjean : 200 (étiage), 1000 (moyen), 3000 m³/s (crue). null = « non renseigné ».
const DEBITS = [200, 1000, 3000];
const COEFS = [45, 70, 95];
const TABLE5 = {
  nantes: { // Nantes (Usine Brûlée)
    45: [
      { flot: [20, 40, 1.7], jusant: [20, 30, 1.5] },
      { flot: [0, 0, 1.0], jusant: [20, 30, 2.0] },
      { flot: [null, null, 0.0], jusant: [90, 120, 3.0] },
    ],
    70: [
      { flot: [15, 30, 2.2], jusant: [20, 30, 2.0] },
      { flot: [0, 0, 1.6], jusant: [30, 45, 2.2] },
      { flot: [null, null, 0.0], jusant: [null, null, 3.6] },
    ],
    95: [
      { flot: [40, 60, 2.8], jusant: [15, 30, 2.2] },
      { flot: [0, 20, 2.0], jusant: [30, 45, 2.5] },
      { flot: [null, null, 0.0], jusant: [null, null, 3.6] },
    ],
  },
  cordemais: {
    45: [
      { flot: [30, 50, 2.0], jusant: [20, 40, 2.0] },
      { flot: [30, 45, 1.6], jusant: [20, 50, 2.4] },
      { flot: [-30, -20, 1.0], jusant: [45, 90, 3.0] },
    ],
    70: [
      { flot: [45, 60, 2.6], jusant: [20, 30, 2.4] },
      { flot: [40, 50, 2.4], jusant: [30, 45, 2.4] },
      { flot: [-30, 0, 1.0], jusant: [60, 90, 4.0] },
    ],
    95: [
      { flot: [40, 60, 2.9], jusant: [20, 45, 3.0] },
      { flot: [30, 50, 2.6], jusant: [30, 45, 4.0] },
      { flot: [0, 0, 1.4], jusant: [60, 75, 5.0] },
    ],
  },
};

// Interpolation linéaire sur une grille (bornes tenues constantes). Les valeurs null sont ignorées
// (on garde la dernière valeur connue).
function interp1(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) {
    if (x <= xs[i]) {
      const a = ys[i - 1];
      const b = ys[i];
      if (a == null) return b;
      if (b == null) return a;
      return a + ((b - a) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]);
    }
  }
  return ys[ys.length - 1];
}

// Δt min/max (minutes) et vitesse max (nœuds) d'une renverse ('flot' ou 'jusant') pour un site de la table.
function table5At(site, dir, coef, debit) {
  const lo = [0, 1, 2].map((k) => {
    // pour chaque débit, interpolation en coefficient
    const get = (c, idx) => TABLE5[site][c][k][dir][idx];
    const dmin = interp1(COEFS, COEFS.map((c) => get(c, 0)), coef);
    const dmax = interp1(COEFS, COEFS.map((c) => get(c, 1)), coef);
    const v = interp1(COEFS, COEFS.map((c) => get(c, 2)), coef);
    return [dmin, dmax, v];
  });
  return {
    min: interp1(DEBITS, lo.map((x) => x[0]), debit),
    max: interp1(DEBITS, lo.map((x) => x[1]), debit),
    v: interp1(DEBITS, lo.map((x) => x[2]), debit),
  };
}

// Δt pour un point situé à la fraction wC du trajet Nantes (Usine Brûlée) → Cordemais.
function dtAt(dir, coef, debit, wC) {
  const n = table5At('nantes', dir, coef, debit);
  const c = table5At('cordemais', dir, coef, debit);
  const nOk = n.min != null;
  const cOk = c.min != null;
  const v = (1 - wC) * n.v + wC * c.v;
  let min;
  let max;
  if (nOk && cOk) { min = (1 - wC) * n.min + wC * c.min; max = (1 - wC) * n.max + wC * c.max; }
  else if (nOk) { min = n.min; max = n.max; }
  else if (cOk) { min = c.min; max = c.max; }
  else { min = null; max = null; }
  return { min, max, v };
}

const V_FLOT_MIN = 0.3; // en dessous, on considère qu'il n'y a pas de courant de flot

// Position des sites : fraction du trajet Usine Brûlée → Le Pellerin (constantes de marée)
// et Usine Brûlée → Cordemais (tables de courant).
const SITES = {
  lola: {
    nom: 'Bac Lola (Indret / Basse-Indre)',
    lat: 47.1985, lon: -1.6755,
    marée: { base: ['nantesUB', 'lePellerin'], w: 0.31 },
    wCordemais: 0.15,
  },
  nantes: {
    nom: 'Île de Nantes',
    lat: 47.2042, lon: -1.5743,
    marée: { base: ['nantesSalorges'], w: 0 },
    wCordemais: 0,
  },
};

function siteStation(id, stations) {
  const s = SITES[id].marée;
  if (s.base.length === 1) return makeStation(stations[s.base[0]].c);
  return makeStation(blendStations(stations[s.base[0]].c, stations[s.base[1]].c, s.w));
}

// --- Heures d'étale calées sur les prédictions SHOM ------------------------
// Les constantes harmoniques (observations REFMAR) donnent des PM/BM de Saint-Nazaire à ~10 min des horaires SHOM
// et de Nantes à ~20-30 min. On les recale : heure à Nantes (Chantenay) = heure harmonique de Saint-Nazaire + retard,
// avec retard = a + b·coef + c·tendance du coefficient (régression sur les 58 marées de septembre 2027 publiées par le SHOM
// pour Saint-Nazaire et Nantes-Chantenay, coef ≥ 45 ; erreur résiduelle ≈ 3 min en PM, 7 min en BM).
// Retards en minutes : [constante, par point de coefficient, par point de tendance du coefficient].
const LAG_NANTES = { PM: [53.0822, 0.1351, 0.17], BM: [80.6711, 0.4782, 1.7713] };

// Coefficient du jour et sa tendance (pente par demi-journée) autour d'un instant d'étale de Saint-Nazaire.
function eventFeatures(brest, t) {
  const c = coefficientAt(brest, t - HOUR);
  const c1 = coefficientAt(brest, t + 11 * HOUR);
  const c0 = coefficientAt(brest, t - 13 * HOUR);
  return { c, dc: c != null && c1 != null && c0 != null ? (c1 - c0) / 2 : 0 };
}

function nearest(list, type, t, maxMs) {
  let best = null;
  for (const e of list) {
    if (e.type !== type) continue;
    const d = Math.abs(e.t - t);
    if (d <= maxMs && (!best || d < Math.abs(best.t - t))) best = e;
  }
  return best;
}

// Calcule, pour un site, les marées et renverses entre t0 et t1 (ms UTC).
// Retour : { marees:[{t,type,h,coef,marnage}], renverses:[{t,tMin,tMax,type:'flot'|'jusant',v,absent?}] }
function calculSite(id, stations, t0, t1, debit) {
  const site = SITES[id];
  const st = siteStation(id, stations);
  const ref = makeStation(stations.nantesSalorges.c); // station de référence « Nantes » pour le décalage harmonique
  const sn = makeStation(stations.saintNazaire.c);
  const brest = makeStation(stations.brest.c);
  const exSN = extremes(sn, t0 - 22 * HOUR, t1 + 6 * HOUR);
  const exSite = extremes(st, t0 - 22 * HOUR, t1 + 8 * HOUR);
  const exRef = id === 'nantes' ? exSite : extremes(ref, t0 - 22 * HOUR, t1 + 8 * HOUR);
  const marees = [];
  for (const e of exSN) {
    const { c, dc } = eventFeatures(brest, e.t);
    if (c == null) continue;
    const [a, b, d] = LAG_NANTES[e.type];
    const tNantes = e.t + (a + b * c + d * dc) * MIN;
    // décalage harmonique entre le site et Nantes (identique à 0 pour l'île de Nantes)
    const eSite = nearest(exSite, e.type, tNantes, 3 * HOUR);
    const eRef = nearest(exRef, e.type, tNantes, 3 * HOUR);
    let delta = eSite && eRef ? eSite.t - eRef.t : 0;
    if (Math.abs(delta) > 45 * MIN) delta = 0;
    const t = Math.round(tNantes + delta);
    marees.push({ t, type: e.type, h: eSite ? eSite.h : null, coef: c, neap: c < 45 });
  }
  // marnage = moyenne des écarts de hauteur avec les deux étales voisines (hauteurs harmoniques du site)
  marees.forEach((m, i) => {
    const refs = [marees[i - 1], marees[i + 1]].filter((x) => x && x.h != null);
    m.marnage = m.h != null && refs.length ? refs.reduce((s, r) => s + Math.abs(m.h - r.h), 0) / refs.length : null;
  });
  const renverses = [];
  for (const m of marees) {
    const dir = m.type === 'BM' ? 'flot' : 'jusant';
    const dt = dtAt(dir, m.coef, debit, site.wCordemais);
    if (dir === 'flot' && dt.v < V_FLOT_MIN) {
      renverses.push({ t: m.t, tMin: m.t, tMax: m.t, type: 'flot', v: dt.v, absent: true, coef: m.coef, neap: m.neap });
      continue;
    }
    if (dt.min == null) continue;
    const tMin = m.t + dt.min * MIN;
    const tMax = m.t + dt.max * MIN;
    renverses.push({ t: Math.round((tMin + tMax) / 2), tMin, tMax, type: dir, v: dt.v, coef: m.coef, neap: m.neap });
  }
  return {
    marees: marees.filter((m) => m.t >= t0 - 2 * HOUR && m.t <= t1 + 2 * HOUR),
    renverses: renverses.filter((r) => r.tMax >= t0 && r.tMin <= t1),
    station: st,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { astro, makeStation, blendStations, predict, extremes, coefficientAt, eventFeatures, table5At, dtAt, calculSite, SITES, siteStation, LAG_NANTES, MIN, HOUR };
}
