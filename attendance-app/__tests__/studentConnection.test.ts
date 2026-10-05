import { describe, expect, it } from 'vitest';
import { resolveStudentConnection, type StudentCandidate } from '@/utils/studentConnection';

const candidate = (fields: Partial<StudentCandidate['student']> = {}, classKey = '1-1-1'): StudentCandidate => ({ classKey, student: { id: 's1', name: '합성학생', ...fields } });
describe('동일 학생 연결', () => {
  it('SID 충돌보다 유일한 personId를 우선하고 부서·반 이동과 이름 변경을 허용한다', () => {
    const moved = candidate({ id: 'new', name: '변경이름', personId: 'person_student_a' }, '2-1-7');
    expect(resolveStudentConnection({ id: 's1', name: '합성학생', personId: 'person_student_a' }, [candidate({ personId: 'person_student_b' }), moved])).toEqual({ status: 'matched', candidate: moved });
  });
  it('같은 키와 이름이어도 personId가 다르면 연결하지 않는다', () => {
    expect(resolveStudentConnection({ id: 's1', name: '합성학생', personId: 'a', birth: '2010.01.01' }, [candidate({ personId: 'b', birth: '2010.01.01' })])).toEqual({ status: 'review' });
  });
  it('같은 SID나 이름·학교·보호자 연락처만으로 과거 이력을 연결하지 않는다', () => {
    expect(resolveStudentConnection({ id: 's1', name: '합성학생' }, [candidate()])).toEqual({ status: 'review' });
    expect(resolveStudentConnection({ name: '합성학생' }, [candidate({ school: '합성고', pphone: '00000000000' })])).toEqual({ status: 'review' });
  });
  it('레거시 이름·생년월일 또는 본인 전화의 유일한 일치를 연결한다', () => {
    const row = candidate({ birth: '2010.01.01', phone: '010-0000-1111' });
    expect(resolveStudentConnection({ name: '합성학생', birth: '20100101' }, [row])).toEqual({ status: 'matched', candidate: row });
    expect(resolveStudentConnection({ name: '합성학생', phone: '01000001111' }, [row])).toEqual({ status: 'matched', candidate: row });
  });
  it('신상정보 충돌과 동명이인·중복 personId는 확인 대상으로 남긴다', () => {
    expect(resolveStudentConnection({ name: '합성학생', birth: '20100101', phone: '01000001111' }, [candidate({ birth: '2010.02.02', phone: '01000001111' })])).toEqual({ status: 'review' });
    expect(resolveStudentConnection({ name: '합성학생', birth: '20100101' }, [candidate({ birth: '20100101' }), candidate({ id: 's2', birth: '20100101' })])).toEqual({ status: 'review' });
    expect(resolveStudentConnection({ name: '합성학생', personId: 'a' }, [candidate({ personId: 'a' }), candidate({ id: 's2', personId: 'a' })])).toEqual({ status: 'review' });
  });
  it('옛 심방의 SID가 연도 전체에서 유일하면 이동 후에도 찾고, 충돌하면 보류한다', () => {
    const moved = candidate({}, '2-1-7');
    expect(resolveStudentConnection({ id: 's1', name: '합성학생' }, [moved], true)).toEqual({ status: 'matched', candidate: moved });
    expect(resolveStudentConnection({ id: 's1', name: '합성학생' }, [moved, candidate({ name: '다른학생' })], true)).toEqual({ status: 'review' });
  });
  it('아무 후보도 없으면 연결 명단 없음으로 구분한다', () => {
    expect(resolveStudentConnection({ id: 'new', name: '새이름' }, [candidate()])).toEqual({ status: 'missing' });
  });
});
