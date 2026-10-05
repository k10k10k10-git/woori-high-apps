const CACHE_NAME = 'woori-att-20260813';
const ASSETS = [
  '/offline.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// 설치: 핵심 파일 캐시
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

// 활성화: 이전 캐시 삭제 + 업데이트 알림
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const oldKeys = keys.filter(k => k.startsWith('woori-att-') && k !== CACHE_NAME);
    await Promise.all(oldKeys.map(k => caches.delete(k)));
    await self.clients.claim();
    if (oldKeys.length) {
      const clients = await self.clients.matchAll({ includeUncontrolled: true });
      clients.forEach(c => c.postMessage({ type: 'NEW_VERSION' }));
    }
  })());
});

// 요청 처리: 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', e => {
  // Firebase / Google Fonts / CDN / Next.js 내부 요청은 그냥 통과
  const url = new URL(e.request.url);
  if (
    e.request.method !== 'GET' || url.origin !== self.location.origin ||
    url.pathname.includes('/_next/') || url.pathname.includes('/__nextjs') ||
    url.pathname.includes('__next.') || e.request.headers.has('RSC')
  ) {
    return;
  }
  const navigation = e.request.mode === 'navigate';
  const staticAsset = !url.search && ASSETS.includes(url.pathname);
  // 원장/API/임의 파일은 캐시에 넣지 않는다. 출석 저장을 오프라인 성공처럼 보여주지 않는다.
  if (!navigation && !staticAsset) return;
  const network = fetch(e.request);
  if (staticAsset) e.waitUntil(network.then(res => res.ok
    ? caches.open(CACHE_NAME).then(cache => cache.put(e.request, res.clone())) : undefined).catch(() => {}));
  e.respondWith(network.catch(async () => {
    const cache = await caches.open(CACHE_NAME);
    const fallback = await cache.match(navigation ? '/offline.html' : e.request);
    return fallback || new Response('인터넷 연결이 필요합니다.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});
