// Service Worker - 离线缓存

const CACHE_NAME = 'dialysis-workbench-v58';
const ASSETS = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './js/records.js',
    './js/stats.js',
    './js/backup.js',
    './js/metrics.js',
    './js/foods.js',
    './js/foods-extra.js',
    './js/foods-update.js',
    './js/tasks.js',
    './js/blood-pressure.js',
    './js/activation.js',
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

// 请求拦截
// - 页面导航(HTML)：网络优先，保证每次拿到最新结构；离线回退缓存
// - 其他静态资源：缓存优先，保证离线可用与加载速度
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    var isDoc = event.request.destination === 'document' ||
                (event.request.headers.get('accept') || '').indexOf('text/html') !== -1;

    if (isDoc) {
        event.respondWith(
            fetch(event.request).then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return response;
            }).catch(() => caches.match(event.request).then(c => c || caches.match('./index.html')))
        );
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cached => {
            if (cached) return cached;
            return fetch(event.request).then(response => {
                if (response.status === 200 && response.type === 'basic') {
                    var responseClone = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            }).catch(() => {
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
