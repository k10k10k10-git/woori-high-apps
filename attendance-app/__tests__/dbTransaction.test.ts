import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn(), transaction: vi.fn(), set: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ db: {} }));
vi.mock('firebase/database', () => ({ get: vi.fn(), off: vi.fn(), onDisconnect: vi.fn(), onValue: m.listen,
  push: vi.fn(), ref: vi.fn(), remove: vi.fn(), runTransaction: m.transaction, set: m.set, update: vi.fn() }));
import { runTransaction, set } from '@/lib/db';
beforeEach(() => {
  vi.clearAllMocks();
  m.listen.mockImplementation((_ref, ready) => { queueMicrotask(ready); return m.stop; });
  m.transaction.mockResolvedValue({ committed: true });
});
afterEach(() => vi.unstubAllGlobals());
it('조회 구독이 준비된 뒤 트랜잭션을 실행하고 완료 후 해제한다', async () => {
  m.transaction.mockImplementation(async () => {
    expect(m.stop).not.toHaveBeenCalled(); return { committed: true };
  });
  await runTransaction({} as Parameters<typeof runTransaction>[0], current => current);
  expect(m.listen.mock.invocationCallOrder[0]).toBeLessThan(m.transaction.mock.invocationCallOrder[0]);
  expect(m.stop).toHaveBeenCalledOnce();
});
it('조회 권한 오류는 쓰기를 실행하지 않고 구독을 정리한다', async () => {
  m.listen.mockImplementation((_ref, _ready, fail) => { queueMicrotask(() => fail(new Error('권한 없음'))); return m.stop; });
  await expect(runTransaction({} as Parameters<typeof runTransaction>[0], current => current)).rejects.toThrow('권한 없음');
  expect(m.transaction).not.toHaveBeenCalled(); expect(m.stop).toHaveBeenCalledOnce();
});
it('동기화 중 SDK 저장을 시작하지 않는다', async () => {
  vi.stubGlobal('navigator', { locks: { request: (_name: string, _options: unknown, fn: (lock: null) => unknown) => Promise.resolve().then(() => fn(null)) } });
  await expect(set({} as Parameters<typeof set>[0], 'O')).rejects.toThrow('다른 탭');
  expect(m.set).not.toHaveBeenCalled();
});
