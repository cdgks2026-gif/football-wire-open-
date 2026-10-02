// Retire the previous application's service worker and cached pages.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) await caches.delete(name);
  await self.clients.claim();
  await self.registration.unregister();
})()));
