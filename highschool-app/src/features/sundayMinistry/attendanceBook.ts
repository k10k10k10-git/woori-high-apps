import { parseClassKey } from "@/lib/classKey";
import type { AttendanceEventRecord } from "@/lib/db/students";

export type AttendanceMark = "O" | "X" | "";
export type AttendanceSemester = "first" | "second" | "all";

export type AttendanceWeek = {
  cellKey: string;
  month: number;
  day: number;
  label?: string;
};

/** 한국 날짜 기준으로 지난 정상 주일을 고른다. 미래 연도는 첫 정상 주일부터 조회한다. */
export function latestAttendanceWeek(year: number, weeks: AttendanceWeek[], now = new Date()) {
  const korea = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = Date.UTC(korea.getUTCFullYear(), korea.getUTCMonth(), korea.getUTCDate());
  const normalWeeks = weeks.filter((week) => !week.label);
  return normalWeeks.filter((week) => Date.UTC(year, week.month - 1, week.day) <= today).at(-1) ?? normalWeeks[0];
}

/** 제출 완료 판정이 아닌 기록 수다. 장결자는 주간 입력 대상에서 제외한다. */
export function weeklyAttendanceCounts(
  students: Record<string, { jang?: boolean }> | undefined,
  records: Record<string, Record<string, string>> | undefined,
  cellKey: string,
) {
  const targets = Object.entries(students ?? {}).filter(([, student]) => student.jang !== true);
  const marks = targets.map(([studentId]) => normalizeAttendanceMark(records?.[studentId]?.[cellKey]));
  const present = marks.filter((mark) => mark === "O").length;
  const absent = marks.filter((mark) => mark === "X").length;
  return { target: targets.length, present, absent, recorded: present + absent, unentered: targets.length - present - absent };
}

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

  const startMonthIndex = semester === "second" ? 6 : 0;
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

/** 학생 출석부의 이전 지각 값(T)은 출석(O)으로 표시하고 집계한다. */
export function normalizeAttendanceMark(value: unknown): AttendanceMark {
  if (value === "O" || value === "T") return "O";
  if (value === "X") return "X";
  return "";
}

export function attendanceSummary(record: Record<string, string> | undefined, weeks: AttendanceWeek[]) {
  let present = 0;
  let absent = 0;
  weeks.forEach((week) => {
    if (week.label) return;
    const mark = normalizeAttendanceMark(record?.[week.cellKey]);
    if (mark === "O") present += 1;
    if (mark === "X") absent += 1;
  });
  const recorded = present + absent;
  return { present, absent, recorded, rate: recorded === 0 ? null : Math.round((present / recorded) * 100) };
}

export function classLabel(classKey: string): string {
  const parsed = parseClassKey(classKey);
  return parsed ? `${parsed.buNum}부 ${parsed.grade}학년 ${parsed.classNum}반` : classKey;
}
