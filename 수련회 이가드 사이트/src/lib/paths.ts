/** Firebase Realtime Database 경로 단일 원천.
 *  컴포넌트·db 함수에서 경로 문자열을 직접 쓰지 말고 이 함수를 사용한다. */

export const paths = {
  // ── 수련회 (행정 소유, 읽기 전용) ──
  retreats: () => "retreats",
  retreat: (id: string) => `retreats/${id}`,

  // ── 참가자 (행정 소유, 읽기 전용) ──
  participants: (id: string) => `retreats/${id}/participants`,
  teachers: (id: string) => `retreats/${id}/teachers`,
  groups: (id: string) => `retreats/${id}/groups`,
  rooms: (id: string) => `retreats/${id}/rooms`,
  partialAttendances: (id: string) => `retreats/${id}/partialAttendances`,
  cellColors: (id: string) => `retreats/${id}/cellColors`,
  periods: (id: string) => `retreats/${id}/periods`,

  // ── 학생 앱 소유 (읽기 전용) ──
  classes: (year: number) => `classes/${year}`,

  // ── 이가드 소유 (쓰기 가능) ──
  iguard: (id: string) => `retreats/${id}/iguard`,
  iguardSchedule: (id: string) => `retreats/${id}/iguard/schedule`,
  iguardScheduleBlock: (id: string, blockId: string) => `retreats/${id}/iguard/schedule/${blockId}`,
  iguardPosts: (id: string) => `retreats/${id}/iguard/posts`,
  iguardPost: (id: string, postId: string) => `retreats/${id}/iguard/posts/${postId}`,
  iguardMovements: (id: string) => `retreats/${id}/iguard/movements`,
  iguardMovement: (id: string, key: string) => `retreats/${id}/iguard/movements/${key}`,
  iguardBuses: (id: string) => `retreats/${id}/iguard/buses`,
  iguardBus: (id: string, busId: string) => `retreats/${id}/iguard/buses/${busId}`,
  iguardMeals: (id: string) => `retreats/${id}/iguard/meals`,
  iguardMeal: (id: string, mealId: string) => `retreats/${id}/iguard/meals/${mealId}`,
  iguardAttendance: (id: string) => `retreats/${id}/iguard/attendance`,
  iguardAttendanceEntry: (id: string, key: string) => `retreats/${id}/iguard/attendance/${key}`,
  iguardSeating: (id: string) => `retreats/${id}/iguard/seating`,
  iguardSeatingEntry: (id: string, sid: string) => `retreats/${id}/iguard/seating/${sid}`,
  iguardGroupStaff: (id: string) => `retreats/${id}/iguard/groupStaff`,
  iguardGroupStaffEntry: (id: string, groupId: string) => `retreats/${id}/iguard/groupStaff/${groupId}`,
  iguardCueSheet: (id: string) => `retreats/${id}/iguard/cueSheet`,
  iguardGuide: (id: string) => `retreats/${id}/iguard/guide`,

  // ── 마일스톤 (전역 공유) ──
  prepMilestones: () => "prepMilestones",
  prepMilestone: (id: string) => `prepMilestones/${id}`,

  // ── 접근 관리 ──
  admins: (uid: string) => `admins/${uid}`,
  retreatAdmins: (uid: string) => `retreatAdmins/${uid}`,
  iguardMembers: () => "iguardMembers",
  iguardMember: (uid: string) => `iguardMembers/${uid}`,
  iguardRoles: () => "iguardRoles",
  iguardRole: (uid: string) => `iguardRoles/${uid}`,
  iguardPending: () => "iguardPending",
  iguardPendingEntry: (uid: string) => `iguardPending/${uid}`,
} as const;
