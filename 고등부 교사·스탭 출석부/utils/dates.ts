import type { MonthEntry, HolidayRanges, EventsMap } from '@/types';

// ─── KST 현재 연도 ────────────────────────────────────────────
export function getKSTYear(): number {
  return new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
}

// ─── 연도 윈도우 (±5년) ──────────────────────────────────────
export function getWindowYears(kstYear: number): number[] {
  return Array.from({ length: 11 }, (_, i) => kstYear - 5 + i);
}

// ─── 해당 연도 모든 주일(일요일) 계산 ────────────────────────
export function getSundaysForYear(year: number): MonthEntry[] {
  const result: MonthEntry[] = [];
  for (let m = 1; m <= 12; m++) {
    const sundays: number[] = [];
    const daysInMonth = new Date(year, m, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, m - 1, d).getDay();
      if (dow === 0) sundays.push(d);
    }
    result.push({ month: m, sundays });
  }
  return result;
}

// ─── 출석 데이터 셀 키 포맷 ──────────────────────────────────
export function evKey(mi: number, di: number): string {
  return `${mi}-${di}`;
}

// ─── 연휴 주일 이벤트 추출 ────────────────────────────────────
export function getHolidayEvents(year: number, holidayRanges: HolidayRanges): EventsMap {
  const months = getSundaysForYear(year);
  const events: EventsMap = {};
  const ranges = holidayRanges[year] || [];

  months.forEach(({ month, sundays }, mi) => {
    sundays.forEach((day, di) => {
      ranges.forEach(({ start, end, label }) => {
        const [sm, sd] = start;
        const [em, ed] = end;
        const afterStart = month > sm || (month === sm && day >= sd);
        const beforeEnd = month < em || (month === em && day <= ed);
        if (afterStart && beforeEnd) {
          events[evKey(mi, di)] = label;
        }
      });
    });
  });
  return events;
}

const KNOWN_HOLIDAYS: Record<number, HolidayRanges[number]> = {
  2024: [
    { start: [2, 9],  end: [2, 12], label: '설\n연휴' },
    { start: [9, 16], end: [9, 18], label: '추석\n연휴' },
  ],
  2025: [
    { start: [1, 28], end: [1, 30], label: '설\n연휴' },
    { start: [10, 5], end: [10, 7], label: '추석\n연휴' },
  ],
  2026: [
    { start: [2, 16], end: [2, 18], label: '설\n연휴' },
    { start: [9, 24], end: [9, 26], label: '추석\n연휴' },
  ],
  2027: [
    { start: [2, 6],  end: [2, 8],  label: '설\n연휴' },
    { start: [9, 14], end: [9, 16], label: '추석\n연휴' },
  ],
  2028: [
    { start: [1, 26], end: [1, 28], label: '설\n연휴' },
    { start: [10, 2], end: [10, 4], label: '추석\n연휴' },
  ],
  2029: [
    { start: [2, 12], end: [2, 14], label: '설\n연휴' },
    { start: [9, 21], end: [9, 23], label: '추석\n연휴' },
  ],
  2030: [
    { start: [2, 2],  end: [2, 4],  label: '설\n연휴' },
    { start: [9, 11], end: [9, 13], label: '추석\n연휴' },
  ],
};

export function buildHolidayRanges(windowYears: number[]): HolidayRanges {
  const result: HolidayRanges = {};
  windowYears.forEach(y => {
    result[y] = KNOWN_HOLIDAYS[y] || [];
  });
  return result;
}

export function buildEvents(
  year: number,
  months: MonthEntry[],
  holidayRanges: HolidayRanges,
  customEventsData: Record<string, { month: string; day: string; label: string }>
): EventsMap {
  const events: EventsMap = { ...getHolidayEvents(year, holidayRanges) };
  Object.values(customEventsData).forEach(ev => {
    const mi = months.findIndex(m => m.month === parseInt(ev.month));
    if (mi === -1) return;
    const di = months[mi].sundays.findIndex(d => d === parseInt(ev.day));
    if (di === -1) return;
    events[evKey(mi, di)] = ev.label;
  });
  return events;
}

// ─── 이메일 → Firebase 키 ─────────────────────────────────────
export function emailToKey(email: string): string {
  return email.replace(/\./g, '__dot__').replace(/@/g, '__at__');
}

// ─── 멤버 정렬 및 번호 재부여 ────────────────────────────────
export function sortAndRenumber<T extends { name?: string; num?: number }>(members: T[]): T[] {
  return [...members]
    .sort((a, b) => {
      if (a.num !== undefined && b.num !== undefined) return a.num - b.num;
      return (a.name ?? '').localeCompare(b.name ?? '', 'ko');
    })
    .map((m, i) => ({ ...m, num: i + 1 }));
}
