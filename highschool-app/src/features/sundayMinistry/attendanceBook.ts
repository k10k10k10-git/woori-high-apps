import { parseClassKey } from "@/lib/classKey";
import type { AttendanceEventRecord } from "@/lib/db/students";

export type AttendanceMark = "O" | "X" | "T" | "";
export type AttendanceSemester = "first" | "second";

export type AttendanceWeek = {
  cellKey: string;
  month: number;
  day: number;
  label?: string;
};

export function attendanceWeeks(
  year: number,
  semester: AttendanceSemester,
  events: Record<string, AttendanceEventRecord>,
): AttendanceWeek[] {
  const labels = new Map<string, string>();
  const sundaysByMonth = Array.from({ length: 12 }, (_, monthIndex) => {
    const days: number[] = [];
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day += 1) {
      if (new Date(year, monthIndex, day).getDay() === 0) days.push(day);
    }
    return days;
  });

  Object.values(events).forEach((event) => {
    const month = Number(event.month);
    const day = Number(event.day);
    const dayIndex = sundaysByMonth[month - 1]?.indexOf(day) ?? -1;
    if (month >= 1 && month <= 12 && dayIndex >= 0 && event.label?.trim()) {
      labels.set(`${month - 1}-${dayIndex}`, event.label.trim());
    }
  });

  const startMonthIndex = semester === "first" ? 0 : 6;
  const endMonthIndex = semester === "first" ? 5 : 11;
  const weeks: AttendanceWeek[] = [];
  for (let monthIndex = startMonthIndex; monthIndex <= endMonthIndex; monthIndex += 1) {
    sundaysByMonth[monthIndex].forEach((day, dayIndex) => {
      const cellKey = `${monthIndex}-${dayIndex}`;
      weeks.push({ cellKey, month: monthIndex + 1, day, ...(labels.has(cellKey) ? { label: labels.get(cellKey) } : {}) });
    });
  }
  return weeks;
}

export function classKeysForPart(classKeys: string[], part: 1 | 2): string[] {
  return classKeys
    .filter((key) => parseClassKey(key)?.buNum === part)
    .sort((left, right) => {
      const a = parseClassKey(left);
      const b = parseClassKey(right);
      if (!a || !b) return left.localeCompare(right, "ko");
      return a.grade - b.grade || a.classNum - b.classNum;
    });
}

export function sortedRoster<T extends { name: string; num?: number }>(students?: Record<string, T>) {
  return Object.entries(students ?? {}).sort(([, left], [, right]) => {
    if (left.num !== undefined && right.num !== undefined && left.num !== right.num) return left.num - right.num;
    return left.name.localeCompare(right.name, "ko");
  });
}

export function attendanceSummary(record: Record<string, string> | undefined, weeks: AttendanceWeek[]) {
  let present = 0;
  let tardy = 0;
  let absent = 0;
  weeks.forEach((week) => {
    if (week.label) return;
    const mark = record?.[week.cellKey];
    if (mark === "O") present += 1;
    if (mark === "T") tardy += 1;
    if (mark === "X") absent += 1;
  });
  const recorded = present + tardy + absent;
  return { present, tardy, absent, recorded, rate: recorded === 0 ? null : Math.round((present / recorded) * 100) };
}

export function classLabel(classKey: string): string {
  const parsed = parseClassKey(classKey);
  return parsed ? `${parsed.buNum}부 ${parsed.grade}학년 ${parsed.classNum}반` : classKey;
}
