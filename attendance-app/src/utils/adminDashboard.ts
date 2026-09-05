import type { AppState } from '@/store/AppContext';
import { recentEditableWeeks, type EditableWeek } from './attendanceWorkflow';
import { evKey } from './dates';

export type AdminDashboardSource = Pick<AppState, 'classData' | 'attData' | 'months' | 'events' | 'curYear'>;

export type AdminDashboardFilters = {
  weekKey?: string | null;
  part?: string;
  grade?: string;
  search?: string;
  nowMs?: number;
};

export type AdminDashboardStatus = 'complete' | 'partial' | 'empty' | 'no-students' | 'no-targets' | 'no-week';

export type AdminDashboardCounts = {
  studentCount: number;
  longAbsentCount: number;
  /** 출석 체크 화면에서 입력하는 일반 학생 수. 장결자는 제외한다. */
  inputStudentCount: number;
  /** 일반 학생 중 O·X·T가 입력된 인원. */
  inputRecorded: number;
  recorded: number;
  present: number;
  absent: number;
  tardy: number;
  unentered: number;
  /** O ÷ (O + X + T). 입력된 기록이 없으면 null이다. */
  attendanceRate: number | null;
  /** 일반 학생의 입력 인원 ÷ 일반 학생 수. 주일이나 입력 대상이 없으면 null이다. */
  inputRate: number | null;
};

export type AdminDashboardRow = AdminDashboardCounts & {
  classKey: string;
  part: string;
  grade: string;
  classNumber: string;
  label: string;
  teacher: string;
  status: AdminDashboardStatus;
};

export type AdminDashboardSummary = AdminDashboardCounts & {
  classCount: number;
  completeClassCount: number;
  partialClassCount: number;
  emptyClassCount: number;
  noStudentClassCount: number;
  noTargetClassCount: number;
  /** 일반 학생이 있고 입력이 덜 끝난 반. 조회할 정상 주일이 없으면 0이다. */
  pendingClassCount: number;
};

function percentage(numerator: number, denominator: number): number | null {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
}

function summarize(rows: AdminDashboardRow[], hasWeek: boolean): AdminDashboardSummary {
  const summary: AdminDashboardSummary = {
    classCount: rows.length,
    studentCount: 0,
    longAbsentCount: 0,
    inputStudentCount: 0,
    inputRecorded: 0,
    recorded: 0,
    present: 0,
    absent: 0,
    tardy: 0,
    unentered: 0,
    attendanceRate: null,
    inputRate: null,
    completeClassCount: 0,
    partialClassCount: 0,
    emptyClassCount: 0,
    noStudentClassCount: 0,
    noTargetClassCount: 0,
    pendingClassCount: 0,
  };

  for (const row of rows) {
    summary.studentCount += row.studentCount;
    summary.longAbsentCount += row.longAbsentCount;
    summary.inputStudentCount += row.inputStudentCount;
    summary.inputRecorded += row.inputRecorded;
    summary.recorded += row.recorded;
    summary.present += row.present;
    summary.absent += row.absent;
    summary.tardy += row.tardy;
    summary.unentered += row.unentered;
    if (row.status === 'complete') summary.completeClassCount++;
    if (row.status === 'partial') summary.partialClassCount++;
    if (row.status === 'empty') summary.emptyClassCount++;
    if (row.status === 'no-students') summary.noStudentClassCount++;
    if (row.status === 'no-targets') summary.noTargetClassCount++;
  }

  // 반별 비율을 평균 내지 않고 실제 인원으로 다시 계산한다.
  summary.attendanceRate = percentage(summary.present, summary.recorded);
  summary.inputRate = hasWeek ? percentage(summary.inputRecorded, summary.inputStudentCount) : null;
  summary.pendingClassCount = summary.partialClassCount + summary.emptyClassCount;
  return summary;
}

function searchable(value: string): string {
  return value.normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase('ko');
}

/** 전체 출석 통계는 장결자를 포함하고, 입력 업무는 출석 체크 화면의 일반 학생만 대상으로 한다. */
export function buildAdminDashboard(source: AdminDashboardSource, filters: AdminDashboardFilters = {}) {
  const { classData, attData, months, events, curYear } = source;
  const weeks: EditableWeek[] = months.flatMap(({ month, sundays }, mi) => sundays.map((day, di) => ({
    key: evKey(mi, di),
    label: `${month}월 ${day}일`,
    dateValue: Date.UTC(curYear, month - 1, day),
  })))
    .filter((week) => !events[week.key])
    .sort((a, b) => a.dateValue - b.dateValue);
  const latestElapsedWeek = recentEditableWeeks(curYear, months, events, filters.nowMs ?? Date.now(), 1)[0];
  const selectedWeek = weeks.find((week) => week.key === filters.weekKey)
    ?? latestElapsedWeek
    ?? weeks[0]
    ?? null;

  const allRows: AdminDashboardRow[] = Object.entries(classData).map(([classKey, info]) => {
    const [part = '', grade = '', classNumber = ''] = classKey.split('-');
    const students = info.students ?? [];
    let present = 0;
    let absent = 0;
    let tardy = 0;
    let longAbsentCount = 0;
    let inputRecorded = 0;
    for (const student of students) {
      if (student.jang === true) longAbsentCount++;
      const value = selectedWeek ? attData[classKey]?.[student.id]?.[selectedWeek.key] : undefined;
      if (value === 'O') present++;
      else if (value === 'X') absent++;
      else if (value === 'T') tardy++;
      if (student.jang !== true && (value === 'O' || value === 'X' || value === 'T')) inputRecorded++;
    }

    const studentCount = students.length;
    const recorded = present + absent + tardy;
    const inputStudentCount = studentCount - longAbsentCount;
    const status: AdminDashboardStatus = studentCount === 0 ? 'no-students'
      : !selectedWeek ? 'no-week'
      : inputStudentCount === 0 ? 'no-targets'
      : inputRecorded === inputStudentCount ? 'complete'
      : inputRecorded > 0 ? 'partial'
      : 'empty';
    return {
      classKey,
      part,
      grade,
      classNumber,
      label: `${part}부 ${grade}학년 ${classNumber}반`,
      teacher: info.teacher ?? '',
      studentCount,
      longAbsentCount,
      inputStudentCount,
      inputRecorded,
      recorded,
      present,
      absent,
      tardy,
      unentered: selectedWeek ? inputStudentCount - inputRecorded : 0,
      attendanceRate: percentage(present, recorded),
      inputRate: selectedWeek ? percentage(inputRecorded, inputStudentCount) : null,
      status,
    };
  }).sort((a, b) => a.part.localeCompare(b.part, 'ko', { numeric: true })
    || a.grade.localeCompare(b.grade, 'ko', { numeric: true })
    || a.classNumber.localeCompare(b.classNumber, 'ko', { numeric: true })
    || a.classKey.localeCompare(b.classKey, 'ko'));

  const query = searchable(filters.search ?? '');
  const rows = allRows.filter((row) => {
    if (filters.part && filters.part !== 'all' && row.part !== filters.part) return false;
    if (filters.grade && filters.grade !== 'all' && row.grade !== filters.grade) return false;
    if (!query) return true;
    return [row.classKey, row.label, row.teacher, ...classData[row.classKey].students.map((student) => student.name)]
      .some((value) => searchable(value).includes(query));
  });

  return {
    weeks,
    selectedWeek,
    rows,
    allRows,
    summary: summarize(rows, !!selectedWeek),
    overallSummary: summarize(allRows, !!selectedWeek),
  };
}
