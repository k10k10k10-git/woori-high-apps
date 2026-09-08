import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  get: vi.fn(), transaction: vi.fn(), patch: vi.fn(),
  disconnect: { update: vi.fn(), cancel: vi.fn() },
  user: { uid: 'admin', getIdToken: vi.fn().mockResolvedValue('synthetic-token') },
}));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: m.user } }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path,
  get: m.get, syncProtocolDb: { runTransaction: m.transaction }, onDisconnect: () => m.disconnect }));
vi.mock('@/utils/studentMoveRequest', () => ({ patchStudentMoveOnce: m.patch }));
import { claimSyncLocks, commitSheetSync } from '@/lib/sheetSyncCommit';
const input = { year: 2026, classKeys: ['a', 'b'], classes: {}, attendance: {}, payload: { 'classes/2026/a/teacher': '교사' } };
beforeEach(() => {
  vi.clearAllMocks();
  m.disconnect.cancel.mockResolvedValue(undefined);
  m.disconnect.update.mockResolvedValue(undefined);
  m.get.mockResolvedValue({ val: () => ({}) });
  m.transaction.mockResolvedValue({ committed: true });
  m.patch.mockResolvedValue({ status: 'committed' });
});
it('다른 작업의 잠금이 있는 반은 선점하지 않는다', () => {
  expect(claimSyncLocks({ a: { owner: true } }, ['a', 'b'], 'admin', 'op', 1)).toBeUndefined();
  expect(claimSyncLocks(null, ['a', 'b'], 'admin', 'op', 1)).toMatchObject({ a: { admin: { op: { fromCk: 'a', toCk: 'b' } } } });
});
it('미리보기 후 새 출석이 있으면 쓰기를 보내지 않는다', async () => {
  m.get.mockImplementation(async (path: string) => ({ val: () => path.startsWith('attendance/') ? { added: true } : {} }));
  await expect(commitSheetSync(input)).rejects.toThrow('미리보기 이후');
  expect(m.patch).not.toHaveBeenCalled();
  expect(m.transaction).toHaveBeenCalledTimes(2);
});
it('명단 변경과 자기 잠금 해제는 한 PATCH로 전송한다', async () => {
  await commitSheetSync(input);
  expect(m.patch).toHaveBeenCalledTimes(1);
  const payload = m.patch.mock.calls[0][0].payload;
  expect(payload['classes/2026/a/teacher']).toBe('교사');
  expect(Object.keys(payload).filter(key => key.startsWith('config/studentMoveLocks/'))).toHaveLength(2);
});
it('결과 불명확 시 재시도·잠금 해제 없이 오류를 보고한다', async () => {
  m.patch.mockResolvedValue({ status: 'unknown' });
  await expect(commitSheetSync(input)).rejects.toThrow('불명확');
  expect(m.patch).toHaveBeenCalledTimes(1);
  expect(m.transaction).toHaveBeenCalledTimes(1);
});
