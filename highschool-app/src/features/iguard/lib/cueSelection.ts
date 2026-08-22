/** 현장 화면의 "자동 선택 vs 사용자 선택" 판정 — 순수 로직.
 *
 *  ★ 사고 이력(루트 CLAUDE.md 실수 13): `clock.time` 의존 effect에서 선택 상태를
 *  setState 하면 30초 시계 tick마다 사용자가 고른 일자·블록이 첫 항목으로 되돌아갔다.
 *  그래서 선택은 **effect가 아니라 렌더 중 파생**으로 정한다 — 사용자가 고른 값을
 *  `picked*` 상태에 담아 두고, 그 값이 여전히 유효할 때만 자동값을 이긴다.
 *
 *  effect + ref 가드로도 같은 결과를 낼 수 있지만, 파생 방식은 두 가지가 더 낫다.
 *   - 시계 tick이 아무리 돌아도 setState가 없어 선택이 덮일 경로 자체가 없다.
 *   - 고른 항목이 데이터 갱신으로 사라지면 자동값으로 되돌아간다(빈 화면이 되지 않는다).
 */

/** 사용자가 고른 일자가 아직 존재하면 그것, 아니면 오늘 일자, 그것도 없으면 첫 일자. */
export function resolveSelectedDay(
  days: number[],
  pickedDay: number | null,
  currentDay: number | null,
): number {
  if (pickedDay != null && days.includes(pickedDay)) return pickedDay;
  if (currentDay != null && days.includes(currentDay)) return currentDay;
  return days[0] ?? 1;
}

export type PickedBlock = { day: number; id: string };

/**
 * 사용자가 고른 블록은 **같은 일자에서 아직 존재할 때만** 유지한다.
 * 일자를 옮기면 자동 선택("지금" 블록)이 다시 살아나고, 고른 블록이 사라지면 자동값으로 되돌아간다.
 */
export function resolveSelectedBlockId(
  dayBlockIds: string[],
  picked: PickedBlock | null,
  day: number,
  automaticBlockId: string | undefined,
): string {
  if (picked && picked.day === day && dayBlockIds.includes(picked.id)) return picked.id;
  return automaticBlockId ?? "";
}
