import { beforeEach, describe, expect, it, vi } from 'vitest';
const sdk = vi.hoisted(() => ({ callbacks: [] as { path: string; receive: (snapshot: unknown) => void; fail: (error: Error) => void }[], stop: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {}, ref: (_db: unknown, path: string) => path,
  onValue: (path: string, receive: (snapshot: unknown) => void, fail: (error: Error) => void) => { sdk.callbacks.push({ path, receive, fail }); return sdk.stop; } }));
import { subscribeReportFriends } from '@/lib/pastoralFriends';
function snapshot(value?: object) { return { forEach: (fn: (child: object) => void) => { if (value) fn({ key: 'friend', val: () => value }); } }; }
beforeEach(() => { sdk.callbacks = []; sdk.stop.mockClear(); });
describe('새친구 읽기 경계', () => {
  it('3개 새친구 경로가 모두 준비된 뒤 필요한 공개 필드만 전달한다', () => {
    const receive = vi.fn(); subscribeReportFriends(2026, receive, vi.fn());
    expect(sdk.callbacks.map(call => call.path)).toEqual(['semesters/2026-1/newFriends', 'semesters/2026-2/newFriends', 'semesters/2026-sunday/newFriends']);
    sdk.callbacks[0].receive(snapshot({ name: '합성', createdAt: '2026-01-01T23:00:00Z', giftDate: '2026-01-04', rosterSync: { studentId: 'nf_one', classKey: '1-1-1', syncedAt: '2026-01-03T23:00:00Z' }, phone: '노출 금지', pastoralNotes: '노출 금지' }));
    sdk.callbacks[1].receive(snapshot()); expect(receive).not.toHaveBeenCalled();
    sdk.callbacks[2].receive(snapshot());
    const row = receive.mock.calls[0][0][0];
    expect(row.registeredDate).toBe('2026-01-02');
    expect(row.giftDate).toBe('2026-01-04');
    expect(row.rosterSync.syncedAt).toBe('2026-01-03T23:00:00Z');
    expect(row).not.toHaveProperty('phone'); expect(row).not.toHaveProperty('pastoralNotes');
  });
  it('하나라도 실패하면 부분 자료를 성공으로 보내지 않는다', () => {
    const receive = vi.fn(); const fail = vi.fn(); subscribeReportFriends(2026, receive, fail);
    sdk.callbacks[0].fail(new Error('권한 없음'));
    sdk.callbacks.forEach(call => call.receive(snapshot({ name: '합성' })));
    expect(receive).not.toHaveBeenCalled(); expect(fail).toHaveBeenCalledOnce();
  });
  it('구독 해제 후 늦은 응답을 폐기한다', () => {
    const receive = vi.fn(); const stop = subscribeReportFriends(2026, receive, vi.fn()); stop();
    sdk.callbacks.forEach(call => call.receive(snapshot({ name: '이전 계정' })));
    expect(receive).not.toHaveBeenCalled(); expect(sdk.stop).toHaveBeenCalledTimes(3);
  });
});
