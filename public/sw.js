// Service worker: guarda el juego en el dispositivo para jugar sin conexión.
// Primero intenta la red (así las actualizaciones llegan al momento) y, si no
// hay conexión, sirve la copia guardada. Las fuentes de Google van a caché.
const VERSION = 'pixel-unicorn-v9';
const FILES = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'favicon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png',
  'js/audio.js',
  'js/b2b.js',
  'js/core.js',
  'js/data.js',
  'js/events.js',
  'js/hw.js',
  'js/keynote.js',
  'js/layout.js',
  'js/mail.js',
  'js/main.js',
  'js/music.js',
  'js/office.js',
  'js/panels.js',
  'js/pets.js',
  'js/platforms.js',
  'js/relations.js',
  'js/rivals.js',
  'js/scenery.js',
  'js/security.js',
  'js/sim.js',
  'js/sprites.js',
  'js/state.js',
  'js/tutorial.js',
  'js/ui.js',
  'js/util.js',
  'js/world.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const keep = (req, res) => {
  const copy = res.clone();
  caches.open(VERSION).then((c) => c.put(req, copy));
  return res;
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      fetch(req)
        .then((res) => (res.ok ? keep(req, res) : res))
        .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))),
    );
  } else if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => keep(req, res))));
  }
});
