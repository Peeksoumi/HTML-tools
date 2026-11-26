// Propose d'installer la page consultée comme application.
// Le bandeau apparaît quand le navigateur permet l'installation, ou avec ?installer (bouton « Installer » de l’accueil).
// Ajoute aussi un bouton « Installer l’appli » dans la page.
(function () {
  if (location.protocol === 'file:') return;
  if (matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone) return;
  var demande = new URLSearchParams(location.search).has('installer');
  var invite = null, boite = null, texte, bouton, ferme = false;

  function aide() {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios
      ? 'Pour installer : bouton Partager, puis « Sur l’écran d’accueil ».'
      : 'Pour installer : menu ⋮ du navigateur, puis « Installer l’application » ou « Ajouter à l’écran d’accueil » (si proposé ; sinon l’appli est peut-être déjà installée).';
  }
  function fermer() { ferme = true; if (boite) boite.remove(); boite = null; }
  function montrer(message) {
    if (ferme || !document.body) return;
    if (!boite) {
      boite = document.createElement('div');
      boite.id = 'bandeau-installer';
      boite.setAttribute('role', 'region');
      boite.setAttribute('aria-label', 'Installer l’application');
      boite.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483647;max-width:480px;margin:0 auto;display:flex;gap:10px;align-items:center;padding:12px;border-radius:12px;background:#111827;color:#fff;font:14px/1.4 system-ui,sans-serif;text-align:left;box-shadow:0 4px 16px rgba(0,0,0,.35)';
      texte = document.createElement('span');
      texte.style.flex = '1';
      bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = '📲 Installer';
      bouton.style.cssText = 'font:600 14px system-ui,sans-serif;padding:8px 12px;border:0;border-radius:8px;background:#fff;color:#111827;cursor:pointer';
      bouton.onclick = installer;
      var croix = document.createElement('button');
      croix.type = 'button';
      croix.textContent = '✕';
      croix.setAttribute('aria-label', 'Fermer');
      croix.style.cssText = 'font:16px system-ui,sans-serif;padding:6px 8px;border:0;background:none;color:#fff;cursor:pointer';
      croix.onclick = fermer;
      boite.append(texte, bouton, croix);
      document.body.appendChild(boite);
    }
    texte.textContent = message;
    bouton.hidden = !invite;
  }

  function installer() {
    var i = invite;
    invite = null; // une invite ne sert qu'une fois
    if (!i) return false;
    i.prompt();
    i.userChoice.then(fermer);
    return true;
  }
  // Bouton permanent, à côté de « Télécharger la page » (à défaut, du lien « Proposer une amélioration »).
  function ajouterBouton() {
    var dossier = location.pathname.replace(/[^/]*$/, '').split('/').filter(Boolean).pop();
    var voisin = document.querySelector('a[download="' + dossier + '.html"]') || document.querySelector('a[href*="HTML-tools/issues/new"]');
    if (!voisin) return;
    var b = voisin.cloneNode(false); // même style que le voisin
    ['id', 'download', 'target', 'rel', 'title', 'data-m'].forEach(function (a) { b.removeAttribute(a); });
    b.href = '?installer';
    b.classList.add('bouton-installer');
    b.textContent = '📲 Installer l’appli';
    b.addEventListener('click', function (e) {
      e.preventDefault();
      ferme = false;
      if (!installer()) montrer(aide());
    });
    voisin.after(' ', b);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', ajouterBouton);
  else ajouterBouton();

  addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    invite = e;
    montrer('Installer cette application sur ton appareil ?');
  });
  addEventListener('appinstalled', fermer);
  // Sans invite du navigateur (Safari, Firefox, appli déjà installée) : on explique la marche à suivre.
  if (demande) addEventListener('load', function () { setTimeout(function () { if (!invite) montrer(aide()); }, 2500); });
})();
