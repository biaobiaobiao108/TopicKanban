const CACHE_NAME = 'topic-kanban-shell-v1';
const PRECACHE_URLS = [];

const isSameOrigin = (request) => new URL(request.url).origin === self.location.origin;
const isApiRequest = (url) => url.pathname === '/api' || url.pathname.startsWith('/api/');
const isStaticAsset = (url) => (
  url.pathname.startsWith('/assets/')
  || url.pathname === '/manifest.webmanifest'
  || url.pathname === '/icon-192.png'
  || url.pathname === '/icon-512.png'
  || url.pathname === '/apple-touch-icon.png'
  || url.pathname === '/favicon.ico'
);

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type !== 'basic') return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await cache.match('/index.html'))
      || (await cache.match('/'))
      || new Response('当前处于离线状态，请恢复网络后重试。', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    return await cacheResponse(request, await fetch(request));
  } catch {
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith('topic-kanban-shell-') && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !isSameOrigin(request)) return;

  const url = new URL(request.url);
  if (isApiRequest(url)) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
