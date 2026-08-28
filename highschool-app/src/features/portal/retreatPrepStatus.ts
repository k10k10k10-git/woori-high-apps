import type { Group, Participant, Room } from "@/lib/types";

/**
 * 수련회 행정 화면이 탭 구조보다 먼저 보여줄 "남은 일" 요약.
 *
 * 화면은 명단·편성·이동·물품처럼 데이터 모듈로 나뉘어 있어, 처음 들어온 담당자는
 * 지금 무엇이 밀려 있는지 알려면 탭을 하나씩 열어봐야 했다. 여기서는 이미 구독 중인
 * 참가자·조·방 데이터만으로 각 단계의 미해결 건수를 세어 한 줄로 요약한다.
 * 새 DB 경로나 저장은 없다 — 읽은 값을 세기만 한다.
 */
export type RetreatPrepStageKey = "review" | "roster" | "groups" | "rooms";

export interface RetreatPrepStage {
  key: RetreatPrepStageKey;
  label: string;
  /** 남은 건수. roster는 남은 일이 아니라 현재 명단 인원이다. */
  count: number;
  /** 남은 건수를 판단한 모집단. review·roster는 전체 신청 인원. */
  total: number;
  tone: "attention" | "done" | "info";
  detail: string;
  tabIdx: number;
}

export interface RetreatPrepStatus {
  stages: RetreatPrepStage[];
  /** 지금 손봐야 할 단계 수 — 0이면 요약 줄 전체가 "정리됨" 상태다. */
  attentionCount: number;
}

const TAB_PARTICIPANTS = 0;
const TAB_GROUPS = 1;
const TAB_ROOMS = 2;

function assignedStudentIds(units: ReadonlyArray<{ studentIds?: string[] }>): Set<string> {
  const ids = new Set<string>();
  for (const unit of units) {
    for (const id of unit.studentIds ?? []) {
      if (id) ids.add(id);
    }
  }
  return ids;
}

export function buildRetreatPrepStatus(input: {
  participants: Record<string, Participant>;
  groups: Group[];
  rooms: Room[];
}): RetreatPrepStatus {
  const list = Object.values(input.participants ?? {});
  const total = list.length;
  // 학생 원장과 이어지지 않은 신청은 조·방 배정 대상이 될 수 없다.
  // 그래서 편성 단계의 모집단에서도 빼고, 대신 검토 단계가 책임진다.
  const matched = list.filter((p) => !!p.studentId);
  const unmatched = total - matched.length;
  const inGroups = assignedStudentIds(input.groups ?? []);
  const inRooms = assignedStudentIds(input.rooms ?? []);
  const withoutGroup = matched.filter((p) => !inGroups.has(p.studentId as string)).length;
  const withoutRoom = matched.filter((p) => !inRooms.has(p.studentId as string)).length;

  const stages: RetreatPrepStage[] = [
    {
      key: "review",
      label: "검토 필요",
      count: unmatched,
      total,
      tone: unmatched > 0 ? "attention" : "done",
      detail: total === 0
        ? "신청 명단을 아직 불러오지 않았습니다"
        : unmatched > 0
          ? `학생 명단과 이어지지 않은 신청 ${unmatched}명`
          : "모든 신청이 학생 명단과 연결됨",
      tabIdx: TAB_PARTICIPANTS,
    },
    {
      key: "roster",
      label: "명단",
      count: total,
      total,
      tone: "info",
      detail: total === 0 ? "신청 0명" : `신청 ${total}명`,
      tabIdx: TAB_PARTICIPANTS,
    },
    {
      key: "groups",
      label: "조편성",
      count: withoutGroup,
      total: matched.length,
      tone: withoutGroup > 0 ? "attention" : "done",
      detail: matched.length === 0
        ? "편성할 인원이 아직 없습니다"
        : withoutGroup > 0
          ? `조 배정 안 된 학생 ${withoutGroup}명`
          : "전원 조 배정 완료",
      tabIdx: TAB_GROUPS,
    },
    {
      key: "rooms",
      label: "방배정",
      count: withoutRoom,
      total: matched.length,
      tone: withoutRoom > 0 ? "attention" : "done",
      detail: matched.length === 0
        ? "배정할 인원이 아직 없습니다"
        : withoutRoom > 0
          ? `방 배정 안 된 학생 ${withoutRoom}명`
          : "전원 방 배정 완료",
      tabIdx: TAB_ROOMS,
    },
  ];

  return { stages, attentionCount: stages.filter((s) => s.tone === "attention").length };
}
