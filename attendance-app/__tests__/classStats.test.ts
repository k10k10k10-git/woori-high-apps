import { describe, expect, it } from 'vitest';
import { calcStats, type AppState } from '@/store/AppContext';
import { activeAndLongAbsentStudents } from '@/utils/attendanceWorkflow';
import { buildClassStats } from '@/utils/classStats';
import { getSundaysForYear } from '@/utils/dates';
import type { AttData, AttValue, Student, ViewKey } from '@/types';

type StatsSource = Pick<AppState, 'months' | 'curView' | 'attData' | 'events'>;
const classKey = '1-1-1';

function makeSource(curView: ViewKey = 'all'): StatsSource {
  return {
    months: [
      { month: 1, sundays: [4, 11, 18, 25] },
      { month: 6, sundays: [7, 14, 21, 28] },
      { month: 7, sundays: [5, 12, 19, 26] },
    ],
    curView,
    events: { '0-0': '행사', '2-1': '수련회' },
    attData: {
      [classKey]: {
        perfect: { '0-0': 'X', '0-1': 'O', '1-0': 'O', '2-0': 'O' },
        mixed: { '0-1': 'O', '0-2': 'X', '1-0': 'T', '2-0': 'O', '2-1': 'X' },
        absent: { '0-1': 'X', '1-0': 'X', '2-0': 'T' },
        empty: { '0-1': '', '1-0': '' },
        longAbsent: { '0-1': 'O', '1-0': 'O' },
      },
    },
  };
}

// 기존 화면의 독립된 다섯 계산을 특성화해 데이터셋 순서와 등급·경고 기준을 보존한다.
function legacySummary(source: StatsSource, students: Student[]) {
  const warningStudents = students.map(student => {
    const { present, absent, tardy, rate } = calcStats(source, classKey, student.id);
    const recorded = present + absent + tardy;
    const grade = rate >= 90 ? 'A' : rate >= 80 ? 'B' : rate >= 70 ? 'C' : 'D';
    return { ...student, present, absent, tardy, recorded, rate, grade };
  }).filter(student => student.recorded > 0 && student.rate < 50)
    .sort((a, b) => a.rate - b.rate);
  const present = students.map(student => calcStats(source, classKey, student.id).present);
  const absent = students.map(student => calcStats(source, classKey, student.id).absent);
  const tardy = students.map(student => calcStats(source, classKey, student.id).tardy);
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0 };
  for (const student of students) {
    const stats = calcStats(source, classKey, student.id);
    const recorded = stats.present + stats.absent + stats.tardy;
    if (recorded === 0) { gradeCounts.D++; continue; }
    const rate = Math.round((stats.present / recorded) * 100);
    if (rate >= 90) gradeCounts.A++;
    else if (rate >= 80) gradeCounts.B++;
    else if (rate >= 70) gradeCounts.C++;
    else gradeCounts.D++;
  }
  return { present, absent, tardy, gradeCounts, warningStudents };
}

describe('통계 탭 학생 집계 재사용', () => {
  const allStudents: Student[] = [
    { id: 'mixed', name: '혼합' },
    { id: 'perfect', name: '개근' },
    { id: 'absent', name: '결석' },
    { id: 'missing', name: '누락' },
    { id: 'empty', name: '미입력' },
    { id: 'longAbsent', name: '장결', jang: true },
  ];
  const { active: students } = activeAndLongAbsentStudents(allStudents);

  for (const view of ['all', 'first', 'second'] as const) {
    it(`${view}: 행사 제외·장결 분리·명단 순서·기존 차트와 경고 데이터를 유지한다`, () => {
      const source = makeSource(view);
      const snapshot = structuredClone(source);
      const result = buildClassStats(source, classKey, students);
      expect(result).toEqual(legacySummary(source, students));
      expect(result.present).toHaveLength(5);
      expect(result.warningStudents.map(student => student.id)).not.toContain('longAbsent');
      expect(source).toEqual(snapshot);
      expect(students.map(student => student.id)).toEqual(['mixed', 'perfect', 'absent', 'missing', 'empty']);
    });
  }

  it('반 데이터가 없거나 학생이 없을 때 미기록 기준을 유지한다', () => {
    const source = { ...makeSource(), attData: {} };
    expect(buildClassStats(source, classKey, students)).toMatchObject({
      present: [0, 0, 0, 0, 0],
      absent: [0, 0, 0, 0, 0],
      tardy: [0, 0, 0, 0, 0],
      gradeCounts: { A: 0, B: 0, C: 0, D: 5 },
      warningStudents: [],
    });
    expect(buildClassStats(source, classKey, [])).toEqual({
      present: [], absent: [], tardy: [],
      gradeCounts: { A: 0, B: 0, C: 0, D: 0 }, warningStudents: [],
    });
  });

  it('50% 경고 경계와 반올림한 A/B/C/D 등급 기준을 유지한다', () => {
    const source: StatsSource = {
      months: [{ month: 1, sundays: Array.from({ length: 20 }, (_, index) => index + 1) }],
      curView: 'all', events: {}, attData: { [classKey]: {} },
    };
    const thresholdStudents = [18, 16, 14, 10, 9, 0].map(present => ({ id: `p${present}`, name: `학생${present}` }));
    for (const student of thresholdStudents) {
      const present = Number(student.id.slice(1));
      source.attData[classKey][student.id] = Object.fromEntries(
        Array.from({ length: 20 }, (_, index) => [`0-${index}`, index < present ? 'O' : 'X']),
      );
    }
    const result = buildClassStats(source, classKey, thresholdStudents);
    expect(result.gradeCounts).toEqual({ A: 1, B: 1, C: 1, D: 3 });
    expect(result.warningStudents.map(student => [student.id, student.rate])).toEqual([
      ['p0', 0], ['p9', 45],
    ]);
  });

  it('30명 × 52주 fixture에서 출석 셀 조회를 7,800회에서 1,560회로 줄인다', () => {
    const fixtureStudents = Array.from({ length: 30 }, (_, index) => ({ id: `s${index}`, name: `학생${index}` }));
    const months = getSundaysForYear(2026);
    const weeks = months.flatMap(({ sundays }, mi) => sundays.map((_, di) => `${mi}-${di}`));
    const classAttendance: AttData[string] = {};
    let cellReads = 0;
    for (const [studentIndex, student] of fixtureStudents.entries()) {
      const attendance = Object.fromEntries(weeks.map((key, weekIndex) => [
        key, (['O', 'X', 'T', ''] as AttValue[])[(studentIndex + weekIndex) % 4],
      ]));
      classAttendance[student.id] = new Proxy(attendance, {
        get(target, key) {
          if (typeof key === 'string' && /^\d+-\d+$/.test(key)) cellReads++;
          return Reflect.get(target, key);
        },
      });
    }
    const source: StatsSource = { months, curView: 'all', events: {}, attData: { [classKey]: classAttendance } };
    legacySummary(source, fixtureStudents);
    const before = cellReads;
    cellReads = 0;
    buildClassStats(source, classKey, fixtureStudents);
    const after = cellReads;
    expect(weeks).toHaveLength(52);
    expect(before).toBe(7800);
    expect(after).toBe(1560);
    expect(after / before).toBe(0.2);
  });
});
