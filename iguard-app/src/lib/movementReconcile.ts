import { type AutoAssignment } from "@/lib/cueSheet";
import { type IguardMovement } from "@/lib/types";

export type SheetMovementUpsert = AutoAssignment & { source: "sheet" };

export interface SheetMovementReconcileResult {
  removes: IguardMovement[];
  upserts: SheetMovementUpsert[];
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
  movement: IguardMovement,
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

function movementMatchesAssignment(movement: IguardMovement, assignment: AutoAssignment): boolean {
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
  existing: IguardMovement[],
  previousSheetAssignments: AutoAssignment[],
  nextSheetAssignments: AutoAssignment[],
  legacySheetMovementIds: ReadonlySet<string> = new Set(),
): SheetMovementReconcileResult {
  const nextByStaff = new Map(nextSheetAssignments.map(assignment => [assignment.staffId, assignment]));
  const existingByStaff = new Map(existing.map(movement => [movement.staffId, movement]));
  const removes: IguardMovement[] = [];
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
