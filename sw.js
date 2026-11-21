/* 두통일지 서비스 워커
   - 문서(index.html / 내비게이션)와 data.enc.json 은 network-first:
     항상 최신을 먼저 받고, 네트워크가 안 되면 캐시로 연다.
   - 아이콘·매니페스트 같은 정적 자산은 cache-first.
   - 평문 기록은 다루지 않는다(암호문 data.enc.json 만 오간다). */

const VERSION = 'v2';
const CACHE = 'migraine-log-' + VERSION;
const CACHE_PREFIX = 'migraine-log-';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE);
      await cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })));
    } catch (e) {
      /* 일부 자산이 없어도 설치는 계속한다 */
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k.startsWith(CACHE_PREFIX) && k !== CACHE).map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isDocument(req, url) {
  return req.mode === 'navigate' ||
         req.destination === 'document' ||
         url.pathname.endsWith('/index.html') ||
         url.pathname.endsWith('/migraine-log/');
}

function isData(url) {
  return url.pathname.endsWith('/data.enc.json');
}

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      try { await cache.put(key, res.clone()); } catch (e) {}
    }
    return res;
  } catch (e) {
    const cached = await cache.match(key) || await cache.match(req);
    if (cached) return cached;
    if (isDocument(req, new URL(req.url))) {
      const shell = await cache.match('./index.html');
      if (shell) return shell;
    }
    throw e;
  }
}

async function cacheFirst(req, key) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(key) || await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res && res.ok) {
    try { await cache.put(key, res.clone()); } catch (e) {}
  }
  return res;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return;

  if (isData(url)) {
    event.respondWith(networkFirst(req, url.href));
    return;
  }
  if (isDocument(req, url)) {
    event.respondWith(networkFirst(req, './index.html'));
    return;
  }
  event.respondWith(cacheFirst(req, url.href));
});
