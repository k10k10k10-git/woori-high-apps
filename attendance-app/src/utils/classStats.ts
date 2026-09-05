import { calcStats, type AppState } from '@/store/AppContext';
import type { Student } from '@/types';

type AttendanceGrade = 'A' | 'B' | 'C' | 'D';
type StatsSource = Pick<AppState, 'months' | 'curView' | 'attData' | 'events'>;

/** 학생별 통계를 한 번만 계산해 경고 목록과 차트 데이터에서 함께 사용한다. */
export function buildClassStats(state: StatsSource, classKey: string, students: Student[]) {
  const studentStats = students.map(student => {
    const { present, absent, tardy, rate } = calcStats(state, classKey, student.id);
    const recorded = present + absent + tardy;
    const grade: AttendanceGrade = rate >= 90 ? 'A' : rate >= 80 ? 'B' : rate >= 70 ? 'C' : 'D';
    return { ...student, present, absent, tardy, recorded, rate, grade };
  });
  const gradeCounts = { A: 0, B: 0, C: 0, D: 0 };
  for (const student of studentStats) gradeCounts[student.grade]++;

  return {
    present: studentStats.map(student => student.present),
    absent: studentStats.map(student => student.absent),
    tardy: studentStats.map(student => student.tardy),
    gradeCounts,
    warningStudents: studentStats
      .filter(student => student.recorded > 0 && student.rate < 50)
      .sort((a, b) => a.rate - b.rate),
  };
}
