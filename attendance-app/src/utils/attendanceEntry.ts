import type { AppState } from '@/store/AppContext';
import { buildAdminDashboard } from './adminDashboard';
import { recentEditableWeeks } from './attendanceWorkflow';

type AttendanceEntrySource = Pick<AppState, 'curYear' | 'months' | 'events' | 'userRole'>;

type AttendanceEntryOptions = {
  queryWeekKey?: string | null;
  pickedWeekKey?: string | null;
  nowMs?: number;
};

/** URL은 조회할 날짜의 힌트일 뿐이며 현재 역할의 편집 가능 목록을 넓히지 않는다. */
export function buildAttendanceEntry(source: AttendanceEntrySource, options: AttendanceEntryOptions = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const isAdmin = source.userRole?.role === 'admin';
  const dashboard = isAdmin ? buildAdminDashboard({ ...source, classData: {}, attData: {} }, { nowMs }) : null;
  const editableWeeks = dashboard
    ? [...dashboard.weeks].reverse()
    : recentEditableWeeks(source.curYear, source.months, source.events, nowMs, 4);
  const defaultWeek = dashboard?.selectedWeek ?? editableWeeks[0] ?? null;
  const selectedWeek = editableWeeks.find((week) => week.key === options.pickedWeekKey)
    ?? editableWeeks.find((week) => week.key === options.queryWeekKey)
    ?? defaultWeek;

  return { editableWeeks, selectedWeek };
}
