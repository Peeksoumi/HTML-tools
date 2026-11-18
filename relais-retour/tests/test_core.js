// Tests de la logique pure de relais-retour/index.html : node relais-retour/tests/test_core.js
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const ctx = {}; vm.createContext(ctx);
vm.runInContext(src + '\nthis.api={RESEAUX,reseauDe,typeDe,normaliser,construireRequete,distanceM,parseHoraires,statutHoraires,semaineTexte,lienItineraire,lienFiche};', ctx);
const a = ctx.api;

// Réseaux et types
assert.strictEqual(a.reseauDe({ brand: 'Mondial Relay' }), 'mondial');
assert.strictEqual(a.reseauDe({ name: 'Point Relais Mondial-Relay Tabac' }), 'mondial');
assert.strictEqual(a.reseauDe({ 'post_office:brand': 'Relais Colis' }), 'relaiscolis');
assert.strictEqual(a.reseauDe({ brand: 'Pickup' }), 'pickup');
assert.strictEqual(a.reseauDe({ operator: 'UPS' }), 'ups');
assert.strictEqual(a.reseauDe({ name: 'Groups & Co' }), 'autre', 'ups ne doit pas matcher dans un mot');
assert.strictEqual(a.reseauDe({ amenity: 'post_office' }), 'colissimo');
assert.strictEqual(a.typeDe({ amenity: 'parcel_locker' }), 'locker');
assert.strictEqual(a.typeDe({ amenity: 'post_office' }), 'poste');
assert.strictEqual(a.typeDe({ shop: 'tobacco' }), 'commerce');

// Normalisation : boîtes aux lettres et « autre » sans intérêt écartés, centre des ways utilisé
const pts = a.normaliser([
  { type: 'node', id: 1, lat: 47.2, lon: -1.5, tags: { brand: 'Mondial Relay', name: 'Tabac du Port', 'addr:housenumber': '4', 'addr:street': 'rue X', 'addr:postcode': '44000', 'addr:city': 'Nantes', opening_hours: 'Mo-Sa 09:00-19:00' } },
  { type: 'way', id: 2, center: { lat: 47.21, lon: -1.51 }, tags: { amenity: 'parcel_locker', brand: 'Mondial Relay' } },
  { type: 'node', id: 3, lat: 47.2, lon: -1.5, tags: { amenity: 'post_box', brand: 'La Poste' } },
  { type: 'node', id: 4, lat: 47.2, lon: -1.5, tags: { shop: 'bakery', name: 'Pickup Boulangerie ups' } },
  { type: 'node', id: 5, lat: 47.2, lon: -1.5, tags: { amenity: 'parcel_locker', brand: 'Inconnu' } },
  { type: 'node', id: 6, lat: 47.2, lon: -1.5, tags: { shop: 'kiosk', name: 'Divers' } },
]);
assert.deepStrictEqual([...pts.map(p => p.id)], ['node/1', 'way/2', 'node/4', 'node/5']);
assert.strictEqual(pts[0].adresse, '4 rue X, 44000 Nantes');
assert.strictEqual(pts[1].type, 'locker');
assert.strictEqual(pts[3].reseau, 'autre');

// Requête Overpass
const q = a.construireRequete(47.21844, -1.55362, 3000);
assert.ok(q.includes('(around:3000,47.21844,-1.55362)') && q.includes('"amenity"="parcel_locker"') && q.includes('out center tags'));

// Distance (Nantes – Rennes ≈ 96 km)
const d = a.distanceM(47.2184, -1.5536, 48.1173, -1.6778);
assert.ok(d > 95000 && d < 101000, 'distance ' + d);

// Horaires : 2026-11-18 = mercredi ; 12:00 Paris = 11:00Z (UTC+1)
const mer = h => new Date(`2026-11-18T${h}:00Z`);
const oh = 'Mo-Fr 09:00-12:30,14:00-19:00; Sa 09:00-12:30; PH off';
assert.strictEqual(a.statutHoraires(oh, mer('11:00')).etat, 'ouvert');          // 12h00
assert.strictEqual(a.statutHoraires(oh, mer('11:00')).texte, 'Ouvert jusqu’à 12h30');
let s = a.statutHoraires(oh, mer('12:00'));                                        // 13h00
assert.strictEqual(s.etat, 'ferme'); assert.strictEqual(s.texte, 'Fermé, ouvre à 14h00');
s = a.statutHoraires(oh, mer('19:00'));                                            // 20h00
assert.strictEqual(s.texte, 'Fermé, ouvre demain à 09h00');
s = a.statutHoraires(oh, new Date('2026-11-21T19:00:00Z'));                        // samedi 20h
assert.strictEqual(s.texte, 'Fermé, ouvre lundi à 09h00');
assert.strictEqual(a.statutHoraires('24/7', mer('03:00')).etat, 'ouvert');
assert.strictEqual(a.statutHoraires('', mer('11:00')).etat, 'inconnu');
assert.strictEqual(a.statutHoraires('sunrise-sunset', mer('11:00')).etat, 'inconnu');
assert.strictEqual(a.statutHoraires('Mo-Su 10:00-22:00; We off', mer('11:00')).etat, 'ferme');
// Fin de plage à 24:00 et plage qui passe minuit
assert.strictEqual(a.statutHoraires('Mo-Su 08:00-24:00', mer('22:30')).etat, 'ouvert');
assert.strictEqual(a.statutHoraires('Tu 20:00-02:00', new Date('2026-11-18T00:30:00Z')).etat, 'ouvert'); // mercredi 01h30
// Heure d'été : 2026-07-15 10:00Z = 12h Paris
assert.strictEqual(a.statutHoraires('Mo-Su 11:00-13:00', new Date('2026-07-15T10:00:00Z')).etat, 'ouvert');
const sem = a.semaineTexte(oh);
assert.deepStrictEqual([...sem[0]], ['lundi', '09h00–12h30, 14h00–19h00']);
assert.deepStrictEqual([...sem[6]], ['dimanche', 'fermé']);

// Liens Google Maps
const p = { lat: 47.2, lon: -1.5, nom: 'Tabac du Port', adresse: '4 rue X, 44000 Nantes' };
assert.strictEqual(a.lienItineraire(p, 'walking', null), 'https://www.google.com/maps/dir/?api=1&destination=47.200000,-1.500000&travelmode=walking');
assert.ok(a.lienItineraire(p, 'driving', { lat: 47.1, lon: -1.4 }).endsWith('&origin=47.100000,-1.400000'));
assert.ok(a.lienFiche(p).startsWith('https://www.google.com/maps/search/?api=1&query=Tabac%20du%20Port'));
console.log('OK : tous les tests de relais-retour passent');
