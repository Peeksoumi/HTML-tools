// Bouton d'abonnement aux alertes « perturbation ». Il reste masqué tant que le serveur d'abonnements ne répond pas
// (et dans la page téléchargée). Le serveur ne sert qu'à enregistrer ou supprimer l'abonnement.
(function () {
  if (location.protocol === 'file:' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  var API = location.hostname.endsWith('.github.io')
    ? 'https://peeksoumi.com/abonnements/bac-lola'
    : '../abonnements/bac-lola';
  var bloc = document.getElementById('notif'), bouton = bloc.querySelector('button'), info = bloc.querySelector('p');
  var cle, reg, abo;

  function octets(b64) {
    var s = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(s, function (c) { return c.charCodeAt(0); });
  }
  function envoyer(methode, corps) {
    return fetch(API, { method: methode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); });
  }
  function actif() {
    return new Promise(function (ok) {
      if (reg.active) return ok();
      var w = reg.installing || reg.waiting;
      w.addEventListener('statechange', function () { if (w.state === 'activated') ok(); });
    });
  }
  function afficher(message) {
    bouton.textContent = abo ? '🔕 Désactiver les alertes' : '🔔 M’alerter des perturbations';
    info.textContent = message || (abo ? 'Alertes activées sur cet appareil.' : '');
  }
  function activer() {
    return Notification.requestPermission().then(function (p) {
      if (p !== 'granted') throw new Error('notifications refusées dans le navigateur');
      return navigator.serviceWorker.register('push-sw.js', { scope: './alertes/' });
    }).then(function (r) {
      reg = r;
      return actif();
    }).then(function () {
      return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: octets(cle) });
    }).then(function (s) {
      return envoyer('POST', s.toJSON()).then(function () { abo = s; }, function (e) { s.unsubscribe(); throw e; });
    });
  }
  function desactiver() {
    return envoyer('DELETE', { endpoint: abo.endpoint })
      .then(function () { return abo.unsubscribe(); })
      .then(function () { abo = null; });
  }

  fetch(API + '/cle').then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (d) {
    cle = d.cle;
    return navigator.serviceWorker.getRegistration('./alertes/');
  }).then(function (r) {
    // getRegistration peut renvoyer le service worker du site (portée plus large) : on ne garde que le nôtre.
    if (r && r.scope.endsWith('/alertes/')) { reg = r; return r.pushManager.getSubscription(); }
  }).then(function (s) {
    abo = s || null;
    // Réenregistre l'abonnement existant, au cas où le serveur l'aurait perdu.
    if (abo) envoyer('POST', abo.toJSON()).catch(function () {});
    afficher();
    bloc.hidden = false;
  }).catch(function () {}); // serveur absent : pas de bouton

  bouton.addEventListener('click', function () {
    bouton.disabled = true;
    (abo ? desactiver() : activer())
      .then(function () { afficher(); }, function (e) { afficher('Échec : ' + e.message); })
      .then(function () { bouton.disabled = false; });
  });
})();
