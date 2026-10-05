import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { expect, it, vi } from 'vitest';
const source = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');
function fixture() {
  const handlers: Record<string, (event: unknown) => void> = {};
  const cache = { addAll: vi.fn().mockResolvedValue(undefined), put: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(undefined) };
  const caches = { open: vi.fn().mockResolvedValue(cache), keys: vi.fn().mockResolvedValue(['unrelated-cache', 'woori-att-old']), delete: vi.fn().mockResolvedValue(true) };
  const client = { postMessage: vi.fn() };
  const self = { location: { origin: 'https://fixture.invalid' }, addEventListener: (key: string, handler: (event: unknown) => void) => { handlers[key] = handler; }, skipWaiting: vi.fn(), clients: { claim: vi.fn().mockResolvedValue(undefined), matchAll: vi.fn().mockResolvedValue([client]) } };
  const fetch = vi.fn().mockResolvedValue(new Response('network'));
  runInNewContext(source, { self, caches, fetch, URL, Response });
  function request(path: string, extra = {}) {
    const waits: Promise<unknown>[] = [];
    let result: Promise<Response> | undefined;
    handlers.fetch({ request: { url: new URL(path, self.location.origin).href, method: 'GET', mode: 'cors', headers: new Headers(), ...extra }, waitUntil: (promise: Promise<unknown>) => waits.push(promise), respondWith: (promise: Promise<Response>) => { result = promise; } });
    return { waits, result };
  }
  return { handlers, cache, caches, self, client, fetch, request };
}
it('설치는 원장 화면 대신 정적 오프라인 안내만 캐시한다', async () => {
  const f = fixture(); let work!: Promise<unknown>;
  f.handlers.install({ waitUntil: (p: Promise<unknown>) => { work = p; } }); await work;
  expect(f.cache.addAll).toHaveBeenCalledWith(['/offline.html', '/manifest.json', '/icon-192.png', '/icon-512.png']);
});
it('활성화는 다른 앱 캐시를 보존하고 출석부 구버전만 제거한다', async () => {
  const f = fixture(); let work!: Promise<unknown>;
  f.handlers.activate({ waitUntil: (p: Promise<unknown>) => { work = p; } }); await work;
  expect(f.caches.delete).toHaveBeenCalledExactlyOnceWith('woori-att-old');
  expect(f.self.clients.claim).toHaveBeenCalledOnce(); expect(f.client.postMessage).toHaveBeenCalledWith({ type: 'NEW_VERSION' });
});
it.each([
  ['https://firebase.example.invalid/api', {}], ['/_next/chunk.js', {}], ['/__nextjs/test', {}], ['/attendance/__next._full.txt', {}],
  ['/api/private', {}], ['/manifest.json', { method: 'POST' }], ['/attendance', { headers: new Headers({ RSC: '1' }) }],
])('요청 %s는 가로채거나 캐시하지 않는다', (path, extra) => {
  const f = fixture(); expect(f.request(path, extra).result).toBeUndefined(); expect(f.fetch).not.toHaveBeenCalled();
});
it('문서 오프라인에는 명시 안내를 표시하고 원장 HTML은 캐시하지 않는다', async () => {
  const f = fixture(); f.fetch.mockRejectedValue(new Error('offline')); f.cache.match.mockResolvedValue(new Response('offline page'));
  const { result } = f.request('/attendance', { mode: 'navigate' });
  expect(await (await result!).text()).toBe('offline page'); expect(f.cache.match).toHaveBeenCalledWith('/offline.html'); expect(f.cache.put).not.toHaveBeenCalled();
});
it('정적 파일 미스는 HTML을 반환하지 않고 503으로 끝낸다', async () => {
  const f = fixture(); f.fetch.mockRejectedValue(new Error('offline'));
  const { result, waits } = f.request('/icon-192.png');
  expect((await result!).status).toBe(503); expect((await result!).headers.get('content-type')).toContain('text/plain'); await Promise.all(waits);
});
it('캐시 저장 실패는 정상 네트워크 응답을 실패로 바꾸지 않는다', async () => {
  const f = fixture(); f.cache.put.mockRejectedValue(new Error('quota'));
  const { result, waits } = f.request('/manifest.json');
  expect((await result!).status).toBe(200); await expect(Promise.all(waits)).resolves.toBeDefined();
});
