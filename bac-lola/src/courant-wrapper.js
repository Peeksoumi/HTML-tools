// --- Renverses du courant à Lola (bac Indret / Basse-Indre) : prévision par la DATE seule ------------------
// Règle : renverse = pleine mer / basse mer calculée à Lola (marée harmonique, courant-loire/src/core.js) + retard(régime de débit, sens).
// Pleine mer → début du jusant ; basse mer → début du flot. Le régime de débit est déduit du mois (climatologie de la Loire à Montjean,
// QmM interannuels 1863-2026, Hydroportail M5300010 : juin–novembre 246 à 775 m³/s, décembre–mai 846 à 1 540 m³/s).
// Retards = retard des tables du Port au débit moyen du régime (flot / jusant) + 20 min mesurés sur le bac à petits débits.
const REGIMES = {
  petits: { nom: 'petits débits (juin → novembre)', flot: 48, jusant: 48, incert: 20 }, // mesuré : 12 renverses, 13→19/11/2026 (débit 200–310 m³/s)
  gros: { nom: 'gros débits (décembre → mai)', flot: 28, jusant: 58, incert: 30 },       // tables du Port + 20 min, jamais mesuré : incertitude élargie
};
const AVANT_MIN = 90;       // le changement à venir est annoncé 90 min avant
const APRES_MIN = 45;       // et rappelé 45 min après (courant encore faible)
const regimeDuMois = (t) => { const mo = new Date(t).getUTCMonth() + 1; return mo >= 6 && mo <= 11 ? 'petits' : 'gros'; };
let cache = null;
// Renverses [{t, type:'flot'|'jusant' (courant qui commence), coef, regime, incert (± min)}] autour de now, recalculées au plus une fois par heure.
function renverses(now) {
  const h = Math.floor(now / HOUR);
  if (!cache || cache.h !== h) {
    const r = calculSite('lola', STATIONS, now - 14 * HOUR, now + 40 * HOUR, 260); // le débit n'intervient que dans les tables, ignorées ici
    const liste = r.marees.map((m) => {
      const type = m.type === 'PM' ? 'jusant' : 'flot', rg = regimeDuMois(m.t), R = REGIMES[rg];
      return { t: m.t + R[type] * MIN, type, coef: Math.round(m.coef), regime: rg, incert: R.incert };
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
  return { sens: prev.type, prev, next, phase, ref, regime: REGIMES[ref.regime] };
}
// Renverse dont la fenêtre ± incertitude contient l'instant t (null sinon).
function renverseProche(t, now) { return renverses(now).find((r) => Math.abs(r.t - t) <= r.incert * MIN) || null; }
return { etatCourant, renverseProche, renverses, REGIMES };
