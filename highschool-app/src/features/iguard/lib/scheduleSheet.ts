import type {
  IguardMovement,
  IguardPost,
  IguardSegment,
  IguardStaff,
} from "./types";

export interface ScheduleAssignmentSummaryLine {
  segmentId: string;
  segmentLabel: string;
  postId: string;
  postLabel: string;
  assignees: string[];
}

function displayPost(post?: IguardPost): string {
  if (!post) return "삭제된 포스트";
  return post.area ? `[${post.area}] ${post.name}` : post.name;
}

/**
 * 시트형 큐싯 행에 표시할 담당·동선 요약을 만든다.
 * 저장 형태(segment → movement)는 그대로 두고 작성 화면에서만 한 줄로 접어 보여준다.
 */
export function buildScheduleAssignmentSummary(
  blockId: string,
  segments: IguardSegment[],
  movements: IguardMovement[],
  staff: IguardStaff[],
  posts: IguardPost[],
): ScheduleAssignmentSummaryLine[] {
  const segmentMap = new Map(segments.map(segment => [segment.id, segment]));
  const staffMap = new Map(staff.map(person => [person.id, person.name]));
  const postMap = new Map(posts.map(post => [post.id, post]));
  const grouped = new Map<string, ScheduleAssignmentSummaryLine>();

  movements
    .filter(movement => movement.blockId === blockId)
    .forEach(movement => {
      const segment = movement.segmentId ? segmentMap.get(movement.segmentId) : undefined;
      const segmentId = segment?.id || movement.segmentId || "legacy";
      const key = `${segmentId}__${movement.postId}`;
      const current = grouped.get(key) || {
        segmentId,
        segmentLabel: segment?.label || "전체",
        postId: movement.postId,
        postLabel: displayPost(postMap.get(movement.postId)),
        assignees: [],
      };
      const assignee = movement.staffId
        ? staffMap.get(movement.staffId) || "명단 없음"
        : movement.actor?.trim() || "담당 미정";
      const suffix = movement.round ? ` (${movement.round})` : "";
      current.assignees.push(`${assignee}${suffix}`);
      grouped.set(key, current);
    });

  return [...grouped.values()].sort((a, b) => {
    const aSegment = segmentMap.get(a.segmentId);
    const bSegment = segmentMap.get(b.segmentId);
    return (aSegment?.order ?? Number.MAX_SAFE_INTEGER) - (bSegment?.order ?? Number.MAX_SAFE_INTEGER)
      || a.postLabel.localeCompare(b.postLabel, "ko");
  });
}

