/** 원본: andew423-source/high-school-worship-team @ 982dc53ab3ee6d1261736167e5a000deec07974b. */
const DAY_MS = 86_400_000;

function calendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? date : null;
}

/** 날짜를 달력 값으로 계산해 서버/브라우저의 시스템 시간대에 영향을 받지 않는다. */
export function saturdayDates(startDate: string, endDate: string): string[] {
  const start = calendarDate(startDate);
  const end = calendarDate(endDate);
  if (!start || !end || start > end) return [];
  const dates: string[] = [];
  const first = start.valueOf() + ((6 - start.getUTCDay() + 7) % 7) * DAY_MS;
  for (let value = first; value <= end.valueOf(); value += 7 * DAY_MS) {
    dates.push(new Date(value).toISOString().slice(0, 10));
  }
  return dates;
}

export function toSeoulDate(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export function formatKoreanDate(date: string): string {
  const parsed = calendarDate(date);
  if (!parsed) return "날짜 미정";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "UTC", month: "long", day: "numeric" }).format(parsed);
}
