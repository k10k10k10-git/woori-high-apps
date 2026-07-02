import { describe, it, expect } from 'vitest';
import { buildSyncPlan, buildSyncPayload, parseCSV, parseClassCsv, type ParsedClass, type ParsedStudent } from '@/lib/sheetSync';
import type { Student } from '@/types';

function st(o: Partial<ParsedStudent> & { name: string; sid: string; num: number }): ParsedStudent {
  return { school: '', birth: '', phone: '', pphone: '', addr: '', attendance: {}, ...o };
}
function cls(ck: string, students: ParsedStudent[]): ParsedClass {
  const [part, grade, classNum] = ck.split('-');
  return { ck, part, grade: +grade, classNum: +classNum, teacher: '', students };
}
type Cur = Record<string, { students?: Record<string, Student> }>;

describe('buildSyncPlan 복합 매칭', () => {
  it('고유 이름은 필드 없이도 같은 인물로 인정 (오탐 없음)', () => {
    const classes = [cls('1-1-1', [st({ name: '홍길동', sid: 'S11_01', num: 1 })])];
    const cur: Cur = { '1-1-1': { students: { S11_01: { id: 'S11_01', name: '홍길동' } } } };
    const plan = buildSyncPlan(classes, cur);
    expect(plan.added).toHaveLength(0);
    expect(plan.moved).toHaveLength(0);
    expect(plan.removed).toHaveLength(0);
  });

  it('다른 반 + 필드 2개 이상 일치 → 반 이동으로 인식', () => {
    const classes = [cls('1-1-2', [st({ name: '홍길동', sid: 'S12_01', num: 1, birth: '2010. 02. 02', phone: '010-1234-5678' })])];
    const cur: Cur = { '1-1-1': { students: { S11_01: { id: 'S11_01', name: '홍길동', birth: '2010.02.02', phone: '01012345678' } } } };
    const plan = buildSyncPlan(classes, cur);
    expect(plan.moved).toEqual([{ name: '홍길동', fromCk: '1-1-1', toCk: '1-1-2' }]);
  });

  it('다른 반 + 비교 필드 없음 → 확인 필요(ambiguous), 이동 아님', () => {
    const classes = [cls('1-1-2', [st({ name: '홍길동', sid: 'S12_01', num: 1 })])];
    const cur: Cur = { '1-1-1': { students: { S11_01: { id: 'S11_01', name: '홍길동' } } } };
    const plan = buildSyncPlan(classes, cur);
    expect(plan.moved).toHaveLength(0);
    expect(plan.ambiguous).toEqual([{ ck: '1-1-2', name: '홍길동' }]);
  });

  it('동명이인 — 필드 2개 이상 일치하면 올바른 인물로 매칭', () => {
    const classes = [
      cls('1-1-1', [st({ name: '김민수', sid: 'S11_01', num: 1, birth: '2010. 03. 01', phone: '010-1111-2222' })]),
    ];
    const cur: Cur = {
      '1-1-1': { students: { S11_01: { id: 'S11_01', name: '김민수', birth: '2010.03.01', phone: '01011112222' } } },
      '1-2-3': { students: { S23_05: { id: 'S23_05', name: '김민수', birth: '2009.05.05', phone: '01099998888' } } },
    };
    const plan = buildSyncPlan(classes, cur);
    expect(plan.added).toHaveLength(0);
    expect(plan.ambiguous).toHaveLength(0);
    expect(plan.moved).toHaveLength(0); // 같은 반(1-1-1)으로 매칭 → 이동 아님
  });

  it('동명이인 — 일치 필드 부족하면 ambiguous(신규 처리)', () => {
    const classes = [cls('1-1-1', [st({ name: '김민수', sid: 'S11_01', num: 1, birth: '2010. 03. 01' })])];
    const cur: Cur = {
      '1-2-1': { students: { a: { id: 'a', name: '김민수' } } },
      '1-3-1': { students: { b: { id: 'b', name: '김민수' } } },
    };
    const plan = buildSyncPlan(classes, cur);
    expect(plan.ambiguous).toEqual([{ ck: '1-1-1', name: '김민수' }]);
    expect(plan.moved).toHaveLength(0);
  });

  it('다른 반 동명이인을 이동으로 오인하지 않음 (신규 박하민 vs 기존 박하민)', () => {
    // 시트: 1부1학년1반에 신규 박하민(B) — 필드 보유
    const classes = [cls('1-1-1', [st({ name: '박하민', sid: 'S11_01', num: 1, birth: '2011. 05. 13', phone: '010-3765-4474' })])];
    // 현재: 2부1학년3반에 다른 박하민(A) — 필드 다름 (후보 1명뿐)
    const cur: Cur = { '2-1-3': { students: { S13_07: { id: 'S13_07', name: '박하민', birth: '2010.01.01', phone: '01099990000' } } } };
    const plan = buildSyncPlan(classes, cur);
    expect(plan.moved).toHaveLength(0);                       // 이동 아님
    expect(plan.added).toEqual([{ ck: '1-1-1', name: '박하민' }]); // 신규
  });

  it('신규 학생은 added, 시트에서 사라진 학생은 removed', () => {
    const classes = [cls('1-1-1', [st({ name: '신입생', sid: 'S11_01', num: 1 })])];
    const cur: Cur = { '1-1-1': { students: { S11_09: { id: 'S11_09', name: '전학간학생' } } } };
    const plan = buildSyncPlan(classes, cur);
    expect(plan.added).toEqual([{ ck: '1-1-1', name: '신입생' }]);
    expect(plan.removed).toEqual([{ ck: '1-1-1', name: '전학간학생' }]);
  });
});

