// 发码器 Service Worker —— 独立缓存
const CACHE_NAME = 'issuer-app-v1';
const ASSETS = [
    './issuer.html',
    './manifest.json',
    './icon-key-192.png',
    './icon-key-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.allSettled(ASSETS.map(u => cache.add(u).catch(() => {})));
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    var isDoc = event.request.destination === 'document';
    if (isDoc) {
        event.respondWith(
            fetch(event.request).then(r => {
                if (r && r.status === 200 && r.type === 'basic') {
                    var c = r.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, c));
                }
                return r;
            }).catch(() => caches.match(event.request).then(x => x || caches.match('./issuer.html')))
        );
        return;
    }
    event.respondWith(
        caches.match(event.request).then(c => c || fetch(event.request).then(r => {
            if (r.status === 200 && r.type === 'basic') {
                var cl = r.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, cl));
            }
            return r;
        }))
    );
});
