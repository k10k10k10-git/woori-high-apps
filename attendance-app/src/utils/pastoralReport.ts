import type { Student } from '@/types';
import type { AdminDashboardSource } from './adminDashboard';
import { recentEditableWeeks, type EditableWeek } from './attendanceWorkflow';
import { normalizeAttendanceValue } from './attendanceValue';

export type ReportFriend = {
  key: string; name: string; part: string; grade: string; owner?: string;
  registeredDate?: string; decision?: string;
  rosterSync?: { studentId: string; classKey: string; personId?: string };
};
export type ReportStudent = {
  key: string; student: Student; classKey: string; label: string; teacher: string;
  streak: number; lastPresent: EditableWeek | undefined;
  recent: { week: EditableWeek; value: string }[]; recovered: boolean;
};

/** 이름으로 연결하지 않는다. 반 이동은 같은 연도의 유일한 personId만 따라간다. */
export function linkReportFriend(friend: ReportFriend, rows: ReportStudent[]) {
  const sync = friend.rosterSync;
  if (!sync) return undefined;
  const exact = rows.filter(row => row.classKey === sync.classKey && row.student.id === sync.studentId);
  if (exact.length === 1 && (!sync.personId || exact[0].student.personId === sync.personId)) return exact[0];
  const candidates = sync.personId ? rows.filter(row => row.student.personId === sync.personId) : [];
  return candidates.length === 1 ? candidates[0] : undefined;
}

export function reportDate(value?: string): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : null;
}

export function buildPastoralReport(source: AdminDashboardSource, friends: ReportFriend[] = [], nowMs = Date.now(), weekKey?: string) {
  const weeks = recentEditableWeeks(source.curYear, source.months, source.events, nowMs, 60);
  const selected = weeks.findIndex(week => week.key === weekKey);
  const through = weeks.slice(selected < 0 ? 0 : selected);
  const rows: ReportStudent[] = Object.entries(source.classData).flatMap(([classKey, info]) => {
    const [part, grade, cls] = classKey.split('-');
    return (info.students ?? []).map(student => {
      const recent = through.map(week => ({ week, value: normalizeAttendanceValue(source.attData[classKey]?.[student.id]?.[week.key]) }));
      let streak = 0;
      for (const cell of recent) { if (cell.value !== 'X') break; streak++; }
      return {
        key: `${classKey}/${student.id}`, student, classKey,
        label: `${part}부 ${grade}학년 ${cls}반`, teacher: info.teacher ?? '', streak,
        lastPresent: recent.find(cell => cell.value === 'O')?.week, recent,
        recovered: recent[0]?.value === 'O' && recent.length >= 4 && recent.slice(1, 4).every(cell => cell.value === 'X'),
      };
    });
  });
  const absent = rows.filter(row => row.streak >= 3).sort((a, b) => b.streak - a.streak
    || (a.lastPresent?.dateValue ?? -Infinity) - (b.lastPresent?.dateValue ?? -Infinity)
    || a.label.localeCompare(b.label, 'ko', { numeric: true }) || a.student.name.localeCompare(b.student.name, 'ko'));
  const linked = new Set<string>();
  const settlement = friends.flatMap(friend => {
    const start = reportDate(friend.registeredDate);
    const row = linkReportFriend(friend, rows);
    if (row) linked.add(row.key);
    if (start !== null && through[0] && start > through[0].dateValue) return [];
    const observed = start !== null && row ? row.recent.filter(cell => cell.week.dateValue >= start).slice().reverse() : [];
    const window = (count: number) => {
      const cells = observed.slice(0, count);
      return { elapsed: cells.length, present: cells.filter(cell => cell.value === 'O').length, missing: cells.filter(cell => !cell.value).length };
    };
    const lastTwo = observed.slice(-2);
    const status = !row ? '출석부 연결 확인' : start === null ? '등록일 확인 필요'
      : observed.length === 0 ? '관찰 기간 부족'
      : lastTwo.length === 2 && lastTwo.every(cell => cell.value === 'X') ? '연락 필요'
      : observed.some(cell => !cell.value) ? '출석 입력 확인'
      : observed.length < 4 ? '관찰 중' : window(4).present >= 3 ? '초기 4주 출석 양호' : '출석 흐름 확인';
    return [{ friend, row, four: window(4), eight: window(8), status }];
  });
  // 출석부 연결 표식이 있는 새친구도 누락하지 않는다. 등록일은 추정하지 않는다.
  for (const row of rows) if (row.student.id.startsWith('nf_') && !linked.has(row.key)) {
    settlement.push({ friend: { key: row.key, name: row.student.name, part: row.classKey.split('-')[0], grade: row.classKey.split('-')[1] }, row,
      four: { elapsed: 0, present: 0, missing: 0 }, eight: { elapsed: 0, present: 0, missing: 0 }, status: '등록일 확인 필요' });
  }
  return { weeks, selectedWeek: through[0], rows, absent, settlement,
    recovered: rows.filter(row => row.recovered),
    missing: rows.filter(row => row.student.jang !== true && row.recent[0] && !row.recent[0].value).length };
}
