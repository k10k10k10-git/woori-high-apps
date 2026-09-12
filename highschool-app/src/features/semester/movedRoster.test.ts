import { describe, expect, it } from 'vitest';
import { applicationForRosterPerson } from './applicant';
import { buildRosterContactMap } from './rosterContact';
import type { Application } from './types';

describe('반 이동 뒤 기존 학기 신청 보존', () => {
  const application = { id: '2_S17_05', studentId: 'S17_05', bu: '2부', personId: 'person_student_moved' } as Application;
  it('부서와 ID가 모두 바뀌어도 기존 신청 키를 반환한다', () => {
    expect(applicationForRosterPerson([application], { bu: '1부', studentId: '-new', personId: application.personId })).toBe(application);
    expect(applicationForRosterPerson([application], { bu: '2부', studentId: 'S17_05', personId: 'person_student_other' })).toBeUndefined();
    expect(applicationForRosterPerson([application, { ...application, id: 'duplicate' }], { bu: '1부', studentId: '-new', personId: application.personId })).toBeUndefined();
  });
  it('과거 신청 키에 현재 동일인의 연락처만 연결한다', () => {
    const map = buildRosterContactMap([{ classKey: '1-1-7', students: {
      S17_05: { name: '기존 학생', personId: 'person_student_other', phone: '기존' },
      '-new': { name: '이동 학생', personId: application.personId, phone: '이동' },
    } }], [], [application]);
    expect(map[application.id]).toEqual({ phone: '이동' });
    expect(map['1_S17_05']).toEqual({ phone: '기존' });
  });
});
