// --- Renverses du courant à Lola (bac Indret / Basse-Indre) : équation date + marée de Nantes + débit mensuel ------------------
// Équation (minutes après l'étale de Nantes, +20 min de correction mesurée sur le bac ; Q = débit mensuel moyen à Montjean en m³/s, C = coefficient de marée) :
//   début du flot   = basse mer Nantes + 30,2 − 0,0241·Q + 0,164·C
//   début du jusant = pleine mer Nantes + 34,3 + 0,0136·Q − 0,096·C
// Q vient de la date seule (QmM interannuels 1863-2026, Hydroportail M5300010) ; valable pour Q de 200 à 1 600 m³/s.
// Calée sur 12 renverses mesurées à petits débits (13→19/11/2026, Q 200–310) : le terme en C n'améliore pas l'ajustement mesuré, gros débits jamais mesurés.
const Q_MENSUEL = [1450, 1540, 1360, 1090, 846, 583, 356, 246, 260, 412, 775, 1160]; // janvier → décembre
const debitDuMois = (t) => Q_MENSUEL[new Date(t).getUTCMonth()];
const lagRenverse = (type, Q, C) => type === 'flot' ? 30.2 - 0.0241 * Q + 0.164 * C : 34.3 + 0.0136 * Q - 0.096 * C;
const incertitude = (Q) => (Q <= 1000 ? 20 : 30); // ± min : mesuré (≈ 12 min d'écart moyen, 29 max) à petits débits, élargi sinon
const AVANT_MIN = 90;       // le changement à venir est annoncé 90 min avant
const APRES_MIN = 45;       // et rappelé 45 min après (courant encore faible)
let cache = null;
// Renverses [{t, type:'flot'|'jusant' (courant qui commence), coef, Q, incert (± min)}] autour de now, recalculées au plus une fois par heure.
function renverses(now) {
  const h = Math.floor(now / HOUR);
  if (!cache || cache.h !== h) {
    const r = calculSite('nantes', STATIONS, now - 14 * HOUR, now + 40 * HOUR, 260); // le débit n'intervient que dans les tables, ignorées ici
    const liste = r.marees.map((m) => {
      const type = m.type === 'PM' ? 'jusant' : 'flot', Q = debitDuMois(m.t), C = Math.round(m.coef);
      return { t: m.t + lagRenverse(type, Q, m.coef) * MIN, type, coef: C, Q, incert: incertitude(Q) };
    });
    cache = { h, liste: liste.sort((a, b) => a.t - b.t) };
  }
  return cache.liste;
}
// État du courant à l'instant now : sens actuel, renverse précédente et suivante, phase d'anticipation.
// phase : 'en_cours' (dans la fenêtre ± incertitude d'une renverse), 'avant', 'apres', 'calme'.
function etatCourant(now) {
  const L = renverses(now);
  const prev = [...L].reverse().find((r) => r.t <= now), next = L.find((r) => r.t > now);
  if (!prev || !next) return null;
  let phase = 'calme', ref = next;
  if (next.t - now <= next.incert * MIN) phase = 'en_cours';
  else if (now - prev.t <= prev.incert * MIN) { phase = 'en_cours'; ref = prev; }
  else if (next.t - now <= AVANT_MIN * MIN) phase = 'avant';
  else if (now - prev.t <= APRES_MIN * MIN) { phase = 'apres'; ref = prev; }
  return { sens: prev.type, prev, next, phase, ref };
}
// Renverse dont la fenêtre ± incertitude contient l'instant t (null sinon).
function renverseProche(t, now) { return renverses(now).find((r) => Math.abs(r.t - t) <= r.incert * MIN) || null; }
// Sens du courant (flot | jusant) à l'instant t, vu depuis now ; null hors de la fenêtre calculée.
function sensA(t, now) { const p = [...renverses(now)].reverse().find((r) => r.t <= t); return p && renverses(now).some((r) => r.t > t) ? p.type : null; }
return { etatCourant, renverseProche, renverses, sensA, lagRenverse, debitDuMois };
