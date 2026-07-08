/** Date → "YYYY-MM-DD" (로컬 시간대 기준) — 여러 컴포넌트에 재구현돼 있던 포맷의 단일 원천 */
export function toYMD(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
