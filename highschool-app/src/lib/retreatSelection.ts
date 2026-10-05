import type { Retreat } from "./types";
type Period = { retreatId: string; startDate: string; endDate?: string };

/** 홈·행사·프로그램의 기본 선택: 진행 중 → 가까운 예정 → 최근 종료. 사용자의 명시 선택은 별도로 보존한다. */
export function selectRetreatForWork(retreats: Retreat[], periods: Period[], today: string): Retreat | null {
  const usable = periods.filter((period) => retreats.some((retreat) => retreat.id === period.retreatId));
  const active = usable.find((period) => period.startDate <= today && today <= (period.endDate ?? period.startDate));
  const next = usable.filter((period) => period.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const past = usable.filter((period) => (period.endDate ?? period.startDate) < today).sort((a, b) => (b.endDate ?? b.startDate).localeCompare(a.endDate ?? a.startDate))[0];
  const chosen = active ?? next ?? past;
  return retreats.find((retreat) => retreat.id === chosen?.retreatId) ?? [...retreats].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
}
