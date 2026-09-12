import { describe, expect, it } from 'vitest';
import { buildStudentMovePayload, isValidStudentMoveDestination } from '@/utils/studentMove';
import type { AdminChangeEntry } from '@/utils/adminChange';
import type { Student } from '@/types';

const student: Student = {
  id: 'S11_01',
  personId: 'person_student_1',
  name: '홍길동',
  num: 1,
};

const adminChange: AdminChangeEntry = {
  changedAt: '2026-09-05T00:00:00.000Z',
  changedAtMs: 1_788_547_200_000,
  classKey: '1-1-2',
  teacher: '담임',
  studentId: student.id,
  personId: student.personId,
  studentName: student.name,
  action: '반 이동',
  changeSummary: '1반에서 2반으로 이동',
  result: '반영 완료',
  actor: '관리자',
};

const base = {
  year: 2026,
  fromCk: '1-1-1',
  toCk: '1-1-2',
  student,
  lockPaths: [
    'config/studentMoveLocks/2026/1-1-1/admin_uid/student_move_123_nonce',
    'config/studentMoveLocks/2026/1-1-2/admin_uid/student_move_123_nonce',
  ] as const,
  commitPath: 'config/studentMoveCommits/2026/1-1-1/1-1-2/S11_01/admin_uid/student_move_123_nonce',
  adminChangePath: 'classes/2026/1-1-2/adminChanges/change_1',
  adminChange,
};

describe('buildStudentMovePayload', () => {
  it('학생 이동·dual lock 해제·불변 commit marker·행정 이력을 한 payload에 묶는다', () => {
    const payload = buildStudentMovePayload(base);

    expect(payload).toEqual({
      'classes/2026/1-1-1/students/S11_01': null,
      'classes/2026/1-1-2/students/S11_01': student,
      'config/studentMoveLocks/2026/1-1-1/admin_uid/student_move_123_nonce': null,
      'config/studentMoveLocks/2026/1-1-2/admin_uid/student_move_123_nonce': null,
      'config/studentMoveCommits/2026/1-1-1/1-1-2/S11_01/admin_uid/student_move_123_nonce': true,
      'classes/2026/1-1-2/adminChanges/change_1': adminChange,
    });
  });

  it('원래 반 출석을 목적지로 옮기고 옛 경로를 같은 payload에서 지운다', () => {
    const payload = buildStudentMovePayload({
      ...base,
      sourceAttendance: { '0-0': 'O', '0-1': 'T' },
    });

    expect(payload['attendance/2026/1-1-1/S11_01']).toBeNull();
    expect(payload['attendance/2026/1-1-2/S11_01']).toEqual({ '0-0': 'O', '0-1': 'O' });
  });

  it('목적지 출석은 동일인으로 추정해 병합하지 않고 거절한다', () => {
    const sourceAttendance = { '0-0': 'O', '0-1': 'T', '1-0': 'X' } as const;
    const destinationAttendance = { '0-1': 'O', '2-0': 'T' } as const;
    expect(() => buildStudentMovePayload({
      ...base,
      sourceAttendance,
      destinationAttendance,
    })).toThrow('덮어쓸 수 없습니다');
    expect(sourceAttendance).toEqual({ '0-0': 'O', '0-1': 'T', '1-0': 'X' });
    expect(destinationAttendance).toEqual({ '0-1': 'O', '2-0': 'T' });
  });

  it('비운 셀만 남은 목적지도 점유된 기록으로 보호한다', () => {
    expect(() => buildStudentMovePayload({
      ...base,
      sourceAttendance: { '0-0': 'O', '0-1': 'T' },
      destinationAttendance: { '0-0': '' },
    })).toThrow('덮어쓸 수 없습니다');
  });

  it('원본 출석이 없으면 목적지 출석을 다시 쓰거나 원본 경로를 추측 삭제하지 않는다', () => {
    const payload = buildStudentMovePayload(base);

    expect(payload['attendance/2026/1-1-1/S11_01']).toBeUndefined();
    expect(payload['attendance/2026/1-1-2/S11_01']).toBeUndefined();
  });

  it('새 목적지 ID로만 학생·출석·이력을 옮겨 기존 슬롯을 전혀 쓰지 않는다', () => {
    const payload = buildStudentMovePayload({ ...base, destinationId: '-new-key', sourceAttendance: { '0-0': 'X' } });
    expect(payload['classes/2026/1-1-2/students/S11_01']).toBeUndefined();
    expect(payload['attendance/2026/1-1-2/S11_01']).toBeUndefined();
    expect(payload['classes/2026/1-1-2/students/-new-key']).toEqual({ ...student, id: '-new-key' });
    expect(payload['attendance/2026/1-1-2/-new-key']).toEqual({ '0-0': 'X' });
    expect(payload[base.adminChangePath]).toEqual({ ...adminChange, studentId: '-new-key' });
    expect(student.id).toBe('S11_01');
  });

  it('목적지에 학생이 있으면 출석 유무와 관계없이 중단한다', () => {
    expect(() => buildStudentMovePayload({ ...base, destinationStudent: { name: '다른 학생' } })).toThrow('덮어쓸 수 없습니다');
  });

  it('같은 반으로의 이동 payload는 만들지 않는다', () => {
    expect(() => buildStudentMovePayload({ ...base, toCk: base.fromCk })).toThrow(
      '학생 이동의 원본 반과 목적지 반이 같습니다.',
    );
  });
});

describe('isValidStudentMoveDestination', () => {
  const classKeys = ['1-1-1', '1-1-2', '2-2-3'];

  it('현재 명단에 존재하는 다른 반만 허용한다', () => {
    expect(isValidStudentMoveDestination(classKeys, '1-1-1', '1-1-2')).toBe(true);
    expect(isValidStudentMoveDestination(classKeys, '1-1-1', '2-2-3')).toBe(true);
  });

  it('부·학년 변경 뒤 남은 반 번호로 만든 유령 반과 원래 반을 거부한다', () => {
    expect(isValidStudentMoveDestination(classKeys, '1-1-1', '2-1-2')).toBe(false);
    expect(isValidStudentMoveDestination(classKeys, '1-1-1', '1-1-1')).toBe(false);
    expect(isValidStudentMoveDestination(classKeys, '1-1-1', '')).toBe(false);
  });
});
