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
    sdk.callbacks[0].receive(snapshot({ name: '합성', school: '합성고', owner: '담당', part: '2부', grade: 2,
      createdAt: '2026-01-01T23:00:00Z', week1Date: '2026-01-04', week2Date: '2026-01-11', decision: '등록',
      assignedClassKey: '2-2-1', giftDate: '2026-01-04',
      rosterSync: { studentId: 'nf_one', classKey: '1-1-1', syncedAt: '2026-01-03T23:00:00Z' },
      phone: '노출 금지', parentPhone: '노출 금지', pastoralNotes: '노출 금지', address: '노출 금지' }));
    sdk.callbacks[1].receive(snapshot()); expect(receive).not.toHaveBeenCalled();
    sdk.callbacks[2].receive(snapshot());
    const row = receive.mock.calls[0][0][0];
    expect(row.registeredDate).toBe('2026-01-02');
    expect(row.school).toBe('합성고');
    expect(row.part).toBe('2');
    expect(row.grade).toBe('2');
    expect(row.owner).toBe('담당');
    expect(row.week1Date).toBe('2026-01-04');
    expect(row.week2Date).toBe('2026-01-11');
    expect(row.decision).toBe('등록');
    expect(row.assignedClassKey).toBe('2-2-1');
    expect(row.giftDate).toBe('2026-01-04');
    expect(row.rosterSync.syncedAt).toBe('2026-01-03T23:00:00Z');
    for (const key of ['phone', 'parentPhone', 'pastoralNotes', 'address']) expect(row).not.toHaveProperty(key);
  });
  it('통합사이트의 공개 기록이 바뀌면 같은 구독에서 다시 전달한다', () => {
    const receive = vi.fn(); subscribeReportFriends(2026, receive, vi.fn());
    sdk.callbacks[0].receive(snapshot({ name: '합성', week1Date: '2026-01-04' }));
    sdk.callbacks[1].receive(snapshot());
    sdk.callbacks[2].receive(snapshot());
    expect(receive).toHaveBeenCalledTimes(1);
    sdk.callbacks[0].receive(snapshot({ name: '합성', week1Date: '2026-01-04', week2Date: '2026-01-11', decision: '등록' }));
    expect(receive).toHaveBeenCalledTimes(2);
    expect(receive.mock.lastCall?.[0][0]).toMatchObject({ week2Date: '2026-01-11', decision: '등록' });
  });
  it('이전 기록의 잘못된 생성 시각은 통합사이트처럼 앞 10자를 등록일로 보여 준다', () => {
    const receive = vi.fn(); subscribeReportFriends(2026, receive, vi.fn());
    sdk.callbacks[0].receive(snapshot({ name: '합성', createdAt: '2026-01-02 이전 형식' }));
    sdk.callbacks[1].receive(snapshot()); sdk.callbacks[2].receive(snapshot());
    expect(receive.mock.lastCall?.[0][0].registeredDate).toBe('2026-01-02');
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