describe('buildSyncPayload 제외 학생 처리', () => {
  it('기본(removeMissing=false): 제외 학생을 해당 반에 유지', () => {
    const classes = [cls('1-1-1', [st({ name: '재학생', sid: 'S11_01', num: 1 })])];
    const cur: Cur = { '1-1-1': { students: {
      S11_01: { id: 'S11_01', name: '재학생' },
      S11_09: { id: 'S11_09', name: '이동간학생' },
    } } };
    const plan = buildSyncPlan(classes, cur);
    const payload = buildSyncPayload(plan, 2026, cur, false) as Record<string, Record<string, unknown>>;
    const students = payload['classes/2026/1-1-1/students'];
    expect(Object.keys(students).sort()).toEqual(['S11_01', 'S11_09']); // 유지됨
  });

  it('removeMissing=true: 제외 학생 삭제', () => {
    const classes = [cls('1-1-1', [st({ name: '재학생', sid: 'S11_01', num: 1 })])];
    const cur: Cur = { '1-1-1': { students: {
      S11_01: { id: 'S11_01', name: '재학생' },
      S11_09: { id: 'S11_09', name: '이동간학생' },
    } } };
    const plan = buildSyncPlan(classes, cur);
    const payload = buildSyncPayload(plan, 2026, cur, true) as Record<string, Record<string, unknown>>;
    const students = payload['classes/2026/1-1-1/students'];
    expect(Object.keys(students)).toEqual(['S11_01']); // 삭제됨
  });
});

describe('parseClassCsv 제목행 형식', () => {
  // 헤더 3행(제목/월/일) + 학생 1명
  const mkRows = (title: string): string[][] => [
    ['', '', '', '', title],
    ['순', '성명', '학교', '생년월일', '1월'],
    ['', '', '학생 전화번호', '학부모 연락처', '4'],
    ['1', '홍길동', '○○고', '2010.01.01'],
  ];
  it('1부 형식 "1학년 1반" 인식', () => {
    const pc = parseClassCsv(mkRows('1부 1학년 1반 김태훈 선생님'), '1', 2026);
    expect(pc?.ck).toBe('1-1-1');
    expect(pc?.teacher).toBe('김태훈');
  });
  it('2부 형식 "1-3반" 인식', () => {
    const pc = parseClassCsv(mkRows('2부 1-3반 이은총 선생님'), '2', 2026);
    expect(pc?.ck).toBe('2-1-3');
    expect(pc?.teacher).toBe('이은총');
  });
  it('비반 탭(전체학생명단)은 null', () => {
    expect(parseClassCsv(mkRows('2부 전체 학생 명단 학년 반 담임'), '2', 2026)).toBeNull();
  });

  it('번호 재시작(1,2→1) 이후 학생은 장결자로 표시 + sid 충돌 방지(J 접두사)', () => {
    const rows: string[][] = [
      ['', '', '', '', '1부 1학년 1반 김태훈 선생님'],
      ['순', '성명', '학교', '생년월일', '1월'],
      ['', '', '학생 전화번호', '학부모 연락처', '4'],
      ['1', '평시가', '○○고', '2010.01.01'],
      ['2', '평시나', '○○고', '2010.01.02'],
      ['1', '장결다', '○○고', '2010.01.03'],
    ];
    const pc = parseClassCsv(rows, '1', 2026)!;
    expect(pc.students.map(s => s.name)).toEqual(['평시가', '평시나', '장결다']);
    expect(pc.students.map(s => s.jang)).toEqual([false, false, true]);
    // 평시 1번과 장결 1번의 sid가 겹치지 않아야 함
    expect(pc.students[0].sid).toBe('S11_01');
    expect(pc.students[2].sid).toBe('S11_J01');
  });
});

describe('parseCSV', () => {
  it('따옴표 안 줄바꿈/쉼표를 한 셀로 처리', () => {
    const rows = parseCSV('a,"b\nc",d\n1,"2,3",4');
    expect(rows[0]).toEqual(['a', 'b\nc', 'd']);
    expect(rows[1]).toEqual(['1', '2,3', '4']);
  });
});
