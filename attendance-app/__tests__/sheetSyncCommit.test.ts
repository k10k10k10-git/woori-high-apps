import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => {
  const user = { uid: 'admin', getIdToken: vi.fn().mockResolvedValue('synthetic-token') };
  return { get: vi.fn(), read: vi.fn(), transaction: vi.fn(), patch: vi.fn(),
    disconnect: { update: vi.fn(), cancel: vi.fn() },
    user, auth: { currentUser: user as typeof user | null },
  };
});
vi.mock('@/lib/firebase/client', () => ({ auth: m.auth }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path,
  get: m.get, syncProtocolDb: { runTransaction: m.transaction }, onDisconnect: () => m.disconnect }));
vi.mock('@/utils/studentMoveRequest', () => ({ patchStudentMoveOnce: m.patch, readStudentMoveValue: m.read }));
import { claimSyncLocks, commitSheetSync } from '@/lib/sheetSyncCommit';
import { buildPromotionPayload } from '@/lib/promotion';
const input = { year: 2026, classKeys: ['a', 'b'], classes: {}, attendance: {}, payload: { 'classes/2026/a/teacher': '교사' } };
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.currentUser = m.user;
  m.disconnect.cancel.mockResolvedValue(undefined);
  m.disconnect.update.mockResolvedValue(undefined);
  m.get.mockResolvedValue({ val: () => ({}) });
  m.read.mockImplementation(async ({ isCurrent }: { isCurrent: () => boolean }) => {
    if (!isCurrent()) throw new Error('조회 계정이 변경되었습니다.');
    return {};
  });
  m.transaction.mockResolvedValue({ committed: true });
  m.patch.mockResolvedValue({ status: 'committed' });
});
it('다른 작업의 잠금이 있는 반은 선점하지 않는다', () => {
  expect(claimSyncLocks({ a: { owner: true } }, ['a', 'b'], 'admin', 'op', 1)).toBeUndefined();
  expect(claimSyncLocks(null, ['a', 'b'], 'admin', 'op', 1)).toMatchObject({ a: { admin: { op: { fromCk: 'a', toCk: 'b' } } } });
});
it('미리보기 후 새 출석이 있으면 쓰기를 보내지 않는다', async () => {
  m.read.mockImplementation(async ({ path }: { path: string }) => path.startsWith('attendance/') ? { added: true } : {});
  await expect(commitSheetSync(input)).rejects.toThrow('미리보기 이후');
  expect(m.patch).not.toHaveBeenCalled();
  expect(m.transaction).toHaveBeenCalledTimes(2);
});
it('진급 미리보기 후 추가된 학생은 덮어쓰기 설정과 무관하게 보존한다', async () => {
  const snapshot = { year: 2026, classes: { 2025: { '1-1-1': { students: { s: { id: 's', name: '진급생' } } } } }, attendance: {} };
  const latest = { ...snapshot.classes, 2026: { '1-2-1': { students: { added: { id: 'added', name: '새 전입생' } } } } };
  m.read.mockImplementation(async ({ path }: { path: string }) => path === 'classes' ? latest : {});
  for (const overwrite of [false, true]) {
    const plan = buildPromotionPayload(snapshot, overwrite, 'operation');
    await expect(commitSheetSync({ ...snapshot, ...plan })).rejects.toThrow('미리보기 이후');
  }
  expect(m.patch).not.toHaveBeenCalled();
});
it('명단 변경과 자기 잠금 해제는 한 PATCH로 전송한다', async () => {
  await commitSheetSync(input);
  expect(m.patch).toHaveBeenCalledTimes(1);
  const payload = m.patch.mock.calls[0][0].payload;
  expect(payload['classes/2026/a/teacher']).toBe('교사');
  expect(Object.keys(payload).filter(key => key.startsWith('config/studentMoveLocks/'))).toHaveLength(2);
  expect(Object.keys(payload).filter(key => key.startsWith('config/rosterBatchCommits/'))).toHaveLength(2);
});
it('진급 확정 전 두 번의 최신 검사는 SDK 캐시가 아닌 인증된 서버 조회를 사용한다', async () => {
  await commitSheetSync(input);
  expect(m.read.mock.calls.map(([request]) => request.path)).toEqual(['classes', 'attendance/2026', 'classes', 'attendance/2026']);
  expect(m.read.mock.calls.every(([request]) => request.idToken === 'synthetic-token' && request.isCurrent())).toBe(true);
  expect(m.get.mock.calls.map(([path]) => path)).toEqual(['config/studentMoveLocks/2026']);
});
it('첫 검사 후 계정이 바뀌면 확정 PATCH를 보내지 않는다', async () => {
  m.disconnect.cancel.mockImplementationOnce(async () => { m.auth.currentUser = null; });
  await expect(commitSheetSync(input)).rejects.toThrow('조회 계정이 변경');
  expect(m.patch).not.toHaveBeenCalled();
  expect(m.transaction).toHaveBeenCalledTimes(2);
});
it('결과 불명확 시 재시도·잠금 해제 없이 오류를 보고한다', async () => {
  m.patch.mockResolvedValue({ status: 'unknown' });
  await expect(commitSheetSync(input)).rejects.toThrow('불명확');
  expect(m.patch).toHaveBeenCalledTimes(1);
  expect(m.transaction).toHaveBeenCalledTimes(1);
});
