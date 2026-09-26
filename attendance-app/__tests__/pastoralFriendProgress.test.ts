import { describe, expect, it } from 'vitest';
import { deriveNewFriendRosterProgress, deriveNewFriendStage, type PublicReportFriend } from '@/lib/pastoralFriendProgress';

const friend = (partial: Partial<PublicReportFriend> = {}): PublicReportFriend => ({
  key: '2026-sunday/friend', name: '합성 학생', part: '1', grade: '1', ...partial,
});

describe('통합사이트 새친구 공개 진행 현황과 같은 단계', () => {
  it.each([
    [{}, '1주차'],
    [{ week1Date: '2026-09-06' }, '2주차'],
    [{ week2Date: '2026-09-13' }, '등록 결정'],
    [{ decision: '등록' }, '반배정'],
    [{ assignedClassKey: '1-1-1' }, '출석부 반영'],
    [{ rosterSync: { studentId: 'nf_friend', classKey: '1-1-1' } }, '완료'],
    [{ giftDate: '2026-09-20' }, '완료'],
    [{ decision: '보류', rosterSync: { studentId: 'nf_friend', classKey: '1-1-1' } }, '보류'],
    [{ decision: '미등록', rosterSync: { studentId: 'nf_friend', classKey: '1-1-1' } }, '종료'],
  ] as const)('%j → %s', (input, expected) => {
    expect(deriveNewFriendStage(friend(input))).toBe(expected);
  });

  it('과거 giftDate 완료와 실제 rosterSync 출석부 반영은 구분한다', () => {
    const legacy = friend({ giftDate: '2026-09-20' });
    expect(deriveNewFriendRosterProgress(legacy)).toBe('완료');
    expect(legacy.rosterSync).toBeUndefined();
    const synced = friend({ rosterSync: { studentId: 'nf_friend', classKey: '1-1-1' } });
    expect(deriveNewFriendRosterProgress(synced)).toBe('완료');
    expect(synced.rosterSync).toBeDefined();
  });

  it.each([
    [{}, '대기'],
    [{ week1Date: '2026-09-06' }, '대기'],
    [{ week2Date: '2026-09-13' }, '처리중'],
    [{ decision: '등록' }, '처리중'],
    [{ assignedClassKey: '1-1-1' }, '처리중'],
  ] as const)('3단계 %j → %s', (input, expected) => {
    expect(deriveNewFriendRosterProgress(friend(input))).toBe(expected);
  });
});
