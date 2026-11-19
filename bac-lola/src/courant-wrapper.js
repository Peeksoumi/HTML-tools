// --- Renverses du courant à Lola (bac Indret / Basse-Indre) : prévision par la date -------------------
// Moteur : marée harmonique + tables du Port de courant-loire/src/core.js (calculSite), puis correction mesurée sur le bac.
const DEBIT_M3S = 260;      // débit supposé de la Loire à Montjean (200 à 310 m³/s mesurés du 17 au 19/11/2026)
const CORRECTION_MIN = 20;  // renverse observée (trajectoire du bac) − renverse des tables : médiane de 12 renverses (13→19/11/2026, coef 32–69)
const INCERTITUDE_MIN = 20; // ± min : erreur moyenne ≈ 15 min après correction (validation en laissant une mesure de côté)
const AVANT_MIN = 90;       // le changement à venir est annoncé 90 min avant
const APRES_MIN = 45;       // et rappelé 45 min après (courant encore faible)
let cache = null;
// Renverses [{t, type:'flot'|'jusant' (courant qui commence), coef}] autour de now, recalculées au plus une fois par heure.
function renverses(now) {
  const h = Math.floor(now / HOUR);
  if (!cache || cache.h !== h) {
    const r = calculSite('lola', STATIONS, now - 14 * HOUR, now + 40 * HOUR, DEBIT_M3S);
    const liste = r.renverses.filter((x) => !x.absent).map((x) => ({ t: x.t + CORRECTION_MIN * MIN, type: x.type, coef: Math.round(x.coef) }));
    cache = { h, liste: liste.sort((a, b) => a.t - b.t) };
  }
  return cache.liste;
}
// État du courant à l'instant now : sens actuel, renverse précédente et suivante, phase d'anticipation.
// phase : 'en_cours' (dans la fenêtre ± incertitude d'une renverse), 'avant', 'apres', 'calme'.
function etatCourant(now) {
  const L = renverses(now), U = INCERTITUDE_MIN * MIN;
  const prev = [...L].reverse().find((r) => r.t <= now), next = L.find((r) => r.t > now);
  if (!prev || !next) return null;
  let phase = 'calme', ref = next;
  if (next.t - now <= U) phase = 'en_cours';
  else if (now - prev.t <= U) { phase = 'en_cours'; ref = prev; }
  else if (next.t - now <= AVANT_MIN * MIN) phase = 'avant';
  else if (now - prev.t <= APRES_MIN * MIN) { phase = 'apres'; ref = prev; }
  return { sens: prev.type, prev, next, phase, ref, u: U };
}
// Renverse dont la fenêtre ± incertitude contient l'instant t (null sinon).
function renverseProche(t, now) { return renverses(now).find((r) => Math.abs(r.t - t) <= INCERTITUDE_MIN * MIN) || null; }
return { etatCourant, renverseProche, renverses, INCERTITUDE_MIN, CORRECTION_MIN, DEBIT_M3S };
