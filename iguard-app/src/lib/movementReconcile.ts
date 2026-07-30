import { type AutoAssignment } from "@/lib/cueSheet";
import { type AssignedIguardMovement, type IguardMovement } from "@/lib/types";

export type SheetMovementUpsert = AutoAssignment & { source: "sheet" };

export interface SheetMovementReconcileResult {
  removes: AssignedIguardMovement[];
  upserts: SheetMovementUpsert[];
}

export type SegmentSheetMovement = Omit<IguardMovement, "id" | "source"> & { source?: "sheet" };

export interface SegmentMovementReconcileResult {
  removes: IguardMovement[];
  upserts: Array<SegmentSheetMovement & { source: "sheet" }>;
}

function compactIdentity(value?: string | null): string {
  return (value || "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/sf$/i, "")
    .replace(/[\s\[\](){}._-]/g, "");
}

/** 옛 자동배정이 남긴 `포스트명: 스탭명sf` 메모인지 보수적으로 판별한다. */
export function looksLikeLegacySheetMovement(
  movement: AssignedIguardMovement,
  staffName?: string,
  postName?: string,
): boolean {
  if (movement.source != null || !movement.note || !staffName || !postName) return false;
  const [role = "", ...staffParts] = movement.note.split(/[:：]/);
  if (staffParts.length === 0) return false;
  const roleKey = compactIdentity(role);
  const postKey = compactIdentity(postName);
  const noteStaffKey = compactIdentity(staffParts.join(":"));
  const staffKey = compactIdentity(staffName);
  return !!roleKey && !!postKey && !!staffKey
    && (roleKey.includes(postKey) || postKey.includes(roleKey))
    && noteStaffKey.includes(staffKey);
}

function sameOptionalValue(a?: string | null, b?: string | null): boolean {
  return (a || "") === (b || "");
}

function movementMatchesAssignment(movement: AssignedIguardMovement, assignment: AutoAssignment): boolean {
  return movement.staffId === assignment.staffId
    && movement.postId === assignment.postId
    && sameOptionalValue(movement.round, assignment.round)
    && sameOptionalValue(movement.note, assignment.note);
}

/**
 * 기존 블록의 시트 자동배정을 새 시트 내용과 동기화한다.
 *
 * - source=manual 또는 출처 미상의 배정은 보존한다.
 * - source=sheet 배정은 새 시트에서 사라지면 제거한다.
 * - source 필드가 없던 레거시 배정은 이전 자동배정과 정확히 일치하거나
 *   자동배정 고유 메모 형식이 확인될 때만 시트 소유로 간주한다.
 */
export function reconcileSheetMovements(
  existing: AssignedIguardMovement[],
  previousSheetAssignments: AutoAssignment[],
  nextSheetAssignments: AutoAssignment[],
  legacySheetMovementIds: ReadonlySet<string> = new Set(),
): SheetMovementReconcileResult {
  const nextByStaff = new Map(nextSheetAssignments.map(assignment => [assignment.staffId, assignment]));
  const existingByStaff = new Map(existing.map(movement => [movement.staffId, movement]));
  const removes: AssignedIguardMovement[] = [];
  const upserts: SheetMovementUpsert[] = [];

  existing.forEach(movement => {
    const legacySheetOwned = movement.source == null && (
      previousSheetAssignments.some(assignment => movementMatchesAssignment(movement, assignment))
      || legacySheetMovementIds.has(movement.id)
    );
    const sheetOwned = movement.source === "sheet" || legacySheetOwned;
    if (!sheetOwned) return;

    const next = nextByStaff.get(movement.staffId);
    if (!next) {
      removes.push(movement);
      return;
    }
    if (movement.source !== "sheet" || !movementMatchesAssignment(movement, next)) {
      upserts.push({ ...next, source: "sheet" });
    }
  });

  nextSheetAssignments.forEach(assignment => {
    if (existingByStaff.has(assignment.staffId)) return;
    upserts.push({ ...assignment, source: "sheet" });
  });

  return { removes, upserts };
}

function segmentMovementIdentity(
  movement: Pick<IguardMovement, "segmentId" | "postId" | "staffId" | "actor" | "slot">,
): string {
  const assignee = movement.staffId
    ? `staff:${movement.staffId}`
    : movement.actor
      ? `actor:${compactIdentity(movement.actor)}:${movement.slot || 1}`
      : `tbd:${movement.slot || 1}`;
  return `${movement.segmentId || ""}__${movement.postId}__${assignee}`;
}

function sameSegmentMovement(
  existing: IguardMovement,
  next: SegmentSheetMovement,
): boolean {
  return segmentMovementIdentity(existing) === segmentMovementIdentity(next)
    && existing.blockId === next.blockId
    && sameOptionalValue(existing.round, next.round)
    && sameOptionalValue(existing.detail, next.detail)
    && sameOptionalValue(existing.note, next.note)
    && sameOptionalValue(existing.actor, next.actor);
}

/**
 * 새 구간 모델의 시트 동선을 동기화한다.
 *
 * 자연키는 segment×post×담당자(또는 actor/TBD 슬롯)다.
 * 수동 배정과 출처 미상의 기존 배정은 항상 보존하고 source=sheet만 교체한다.
 */
export function reconcileSegmentSheetMovements(
  existing: IguardMovement[],
  nextAssignments: SegmentSheetMovement[],
): SegmentMovementReconcileResult {
  const nextByIdentity = new Map(nextAssignments.map(item => [segmentMovementIdentity(item), item]));
  const existingByIdentity = new Map(existing.map(item => [segmentMovementIdentity(item), item]));
  const removes: IguardMovement[] = [];
  const upserts: Array<SegmentSheetMovement & { source: "sheet" }> = [];

  existing.forEach(movement => {
    if (movement.source !== "sheet") return;
    const next = nextByIdentity.get(segmentMovementIdentity(movement));
    if (!next) {
      removes.push(movement);
      return;
    }
    if (!sameSegmentMovement(movement, next)) upserts.push({ ...next, source: "sheet" });
  });

  nextAssignments.forEach(next => {
    const existingMovement = existingByIdentity.get(segmentMovementIdentity(next));
    if (existingMovement) return;
    upserts.push({ ...next, source: "sheet" });
  });

  return { removes, upserts };
}
