// 신청자 취합(ClassRosterTab)의 셀 실효 색상 결정 — 순수 로직.
export type RosterColor = "green" | "purple" | "blue" | "orange" | "red";

/**
 * 표시용 실효 색상 우선순위:
 *  1) 빨강(신청취소)이 최우선 — 취소자는 부분참 지정이 남아 있어도 취소로 표시.
 *  2) 부분참(선복귀/후발대) 지정이 있으면 주황 — 입금완료(파랑)·신청자(초록/보라)보다 우선.
 *  3) 그 외에는 수동 지정 색(cellColors) 그대로.
 * 부분참석 탭의 지정(partialAttendances)을 신청자 취합 화면·집계·인쇄에 함께 반영하기 위함.
 */
export function resolveEffectiveColor(raw: RosterColor | undefined, isPartial: boolean): RosterColor | undefined {
  if (raw === "red") return "red";
  if (isPartial) return "orange";
  return raw;
}
