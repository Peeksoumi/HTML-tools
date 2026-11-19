// --- Renverses du courant à Lola (bac Indret / Basse-Indre) : prévision par la date -------------------
// Règle simple : renverse = pleine mer / basse mer calculée à Lola (marée harmonique de courant-loire/src/core.js) + RETARD_MIN.
// Pleine mer → début du jusant ; basse mer → début du flot. Les tables du Port (débit, coefficient) ne sont pas utilisées.
const RETARD_MIN = 46;      // médiane de l'écart entre 12 renverses mesurées (trajectoire du bac, 13→19/11/2026, coef 32–69) et la marée calculée à Lola
const INCERTITUDE_MIN = 20; // ± min : erreur moyenne ≈ 15 min (validation en laissant une mesure de côté), pire cas 51 min
const AVANT_MIN = 90;       // le changement à venir est annoncé 90 min avant
const APRES_MIN = 45;       // et rappelé 45 min après (courant encore faible)
let cache = null;
// Renverses [{t, type:'flot'|'jusant' (courant qui commence), coef}] autour de now, recalculées au plus une fois par heure.
function renverses(now) {
  const h = Math.floor(now / HOUR);
  if (!cache || cache.h !== h) {
    const r = calculSite('lola', STATIONS, now - 14 * HOUR, now + 40 * HOUR, 260); // le débit n'intervient que dans les tables, ignorées ici
    const liste = r.marees.map((m) => ({ t: m.t + RETARD_MIN * MIN, type: m.type === 'PM' ? 'jusant' : 'flot', coef: Math.round(m.coef) }));
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
return { etatCourant, renverseProche, renverses, INCERTITUDE_MIN, RETARD_MIN };
