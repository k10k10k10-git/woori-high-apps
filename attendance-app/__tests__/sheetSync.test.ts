import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildSyncPlan, buildSyncPayload, describeSheetSyncForClass, parseCSV, parseClassCsv, type ParsedClass, type ParsedStudent, type SyncPlan } from '@/lib/sheetSync';
import type { Student } from '@/types';

function st(o: Partial<ParsedStudent> & { name: string; sid: string; num: number }): ParsedStudent {
  // jang은 ParsedStudent에서 필수다. 모든 사용처가 참/거짓 판정뿐이라 false와 undefined의
  // 동작은 같으므로(sheetSync.ts는 `st.jang ? {jang:true} : {}`) 기존 케이스 의미가 바뀌지 않는다.
  return { school: '', birth: '', phone: '', pphone: '', addr: '', jang: false, attendance: {}, ...o };
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

describe('반 이동 시 옛 반 출석 기록 이관·정리', () => {
  // 시트에서 1부1-1 → 1부1-2로 옮긴 학생. 옛 경로의 출석이 고아로 남던 문제.
  const movedClasses = () => [cls('1-1-2', [st({
    name: '홍길동', sid: 'S12_01', num: 1,
    birth: '2010. 02. 02', phone: '010-1234-5678',
    attendance: { '0-0': 'O', '0-1': 'X' },
  })])];
  const movedCurrent = (): Cur => ({
    '1-1-1': { students: { S11_01: { id: 'S11_01', name: '홍길동', birth: '2010.02.02', phone: '01012345678' } } },
    '1-1-2': { students: {} },
  });
  const oldAttendance = () => ({
    '1-1-1': { S11_01: { '0-0': 'O', '0-1': 'O', '1-0': 'T', '2-3': 'O' } },
  } as Record<string, Record<string, Record<string, 'O' | 'X' | 'T'>>>);

  it('옛 반의 출석 경로를 지워 고아 기록을 남기지 않는다', () => {
    const plan = buildSyncPlan(movedClasses(), movedCurrent(), oldAttendance());
    const payload = buildSyncPayload(plan, 2026, movedCurrent(), false, undefined, oldAttendance());
    expect(payload['attendance/2026/1-1-1/S11_01']).toBeNull();
  });

  it('시트에 없는 칸은 새 반으로 옮겨 이력을 보존한다', () => {
    const plan = buildSyncPlan(movedClasses(), movedCurrent(), oldAttendance());
    const payload = buildSyncPayload(plan, 2026, movedCurrent(), false, undefined, oldAttendance());
    // 시트에 없던 이전 지각 '1-0'도 출석으로 바꿔 새 경로로 이관한다.
    expect(payload['attendance/2026/1-1-2/S12_01/1-0']).toBe('O');
    expect(payload['attendance/2026/1-1-2/S12_01/2-3']).toBe('O');
  });

  it('시트에 값이 있는 칸은 시트 값을 유지한다(옛 값이 덮지 않는다)', () => {
    const plan = buildSyncPlan(movedClasses(), movedCurrent(), oldAttendance());
    const payload = buildSyncPayload(plan, 2026, movedCurrent(), false, undefined, oldAttendance());
    // 옛 기록은 '0-1'이 'O'였지만 시트가 'X'이므로 시트가 이긴다
    expect(payload['attendance/2026/1-1-2/S12_01/0-1']).toBe('X');
    expect(payload['attendance/2026/1-1-2/S12_01/0-0']).toBe('O');
  });

  it('미리보기가 이관·대체 칸 수를 알려준다', () => {
    const plan = buildSyncPlan(movedClasses(), movedCurrent(), oldAttendance());
    expect(plan.attendanceMoves).toEqual([
      { name: '홍길동', fromCk: '1-1-1', toCk: '1-1-2', carried: 2, superseded: 2 },
    ]);
  });

  it('같은 반에 남은 학생의 출석은 건드리지 않는다', () => {
    const classes = [cls('1-1-1', [st({ name: '홍길동', sid: 'S11_01', num: 1, attendance: { '0-0': 'O' } })])];
    const cur: Cur = { '1-1-1': { students: { S11_01: { id: 'S11_01', name: '홍길동' } } } };
    const att = { '1-1-1': { S11_01: { '5-2': 'O' } } } as Record<string, Record<string, Record<string, 'O' | 'X' | 'T'>>>;
    const payload = buildSyncPayload(buildSyncPlan(classes, cur, att), 2026, cur, false, undefined, att);
    expect(payload['attendance/2026/1-1-1/S11_01']).toBeUndefined();
  });

  it('출석 데이터를 넘기지 않으면 삭제도 이관도 하지 않는다(기존 동작 유지)', () => {
    const plan = buildSyncPlan(movedClasses(), movedCurrent());
    const payload = buildSyncPayload(plan, 2026, movedCurrent(), false, undefined);
    expect(payload['attendance/2026/1-1-1/S11_01']).toBeUndefined();
    expect(plan.attendanceMoves).toEqual([]);
  });
});

describe('행정 변동 사항 - 시트 동기화 기록', () => {
  const plan = (over: Partial<SyncPlan> = {}): SyncPlan => ({
    classes: [], added: [], moved: [], removed: [], ambiguous: [],
    attendanceMoves: [], attendanceChanges: 0, totalStudents: 0, classCount: 0, jangCount: 0,
    ...over,
  });

  it('변동이 없는 반은 기록을 만들지 않는다', () => {
    // 예전에는 모든 반에 "신규 0명 · 이동 0명"이 쌓여 정작 바뀐 반을 찾을 수 없었다.
    expect(describeSheetSyncForClass(plan(), '1-2-9', false)).toBeNull();
    const other = plan({ added: [{ ck: '1-1-1', name: '김철수' }] });
    expect(describeSheetSyncForClass(other, '1-2-9', false)).toBeNull();
  });

  it('신규 학생의 이름을 적는다', () => {
    const p = plan({ added: [{ ck: '1-2-9', name: '김철수' }, { ck: '1-2-9', name: '이민수' }] });
    const out = describeSheetSyncForClass(p, '1-2-9', false);
    expect(out?.studentName).toBe('신규 2명');
    expect(out?.changeSummary).toContain('신규 2명 (김철수, 이민수)');
  });

  it('전입은 어느 반에서 왔는지, 전출은 어느 반으로 갔는지 적는다', () => {
    const p = plan({ moved: [{ name: '박영희', fromCk: '1-2-3', toCk: '1-2-9' }] });
    expect(describeSheetSyncForClass(p, '1-2-9', false)?.changeSummary).toContain('전입 1명 (박영희←1부 2-3)');
    // 보내는 반에도 기록이 남아야 한다 — 받는 반에만 남기면 명단이 조용히 줄어든다.
    expect(describeSheetSyncForClass(p, '1-2-3', false)?.changeSummary).toContain('전출 1명 (박영희→1부 2-9)');
  });

  it('제외는 removeMissing을 켠 동기화에서만 기록한다', () => {
    const p = plan({ removed: [{ ck: '1-2-9', name: '최지훈' }] });
    expect(describeSheetSyncForClass(p, '1-2-9', false)).toBeNull();
    expect(describeSheetSyncForClass(p, '1-2-9', true)?.changeSummary).toContain('제외 1명 (최지훈)');
  });

  it('이름이 많으면 앞 5명만 적고 나머지는 수로 줄인다', () => {
    const names = ['가', '나', '다', '라', '마', '바', '사'];
    const p = plan({ added: names.map((name) => ({ ck: '1-2-9', name })) });
    const out = describeSheetSyncForClass(p, '1-2-9', false);
    expect(out?.changeSummary).toContain('신규 7명 (가, 나, 다, 라, 마 외 2명)');
  });

  it('여러 종류가 겹치면 학생 칸엔 건수만, 변경내용엔 이름을 적는다', () => {
    const p = plan({
      added: [{ ck: '1-2-9', name: '김철수' }],
      moved: [{ name: '박영희', fromCk: '1-2-3', toCk: '1-2-9' }],
    });
    const out = describeSheetSyncForClass(p, '1-2-9', false);
    expect(out?.studentName).toBe('신규 1명 · 전입 1명');
    expect(out?.changeSummary).toBe('구글 시트 명단·출석 반영 · 신규 1명 (김철수) · 전입 1명 (박영희←1부 2-3)');
  });
});

describe('주일 당일 동기화 - 앱에서 입력한 출석을 덮지 않는다', () => {
  // 2026-08-23(일)에 실제로 겪은 사고. 시트에는 아직 그날 출석을 안 옮겨 적었는데
  // 동기화하면 빈칸이 "지난 주일인데 결석"으로 해석돼 앱 입력이 전부 X로 덮였다.
  // 경계가 하루만 밀려도 출석이 통째로 뒤집히므로 양쪽을 다 고정한다.
  //
  // 시트 구조: 0행 제목 / 1행 월 / 2행 일 / 3행부터 학생. 출석 열은 4열부터.
  const rows = (): string[][] => [
    ['1부 1학년 1반 김태훈 선생님'],
    ['', '', '', '', '8월', '', '', ''],
    ['', '', '', '', '16', '23', '', ''],
    ['1', '홍길동', '우리중', '2009-03-11', '', ''],
  ];

  afterEach(() => { vi.useRealTimers(); });

  function attendanceOf(nowIso: string) {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(nowIso));
    const pc = parseClassCsv(rows(), '1', 2026);
    return pc?.students[0]?.attendance ?? {};
  }

  it('일요일 당일에는 그날 열을 건드리지 않는다', () => {
    // 8/23(일) 낮. 시트의 8/23 칸이 비어 있어도 결석으로 기록하면 안 된다.
    const att = attendanceOf('2026-08-23T03:00:00Z');
    const keys = Object.keys(att);
    expect(keys).not.toHaveLength(0);           // 8/16은 판정돼야 한다
    const todayCell = Object.entries(att).find(([, v]) => v === 'X' && keys.length === 2);
    expect(todayCell).toBeUndefined();
    expect(Object.values(att).filter(v => v === 'X')).toHaveLength(1); // 8/16만 X
  });

  it('다음 날(월)에는 지난 주일이 되어 결석으로 기록한다', () => {
    // 8/24(월). 이제 8/23은 끝난 예배이므로 빈칸은 결석이 맞다.
    const att = attendanceOf('2026-08-24T03:00:00Z');
    expect(Object.values(att).filter(v => v === 'X')).toHaveLength(2); // 8/16·8/23 둘 다
  });

  it('토요일에도 다가올 주일을 미리 결석 처리하지 않는다', () => {
    const att = attendanceOf('2026-08-22T03:00:00Z');
    expect(Object.values(att).filter(v => v === 'X')).toHaveLength(1);
  });
});
