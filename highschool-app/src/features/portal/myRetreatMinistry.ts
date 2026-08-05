import { movementsForDefaultSegments } from "@/features/iguard/lib/defaultSegment";
import { resolveGroupStaffNames } from "@/features/iguard/lib/groupStaffNames";
import { dutyLabelsForStaff, dutyLinesForStaff } from "@/features/iguard/lib/personalDuty";
import { compareBlocks } from "@/features/iguard/lib/scheduleTime";
import { findPreferredStaffId, normalizeStaffIdentityName } from "@/features/iguard/lib/staffIdentity";
import type {
  Group,
  IguardMovement,
  IguardPost,
  IguardScheduleBlock,
  IguardSegment,
  TeacherAttendance,
} from "@/features/iguard/lib/types";

export interface MyRetreatDuty {
  blockId: string;
  day: number;
  start: string;
  scheduleLabel: string;
  roles: string[];
  posts: string[];
}

export interface MyRetreatMinistry {
  matchedStaffId: string | null;
  matchedName: string | null;
  groups: Array<Pick<Group, "id" | "name" | "bu">>;
  duties: MyRetreatDuty[];
}

interface MyRetreatMinistryInput {
  teachers: TeacherAttendance[];
  groups: Group[];
  groupStaff: Record<string, string[]>;
  schedule: IguardScheduleBlock[];
  segments: IguardSegment[];
  movements: IguardMovement[];
  posts: IguardPost[];
  preferredNames: Array<string | null | undefined>;
}

/**
 * 통합 홈의 "내 담당 사역"을 이가드 개인 큐카드와 같은 기준으로 계산한다.
 * 새 DB 노드 없이 기존 교사·조스탭·큐싯·동선 데이터를 읽어 파생한다.
 */
export function buildMyRetreatMinistry(input: MyRetreatMinistryInput): MyRetreatMinistry {
  const activeStaff = input.teachers
    .filter(teacher => teacher.bu === "스탭" && teacher.status !== "불참" && teacher.name?.trim())
    .map(teacher => ({ id: teacher.id, name: teacher.name.trim() }));
  const matchedStaffId = findPreferredStaffId(activeStaff, input.preferredNames);
  const matchedName = activeStaff.find(staff => staff.id === matchedStaffId)?.name ?? null;

  if (!matchedStaffId || !matchedName) {
    return { matchedStaffId: null, matchedName: null, groups: [], duties: [] };
  }

  const matchedNameKey = normalizeStaffIdentityName(matchedName);
  const assignedGroups = input.groups
    .filter(group => resolveGroupStaffNames(group.staff, input.groupStaff[group.id], activeStaff)
      .some(name => normalizeStaffIdentityName(name) === matchedNameKey))
    .map(({ id, name, bu }) => ({ id, name, bu }))
    .sort((a, b) => a.bu.localeCompare(b.bu, "ko") || a.name.localeCompare(b.name, "ko", { numeric: true }));

  const postById = new Map(input.posts.map(post => [post.id, post.area ? `[${post.area}] ${post.name}` : post.name]));
  const movesByBlock = new Map<string, string[]>();
  movementsForDefaultSegments(input.segments, input.movements)
    .filter(movement => movement.staffId === matchedStaffId)
    .forEach(movement => {
      const label = postById.get(movement.postId) ?? "삭제된 포스트";
      const values = movesByBlock.get(movement.blockId) ?? [];
      if (!values.includes(label)) values.push(label);
      movesByBlock.set(movement.blockId, values);
    });

  const duties = [...input.schedule]
    .sort(compareBlocks)
    .map(block => ({
      blockId: block.id,
      day: block.day,
      start: block.start,
      scheduleLabel: block.label,
      roles: dutyLabelsForStaff(dutyLinesForStaff(block, matchedName), matchedName),
      posts: movesByBlock.get(block.id) ?? [],
    }))
    .filter(duty => duty.roles.length > 0 || duty.posts.length > 0);

  return { matchedStaffId, matchedName, groups: assignedGroups, duties };
}
