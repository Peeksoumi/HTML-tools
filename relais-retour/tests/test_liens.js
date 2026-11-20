// Tests de relais-retour/index.html : node relais-retour/tests/test_liens.js
const fs = require('fs'), path = require('path'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Bloc JSON : source unique lue aussi par le contrôleur du serveur (private/relais_liens/check_liens.py)
const bloc = html.match(/<script type="application\/json" id="liens">([\s\S]*?)<\/script>/);
assert.ok(bloc, 'bloc JSON des liens absent');
const reseaux = JSON.parse(bloc[1]);
assert.ok(reseaux.length >= 7);
const ids = new Set();
for (const r of reseaux) {
  assert.ok(r.id && r.nom && /^#[0-9a-f]{6}$/i.test(r.couleur) && r.desc, 'réseau incomplet : ' + r.id);
  assert.ok(r.liens.length >= 1, 'réseau sans lien : ' + r.id);
  for (const l of r.liens) {
    assert.ok(l.id && l.libelle, 'lien incomplet dans ' + r.id);
    assert.ok(!ids.has(l.id), 'id en double : ' + l.id); ids.add(l.id);
    const u = new URL(l.url);
    assert.strictEqual(u.protocol, 'https:', 'lien non https : ' + l.id);
    assert.ok(!l.lieu || ['mondial', 'pickup'].includes(l.lieu), 'lieu inconnu : ' + l.id);
  }
}

// Pré-remplissage du lieu (fonction de la page, exécutée seule)
const src = html.match(/function urlLien[\s\S]*?\n}\n/)[0];
const urlLien = new Function('URL', src + '; return urlLien;')(URL);
const mondial = reseaux[0].liens[0], pickup = reseaux.find(r => r.id === 'pickup').liens[0], sans = reseaux.find(r => r.id === 'ups').liens[0];
assert.strictEqual(urlLien(mondial, ''), mondial.url, 'sans lieu : URL inchangée');
const m = new URL(urlLien(mondial, '44000 Nantes'));
assert.strictEqual(m.searchParams.get('codePostal'), '44000');
assert.strictEqual(m.searchParams.get('ville'), 'Nantes');
const m2 = new URL(urlLien(mondial, 'Nantes'));
assert.strictEqual(m2.searchParams.get('codePostal'), '');
assert.strictEqual(m2.searchParams.get('ville'), 'Nantes');
const p = new URL(urlLien(pickup, 'Saint-Herblain & co'));
assert.strictEqual(p.searchParams.get('pudo_keyword'), 'Saint-Herblain & co');
assert.strictEqual(urlLien(sans, '44000'), sans.url, 'lien sans pré-remplissage : inchangé');

// Règles du dépôt (CLAUDE.md)
assert.ok((html.match(/HTML-tools\/issues/g) || []).length >= 1, 'lien issues');
assert.strictEqual((html.match(/rel="icon"/g) || []).length, 1, 'favicon');
assert.ok(/download=/.test(html), 'bouton télécharger');
assert.strictEqual((html.match(/id="fonctionnement"/g) || []).length, 1, 'section Fonctionnement et sources');
assert.ok(!/leaflet|overpass|nominatim/i.test(html.replace(/<div class="fonct"[\s\S]*?<\/div>\s*<\/main>/, '')), 'ancienne logique encore présente');
console.log('OK : ' + ids.size + ' liens, ' + reseaux.length + ' réseaux');
