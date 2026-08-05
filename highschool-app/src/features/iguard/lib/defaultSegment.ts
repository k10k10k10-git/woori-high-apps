import type { AssignedIguardMovement, IguardMovement, IguardSegment } from "@/features/iguard/lib/types";

export const DEFAULT_SEGMENT_LABEL = "전체";

export function isDefaultSegment(segment: IguardSegment): boolean {
  return segment.order === 0 && segment.label.trim() === DEFAULT_SEGMENT_LABEL;
}

export function isAssignedMovement(movement: IguardMovement): movement is AssignedIguardMovement {
  return typeof movement.staffId === "string" && movement.staffId.trim().length > 0;
}

/**
 * 구간 UI가 준비되기 전 기존 화면에 보여줄 동선만 고른다.
 *
 * - segmentId가 없는 레거시 동선은 그대로 보존한다.
 * - 새 모델 동선은 `order=0,label=전체` 기본 구간만 노출한다.
 * - 담당 미정 슬롯은 기존 화면이 표현할 수 없으므로 제외한다.
 */
export function movementsForDefaultSegments(
  segments: IguardSegment[],
  movements: IguardMovement[],
): AssignedIguardMovement[] {
  const defaultIds = new Set(segments.filter(isDefaultSegment).map(segment => segment.id));
  return movements.filter((movement): movement is AssignedIguardMovement => {
    if (!isAssignedMovement(movement)) return false;
    return !movement.segmentId || defaultIds.has(movement.segmentId);
  });
}
