/** 브라우저 날짜 입력을 다시 검증한다. DB의 기존 월·일 문자열 형태는 유지한다. */
export function attendanceEventDate(value: string, selectedYear: number): { month: string; day: string; sunday: boolean } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) !== selectedYear) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return { month: String(date.getUTCMonth() + 1), day: String(date.getUTCDate()), sunday: date.getUTCDay() === 0 };
}
