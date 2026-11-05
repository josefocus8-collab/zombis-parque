// Guarda el juego en el móvil para que funcione aunque falle la cobertura
const CACHE = 'zp-v9';
const CORE = ['./', 'index.html', 'css/style.css', 'js/main.js', 'js/util.js', 'js/audio.js', 'js/geo.js', 'js/net.js', 'js/config.js', 'js/story.js', 'js/models.js', 'js/ar.js', 'js/challenges.js', 'js/voice.js', 'icon.svg', 'manifest.webmanifest', 'instrucciones.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // Base de datos en vivo: nunca desde caché
  if (url.hostname.endsWith('firebaseio.com') || url.hostname.endsWith('firebasedatabase.app') || url.hostname.includes('googleapis.com')) return;
  const cdn = url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'www.gstatic.com';
  if (cdn) {
    // Librerías con versión fija: primero caché
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    })));
    return;
  }
  if (url.origin === location.origin) {
    // Archivos del juego: primero internet (para tener la última versión), si no hay, caché.
    // 'no-cache' obliga a preguntar al servidor y no usar la copia que el navegador guarda 10 minutos.
    // Los modelos 3D y las voces casi no cambian: para ellos vale la copia normal (más rápido).
    const heavy = /\.(glb|mp3)$/.test(url.pathname);
    const req = heavy ? fetch(e.request) : e.request.mode === 'navigate' ? fetch(e.request.url, { cache: 'no-cache' }) : fetch(e.request, { cache: 'no-cache' });
    e.respondWith(req.then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })));
  }
});
