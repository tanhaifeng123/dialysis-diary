// Service Worker - 离线缓存

const CACHE_NAME = 'dialysis-workbench-v14';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/records.js',
    './js/stats.js',
    './js/foods.js',
    './js/tasks.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon.svg',
    './icons/favicon.svg'
];

// 安装：预缓存核心资源（容错处理，单个文件失败不阻塞）
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            // 逐个缓存，即使某个失败也不阻塞安装
            return Promise.allSettled(
                ASSETS.map(url => cache.add(url).catch(() => {}))
            );
        }).then(() => self.skipWaiting())
    );
});

// 激活：清理旧缓存
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// 请求拦截：缓存优先，网络回退
self.addEventListener('fetch', (event) => {
    // 只处理 GET 请求
    if (event.request.method !== 'GET') return;

    // 本地资源走缓存优先
    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                // 缓存新资源
                if (response.status === 200 && response.type === 'basic') {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(() => {
                // 离线回退
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
