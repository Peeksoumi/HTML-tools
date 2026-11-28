// Service worker réservé aux alertes du bac Lola. Sa portée (alertes/) lui donne son propre abonnement Web Push,
// sans toucher à celui du service worker du site (../sw.js).
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data.json(); } catch (e) { d = {}; }
  event.waitUntil(self.registration.showNotification(d.title || 'Bac Lola', {
    body: d.body || '',
    tag: d.tag,
    icon: 'icons/icon-192.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('./'));
});
