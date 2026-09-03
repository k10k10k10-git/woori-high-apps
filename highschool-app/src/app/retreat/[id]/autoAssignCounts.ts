// 자동 조편성의 "조를 몇 개 만들 것인가" 계산.
//
// 배정 알고리즘(점수·개선·검증)과 달리 이쪽은 인원수와 옵션만 보는 순수 산수라,
// autoAssignUtils의 공유 헬퍼(unitClassKey·hasConflict·페널티 상수)에 전혀 기대지 않는다.
// 2026-09-03에 그 경계대로 떼어냈다. 호출부는 autoAssignUtils의 재수출을 그대로 쓰므로
// import 경로는 바뀌지 않는다.
import { Group } from "@/lib/types";

export interface CombinedGroupCountInput {
  groupCount1bu: number;
  groupCount2bu: number;
  maxGroups1: number;
  maxGroups2: number;
  studentCount1bu: number;
  studentCount2bu: number;
}

export interface CombinedGroupCounts {
  groupCount1bu: number;
  groupCount2bu: number;
}

export type AutoAssignScope = "all" | "1부" | "2부";

export interface ScopedGroupCountInput {
  requestedCount: number;
  maxGroups: number;
  studentCount: number;
  preservedOtherGroupCount: number;
}

export interface MaxSizeGroupCountInput {
  maxGroupSize: number;
  maxGroups1: number;
  maxGroups2: number;
  studentCount1bu: number;
  studentCount2bu: number;
}

export function ensureEvenCombinedGroupCounts({
  groupCount1bu, groupCount2bu, maxGroups1, maxGroups2, studentCount1bu, studentCount2bu,
}: CombinedGroupCountInput): CombinedGroupCounts {
  const rows = [
    {
      count: studentCount1bu > 0 ? Math.min(Math.max(1, groupCount1bu), Math.max(1, maxGroups1)) : 0,
      max: studentCount1bu > 0 ? Math.max(1, maxGroups1) : 0,
      students: studentCount1bu,
    },
    {
      count: studentCount2bu > 0 ? Math.min(Math.max(1, groupCount2bu), Math.max(1, maxGroups2)) : 0,
      max: studentCount2bu > 0 ? Math.max(1, maxGroups2) : 0,
      students: studentCount2bu,
    },
  ];

  if ((rows[0].count + rows[1].count) % 2 !== 0) {
    const canIncrease = rows
      .filter(row => row.count > 0 && row.count < row.max)
      .sort((a, b) => (b.students / b.count) - (a.students / a.count));
    if (canIncrease.length > 0) {
      canIncrease[0].count += 1;
    } else {
      const canDecrease = rows
        .filter(row => row.count > 1)
        .sort((a, b) => (a.students / a.count) - (b.students / b.count));
      if (canDecrease.length > 0) canDecrease[0].count -= 1;
    }
  }

  return {
    groupCount1bu: rows[0].count,
    groupCount2bu: rows[1].count,
  };
}

/** 한 부서만 다시 편성할 때 반대 부서 조 수는 건드리지 않고 합산 짝수를 맞춘다. */
export function ensureEvenScopedGroupCount({
  requestedCount, maxGroups, studentCount, preservedOtherGroupCount,
}: ScopedGroupCountInput): number {
  if (studentCount <= 0 || maxGroups <= 0) return 0;
  let count = Math.min(Math.max(1, requestedCount), Math.max(1, maxGroups));
  if ((count + Math.max(0, preservedOtherGroupCount)) % 2 !== 0) {
    if (count < maxGroups) count += 1;
    else if (count > 1) count -= 1;
  }
  return count;
}

/** 부분 자동배정 결과를 적용하되 선택하지 않은 부서의 현재 조는 그대로 보존한다. */
export function mergeAutoAssignedGroups(
  currentGroups: Group[], generatedGroups: Group[], scope: AutoAssignScope,
): Group[] {
  if (scope === "all") return generatedGroups;
  return (["1부", "2부"] as const).flatMap(bu =>
    bu === scope
      ? generatedGroups.filter(group => group.bu === bu)
      : currentGroups.filter(group => group.bu === bu)
  );
}

/** 조당 최대 인원으로 부별 조 수를 계산한 뒤, 화면에 표시하기 전 합계를 짝수로 보정한다. */
export function calculateEvenGroupCountsForMaxSize({
  maxGroupSize, maxGroups1, maxGroups2, studentCount1bu, studentCount2bu,
}: MaxSizeGroupCountInput): CombinedGroupCounts {
  const rawCount1 = maxGroupSize > 0 && studentCount1bu > 0
    ? Math.min(maxGroups1, Math.max(1, Math.ceil(studentCount1bu / maxGroupSize)))
    : 0;
  const rawCount2 = maxGroupSize > 0 && studentCount2bu > 0
    ? Math.min(maxGroups2, Math.max(1, Math.ceil(studentCount2bu / maxGroupSize)))
    : 0;

  return ensureEvenCombinedGroupCounts({
    groupCount1bu: rawCount1,
    groupCount2bu: rawCount2,
    maxGroups1,
    maxGroups2,
    studentCount1bu,
    studentCount2bu,
  });
}

/** 참가자 목록 → 반 단위 ClassUnit 목록 생성
 *  grade/class는 students DB 기준 사용 → UI 표시와 일치 보장 */
