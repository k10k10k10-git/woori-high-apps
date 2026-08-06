const CACHE_NAME = 'woori-att-20260806';
const ASSETS = [
  '/',
  '/attendance',
  '/manage',
  '/stats',
  '/overall',
  '/admin',
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
  e.waitUntil(
    caches.keys().then(keys => {
      const oldKeys = keys.filter(k => k !== CACHE_NAME);
      const isUpdate = oldKeys.length > 0;
      return Promise.all(oldKeys.map(k => caches.delete(k))).then(() => {
        if (isUpdate) {
          return self.clients.matchAll({ includeUncontrolled: true }).then(clients => {
            clients.forEach(c => c.postMessage({ type: 'NEW_VERSION' }));
          });
        }
      });
    })
  );
  self.clients.claim();
});

// 요청 처리: 네트워크 우선, 실패 시 캐시
self.addEventListener('fetch', e => {
  // Firebase / Google Fonts / CDN / Next.js 내부 요청은 그냥 통과
  const url = e.request.url;
  if (
    url.includes('firebase') ||
    url.includes('googleapis') ||
    url.includes('gstatic') ||
    url.includes('/_next/') ||
    url.includes('/__nextjs') ||
    url.includes('__next.')   // Next.js RSC 페이로드 파일 (__next._full.txt 등)
  ) {
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // 성공 시 캐시 업데이트
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        // 캐시 미스 시 undefined 반환 방지 → 오프라인 fallback
        caches.match(e.request).then(cached => cached || caches.match('/attendance'))
      )
  );
});
