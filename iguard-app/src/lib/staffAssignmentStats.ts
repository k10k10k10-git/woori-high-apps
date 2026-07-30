import type { AssignedIguardMovement, IguardStaff } from "./types";

export interface StaffAssignmentStat {
  staffId: string;
  name: string;
  movementCount: number;
  blockCount: number;
}

/**
 * 과부하 기준을 임의로 정하지 않고, 스탭별 실제 동선 배정 횟수와
 * 배정된 일정 수를 그대로 보여주기 위한 운영 통계다.
 */
export function buildStaffAssignmentStats(
  staff: IguardStaff[],
  movements: AssignedIguardMovement[],
): StaffAssignmentStat[] {
  const movementCounts = new Map<string, number>();
  const blockIds = new Map<string, Set<string>>();

  movements.forEach(movement => {
    movementCounts.set(movement.staffId, (movementCounts.get(movement.staffId) || 0) + 1);
    const blocks = blockIds.get(movement.staffId) || new Set<string>();
    blocks.add(movement.blockId);
    blockIds.set(movement.staffId, blocks);
  });

  return staff
    .map(member => ({
      staffId: member.id,
      name: member.name,
      movementCount: movementCounts.get(member.id) || 0,
      blockCount: blockIds.get(member.id)?.size || 0,
    }))
    .sort((a, b) =>
      b.movementCount - a.movementCount
      || b.blockCount - a.blockCount
      || a.name.localeCompare(b.name, "ko"),
    );
}
