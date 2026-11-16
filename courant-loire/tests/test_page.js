// Test de la page construite : exécute le script de index.html avec un faux DOM (node tests/test_page.js).
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');

for (const [motif, nb] of [['HTML-tools/issues', 1], ['download=', 1]]) {
  const n = html.split(motif).length - 1;
  assert(n >= nb, `${motif} : ${n} occurrence(s)`);
}
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const els = {};
const el = (id) => (els[id] ||= { id, value: '', textContent: '', innerHTML: '', addEventListener() {} });
const sandbox = {
  document: { getElementById: el },
  fetch: async () => ({ json: async () => ({ data: [{ date_obs: new Date().toISOString(), resultat_obs: 850000 }] }) }),
  setInterval() {}, console, Intl, Date, Math, JSON, Object, Array, Promise, isNaN, parseFloat,
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
setTimeout(() => {
  const out = els.sites.innerHTML;
  assert(out.includes('Bac Lola') && out.includes('Île de Nantes'), 'les deux sites sont affichés');
  assert(/Début du (flot|jusant)/.test(out), 'des renverses sont listées');
  assert(out.includes('<svg'), 'le graphique est dessiné');
  assert(/Débit mesuré à Montjean : 850 m³\/s/.test(els.debitInfo.textContent), els.debitInfo.textContent);
  const nbRenverses = (out.match(/Début du/g) || []).length;
  console.log(`ok - page : ${nbRenverses} renverses affichées, débit lu (850 m³/s)`);
}, 50);
