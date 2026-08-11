import { describe, it, expect } from 'vitest';
import {
  parseClassKey, buildDemoRole,
  buildDemoOptionsFromRoles, buildDemoOptionsFromClasses,
} from '@/lib/demo';

// 데모 모드는 테스트 기간 한정 기능이지만, 반 키 해석이 틀리면
// 엉뚱한 반이 열리므로(=다른 반 학생 정보 노출) 순수 로직만 따로 지킨다.
describe('parseClassKey', () => {
  it('부-학년-반을 분리한다', () => {
    expect(parseClassKey('1-2-3')).toEqual({ part: '1', grade: '2', cls: '3' });
    expect(parseClassKey('2-3-11')).toEqual({ part: '2', grade: '3', cls: '11' });
  });

  it('형식이 아니면 null', () => {
    expect(parseClassKey('')).toBeNull();
    expect(parseClassKey('1-2')).toBeNull();
    expect(parseClassKey('1-2-3-4')).toBeNull();
    expect(parseClassKey('1--3')).toBeNull();
  });
});

describe('buildDemoRole', () => {
  it('고른 반을 담임 교사 역할로 만든다 — role은 반드시 teacher', () => {
    const role = buildDemoRole({ ck: '1-2-3', teacherName: '김선생' });
    expect(role).not.toBeNull();
    expect(role!.role).toBe('teacher'); // admin이 되면 전체 반이 보인다
    expect(role!.part).toBe('1');
    expect(role!.grade).toBe('2');
    expect(role!.class).toBe('3');
  });

  it('행정 이력에서 실제 담임과 구분되도록 이름에 (데모)를 붙인다', () => {
    expect(buildDemoRole({ ck: '1-2-3', teacherName: '김선생' })!.name).toBe('김선생 (데모)');
  });

  it('담임 이름이 없으면 반 이름으로 대체한다', () => {
    expect(buildDemoRole({ ck: '2-1-4', teacherName: '' })!.name).toBe('2부 1학년 4반 (데모)');
  });

  it('잘못된 반 키면 null — 역할을 만들지 않는다', () => {
    expect(buildDemoRole({ ck: 'oops', teacherName: '김선생' })).toBeNull();
  });
});

describe('buildDemoOptionsFromRoles', () => {
  const roles = {
    a: { role: 'teacher' as const, part: '1', grade: '2', class: '3', name: '김선생' },
    b: { role: 'admin' as const, name: '관리자' },                                  // 관리자는 반이 아니다
    c: { role: 'teacher' as const, part: '1', grade: '2', class: '10', name: '이선생' },
    d: { role: 'teacher' as const, part: '1', grade: '1', class: '1', name: '박선생' },
    e: { role: 'teacher' as const, part: '1', name: '반없음' },                     // part만 있고 반이 없다
    f: { role: 'teacher' as const, part: '1', grade: '2', class: '3', name: '중복' }, // 같은 반 두 번째 계정
  };

  it('교사 계정만, 반 하나당 하나만 남긴다', () => {
    expect(buildDemoOptionsFromRoles(roles).map(o => o.ck)).toEqual(['1-1-1', '1-2-3', '1-2-10']);
  });

  it('반 번호는 문자열이 아니라 숫자로 정렬한다 (10반이 3반보다 뒤)', () => {
    const cks = buildDemoOptionsFromRoles(roles).map(o => o.ck);
    expect(cks.indexOf('1-2-3')).toBeLessThan(cks.indexOf('1-2-10'));
  });

  it('담임 이름을 함께 싣는다', () => {
    expect(buildDemoOptionsFromRoles(roles)[0].teacherName).toBe('박선생');
  });

  it('명단이 없으면 빈 배열', () => {
    expect(buildDemoOptionsFromRoles(null)).toEqual([]);
    expect(buildDemoOptionsFromRoles({})).toEqual([]);
  });
});

describe('buildDemoOptionsFromClasses', () => {
  it('반 노드에서 목록을 만들고 형식이 깨진 키는 버린다', () => {
    const result = buildDemoOptionsFromClasses({
      '2-1-2': { teacher: '최선생' },
      '1-1-1': { teacher: '한선생' },
      'broken': { teacher: '무시' },
    });
    expect(result.map(o => o.ck)).toEqual(['1-1-1', '2-1-2']);
    expect(result[1].teacherName).toBe('최선생');
  });

  it('담임이 비어 있어도 목록에는 남는다', () => {
    expect(buildDemoOptionsFromClasses({ '1-3-2': {} })[0]).toMatchObject({ ck: '1-3-2', teacherName: '' });
  });
});
