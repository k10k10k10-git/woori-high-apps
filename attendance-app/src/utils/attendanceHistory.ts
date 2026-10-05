import { calcStats } from '@/store/AppContext';
import { normalizeAttendanceValue } from '@/utils/attendanceValue';
import { evKey } from '@/utils/dates';
import type { AttData, EventsMap, MonthEntry } from '@/types';

export function attendanceHistoryStats(attData: AttData, classKey: string, sid: string, months: MonthEntry[], events: EventsMap) {
  const stats = calcStats({ attData, months, events, curView: 'all' }, classKey, sid);
  const monthly = months.map(({ month, sundays }, mi) => {
    let p = 0, a = 0;
    sundays.forEach((_, di) => {
      const key = evKey(mi, di);
      if (events[key]) return;
      const value = normalizeAttendanceValue(attData[classKey]?.[sid]?.[key]);
      if (value === 'O') p++;
      if (value === 'X') a++;
    });
    return { month, p, a, recorded: p + a };
  });
  return { ...stats, total: stats.present + stats.absent, monthly };
}

export function attendanceGrade(rate: number): string {
  return rate >= 90 ? 'A' : rate >= 80 ? 'B' : rate >= 70 ? 'C' : 'D';
}
