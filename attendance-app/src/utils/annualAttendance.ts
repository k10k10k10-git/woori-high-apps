import { calcStats, type AppState } from '@/store/AppContext';
import type { Student } from '@/types';

type AnnualSource = Pick<AppState, 'months' | 'attData' | 'events'>;

/** 다른 화면의 학기 선택과 무관하게 학생별 연간 입력 기록 출석률을 평균낸다. */
export function annualClassAverageRate(source: AnnualSource, classKey: string, students: Student[]): number | null {
  const annualSource = { ...source, curView: 'all' as const };
  const rates = students.map(student => {
    const { present, absent, tardy, rate } = calcStats(annualSource, classKey, student.id);
    return present + absent + tardy === 0 ? null : rate;
  }).filter((rate): rate is number => rate !== null);

  if (rates.length === 0) return null;
  return Math.round(rates.reduce((sum, rate) => sum + rate, 0) / rates.length);
}
