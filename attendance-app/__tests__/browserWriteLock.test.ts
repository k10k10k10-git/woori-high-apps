import { afterEach, expect, it, vi } from 'vitest';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';
afterEach(() => vi.unstubAllGlobals());
it('다른 탭의 동기화 중에는 일반 쓰기를 큐에 넣지 않고 거절한다', async () => {
  const write = vi.fn();
  vi.stubGlobal('navigator', { locks: { request: vi.fn((_name, options, fn) => {
    expect(options).toEqual({ mode: 'shared', ifAvailable: true });
    return Promise.resolve().then(() => fn(null));
  }) } });
  await expect(withBrowserWriteLock('shared', write)).rejects.toThrow('다른 탭');
  expect(write).not.toHaveBeenCalled();
});
it('배타 작업은 완료할 때까지 잠금을 유지하고 실패 시에도 반환한다', async () => {
  let active = false;
  vi.stubGlobal('navigator', { locks: { request: async (_name: string, _options: unknown, fn: (lock: object | null) => unknown) => {
    if (active) return fn(null);
    active = true;
    try { return await fn({}); } finally { active = false; }
  } } });
  await expect(withBrowserWriteLock('exclusive', async () => {
    await expect(withBrowserWriteLock('shared', async () => '실행 금지')).rejects.toThrow('다른 탭');
    throw new Error('작업 실패');
  })).rejects.toThrow('작업 실패');
  await expect(withBrowserWriteLock('shared', async () => '다시 저장')).resolves.toBe('다시 저장');
});
it('잠금 미지원 브라우저는 동기화를 차단하고 일반 저장은 유지한다', async () => {
  vi.stubGlobal('window', {}); vi.stubGlobal('navigator', {});
  await expect(withBrowserWriteLock('exclusive', async () => {})).rejects.toThrow('안전한 동기화');
  await expect(withBrowserWriteLock('shared', async () => 1)).resolves.toBe(1);
});
