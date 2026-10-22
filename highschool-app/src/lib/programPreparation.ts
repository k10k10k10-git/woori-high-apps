import type {
  Group,
  RetreatProgram,
  RetreatProgramActivityType,
  RetreatProgramFulfillmentStatus,
  RetreatProgramItem,
  RetreatProgramItemStatus,
  RetreatProgramKind,
  RetreatProgramMatch,
  RetreatProgramOperationMode,
  RetreatProgramParticipationMode,
  RetreatProgramPost,
  RetreatProgramRole,
  RetreatProgramStatus,
  RetreatProgramCompetitionTeam,
  RetreatProgramDecision,
  RetreatProgramMeeting,
  RetreatProgramRelease,
  RetreatProgramTask,
} from "./types";
import { seoulDateKey } from "../features/portal/dailyMinistryMessage";

export const PROGRAM_STATUS_META: Record<RetreatProgramStatus, { label: string; description: string }> = {
  draft: { label: "초안", description: "내용을 작성하는 중입니다." },
  review: { label: "검토 중", description: "담당자가 내용을 확인하고 있습니다." },
  confirmed: { label: "확정", description: "준비 내용이 확정됐습니다. 현장 정보 화면 목록에는 아직 표시되지 않습니다." },
  published: { label: "현장 공유", description: "이가드 정보 화면에 공유됩니다." },
};

export const PROGRAM_KIND_META: Record<RetreatProgramKind, string> = {
  main: "집중형",
  post: "포스트·코스형",
  sports: "운동회·대진형",
  reflection: "묵상·메시지형",
  mixed: "혼합형",
  other: "기타",
};

export const PROGRAM_ACTIVITY_TYPE_META: Record<RetreatProgramActivityType, { label: string; help: string }> = {
  game: { label: "게임·미션", help: "규칙, 판정과 준비물을 중심으로 작성합니다." },
  reflection: { label: "묵상·나눔", help: "말씀, 질문과 교사 안내를 중심으로 작성합니다." },
  video: { label: "영상", help: "재생 파일, 장비, 담당과 대체 진행을 확인합니다." },
  briefing: { label: "브리핑·설명", help: "대상별 안내와 다음 행동을 명확하게 적습니다." },
  movement: { label: "이동·전환", help: "출발지, 도착지, 인솔과 합류 조건을 확인합니다." },
  setup: { label: "세팅", help: "설치 위치, 필요한 장비와 완료 확인을 기록합니다." },
  worship: { label: "찬양·기도", help: "진행 순서, 음향·영상과 교사 안내를 준비합니다." },
  cleanup: { label: "정리·회수", help: "회수 물품, 반납 장소와 담당을 기록합니다." },
  other: { label: "일반 활동", help: "필요한 진행 내용과 담당을 자유롭게 작성합니다." },
};

const PROGRAM_ACTIVITY_REQUIREMENTS: Record<RetreatProgramActivityType, { items: boolean; test: boolean }> = {
  game: { items: true, test: true },
  reflection: { items: false, test: false },
  video: { items: true, test: true },
  briefing: { items: false, test: false },
  movement: { items: false, test: false },
  setup: { items: true, test: true },
  worship: { items: false, test: true },
  cleanup: { items: false, test: false },
  other: { items: false, test: false },
};

export const PROGRAM_OPERATION_MODE_META: Record<RetreatProgramOperationMode, { label: string; description: string }> = {
  whole: { label: "전체 진행", description: "MC가 앞에서 모두를 이끄는 진행" },
  course: { label: "코스 순환", description: "조가 여러 코스를 순서대로 이동" },
  group: { label: "조별 협력", description: "기존 조 안에서 함께 해결하는 활동" },
  alliance: { label: "연합팀 경쟁", description: "여러 조를 큰 팀으로 묶어 경쟁" },
  break: { label: "설명·이동·휴식", description: "게임 사이 안내와 전환 구간" },
};

export const PROGRAM_PARTICIPATION_MODE_META: Record<RetreatProgramParticipationMode, string> = {
  individual: "개인",
  retreatGroup: "기존 수련회 조",
  allianceTeam: "프로그램 연합팀",
  department: "부서별",
  temporary: "현장 임시 편성",
};

export const PROGRAM_TASK_STATUS_META: Record<NonNullable<RetreatProgramTask["status"]>, string> = {
  todo: "할 일",
  doing: "진행 중",
  blocked: "막힘",
  done: "완료",
};

export function programOperationMode(post: RetreatProgramPost): RetreatProgramOperationMode {
  return post.operationMode && PROGRAM_OPERATION_MODE_META[post.operationMode] ? post.operationMode : "whole";
}

export function programParticipationMode(post: RetreatProgramPost): RetreatProgramParticipationMode {
  return post.participationMode && PROGRAM_PARTICIPATION_MODE_META[post.participationMode]
    ? post.participationMode
    : "retreatGroup";
}

/**
 * 상태·종류 라벨은 DB 값을 그대로 키로 쓴다. 스키마가 늘었다 줄거나 레코드를 손으로 고치면
 * 모르는 값이 들어올 수 있는데, 그때 화면 전체가 죽는 대신 기본값으로 계속 읽히게 한다.
 */
export function programStatusMeta(status: RetreatProgramStatus) {
  return PROGRAM_STATUS_META[status] ?? PROGRAM_STATUS_META.draft;
}

export function programKindMeta(kind: RetreatProgramKind) {
  return PROGRAM_KIND_META[kind] ?? PROGRAM_KIND_META.other;
}

export function programActivityType(post: Pick<RetreatProgramPost, "activityType">): RetreatProgramActivityType {
  return post.activityType && PROGRAM_ACTIVITY_TYPE_META[post.activityType] ? post.activityType : "game";
}

export function programActivityRequirements(post: Pick<RetreatProgramPost, "activityType" | "operationMode">): { items: boolean; test: boolean } {
  if ((post.operationMode ?? "whole") === "break") return { items: false, test: false };
  return PROGRAM_ACTIVITY_REQUIREMENTS[programActivityType(post)];
}

/**
 * 편집기가 서버 값으로 초안을 덮어써도 되는지 판단한다.
 *
 * 프로그램을 바꾸거나 변경을 버린 것은 사용자의 의도이므로 항상 동기화한다.
 * 반면 같은 프로그램을 편집하는 중(dirty)에 들어온 갱신은 **다른 사람의 저장**이다 —
 * 이때 덮어쓰면 작성 중이던 대본이 경고 없이 사라지므로 동기화하지 않고 알리기만 한다.
 */
export function shouldSyncEditorDraft(input: {
  dirty: boolean;
  previous: { id: string; resetVersion: number };
  next: { id: string; resetVersion: number };
}): boolean {
  if (input.previous.id !== input.next.id) return true;
  if (input.previous.resetVersion !== input.next.resetVersion) return true;
  return !input.dirty;
}

export function createProgramDraft(order: number, title = `프로그램 ${order}`): Omit<RetreatProgram, "id"> {
  const now = Date.now();
  return {
    order,
    title,
    kind: "main",
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
}

export type ProgramTemplateKey = "blank" | "host" | "course" | "group" | "alliance" | "reflection" | "mixed";

export const PROGRAM_TEMPLATE_META: Record<ProgramTemplateKey, { label: string; description: string }> = {
  blank: { label: "직접 만들기", description: "정해진 형식 없이 빈 프로그램에서 시작합니다." },
  host: { label: "한 장소에서 함께 진행", description: "진행자가 앞에서 전체를 이끄는 활동입니다." },
  course: { label: "조별로 장소 이동", description: "조가 여러 장소를 차례로 이동합니다." },
  group: { label: "현재 조대로 진행", description: "수련회 조별로 함께 참여하는 활동입니다." },
  alliance: { label: "여러 조를 큰 팀으로", description: "여러 조를 묶어 팀 대항으로 진행합니다." },
  reflection: { label: "말씀·묵상 중심", description: "말씀, 영상, 나눔과 기도를 이어갑니다." },
  mixed: { label: "여러 형식을 섞어 진행", description: "전체 진행과 조별 활동 등을 한 흐름에 섞습니다." },
};

/** 새 프로그램의 시작 비용만 줄이고 이후 편집 방식은 제한하지 않는다. */
export function createProgramFromTemplate(order: number, template: ProgramTemplateKey): Omit<RetreatProgram, "id"> {
  const base = createProgramDraft(order);
  if (template === "blank") return base;
  const now = Date.now();
  const block = (
    index: number,
    name: string,
    operationMode: RetreatProgramOperationMode,
    participationMode: RetreatProgramParticipationMode,
    activityType: RetreatProgramActivityType = "game",
  ): RetreatProgramPost => {
    const requirements = operationMode === "break"
      ? { items: false, test: false }
      : PROGRAM_ACTIVITY_REQUIREMENTS[activityType];
    return {
      id: `template-${index}`,
      order: index,
      name,
      activityType,
      operationMode,
      participationMode,
      scoreEnabled: operationMode === "alliance",
      testStatus: requirements.test ? "needed" : "notNeeded",
      createdAt: now + index,
      updatedAt: now + index,
    };
  };
  const presets: Record<Exclude<ProgramTemplateKey, "blank">, {
    title: string;
    kind: RetreatProgramKind;
    blocks: Array<[string, RetreatProgramOperationMode, RetreatProgramParticipationMode, RetreatProgramActivityType?]>;
  }> = {
    host: {
      title: "전체 진행 프로그램",
      kind: "main",
      blocks: [["오프닝", "break", "retreatGroup"], ["규칙 설명", "whole", "retreatGroup"], ["메인 활동", "whole", "retreatGroup"], ["결과·마무리", "break", "retreatGroup"]],
    },
    course: {
      title: "코스 순환 프로그램",
      kind: "post",
      blocks: [["전체 브리핑", "whole", "retreatGroup"], ["코스 순환", "course", "retreatGroup"], ["복귀·점수 집계", "break", "retreatGroup"]],
    },
    group: {
      title: "조별 협력 프로그램",
      kind: "main",
      blocks: [["아이스브레이킹", "group", "retreatGroup"], ["조별 협력 활동", "group", "retreatGroup"], ["나눔·마무리", "break", "retreatGroup"]],
    },
    alliance: {
      title: "연합팀 경쟁 프로그램",
      kind: "sports",
      blocks: [["연합팀 편성·설명", "break", "allianceTeam"], ["연합팀 메인 경기", "alliance", "allianceTeam"], ["점수 집계·시상", "break", "allianceTeam"]],
    },
    reflection: {
      title: "묵상·메시지 프로그램",
      kind: "reflection",
      blocks: [
        ["오프닝·안내", "whole", "retreatGroup", "briefing"],
        ["말씀·영상", "whole", "retreatGroup", "video"],
        ["개인 묵상", "group", "individual", "reflection"],
        ["조별 나눔", "group", "retreatGroup", "reflection"],
        ["찬양·기도", "whole", "retreatGroup", "worship"],
      ],
    },
    mixed: {
      title: "혼합 진행 프로그램",
      kind: "mixed",
      blocks: [
        ["전체 오프닝", "whole", "retreatGroup", "briefing"],
        ["장소별 활동", "course", "retreatGroup", "game"],
        ["이동·합류", "break", "retreatGroup", "movement"],
        ["전체 마무리", "whole", "retreatGroup", "reflection"],
      ],
    },
  };
  const preset = presets[template];
  const posts = Object.fromEntries(preset.blocks.map(([name, operationMode, participationMode, activityType], index) => {
    const entry = block(index + 1, name, operationMode, participationMode, activityType);
    return [entry.id, entry];
  }));
  return { ...base, title: preset.title, kind: preset.kind, posts };
}

export function programTaskStatus(task: RetreatProgramTask): NonNullable<RetreatProgramTask["status"]> {
  if (task.status === "done" || task.done) return "done";
  return task.status && task.status in PROGRAM_TASK_STATUS_META ? task.status : "todo";
}

export function programTaskProgress(program: RetreatProgram, today = seoulDateKey()) {
  const tasks = programTasks(program);
  const done = tasks.filter((task) => programTaskStatus(task) === "done").length;
  const blocked = tasks.filter((task) => programTaskStatus(task) === "blocked").length;
  const doing = tasks.filter((task) => programTaskStatus(task) === "doing").length;
  const overdue = tasks.filter((task) => programTaskStatus(task) !== "done" && Boolean(task.dueDate && task.dueDate < today)).length;
  const unassigned = tasks.filter((task) => programTaskStatus(task) !== "done" && !task.assignee?.trim()).length;
  return {
    total: tasks.length,
    done,
    doing,
    blocked,
    overdue,
    unassigned,
    percent: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
  };
}

export function programMeetings(program: Pick<RetreatProgram, "meetings">): RetreatProgramMeeting[] {
  return Object.entries(program.meetings ?? {})
    .map(([id, meeting]) => ({ ...meeting, id: meeting.id || id }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt || a.id.localeCompare(b.id));
}

export function meetingDecisions(meeting: RetreatProgramMeeting): RetreatProgramDecision[] {
  return Object.entries(meeting.decisions ?? {})
    .map(([id, decision]) => ({ ...decision, id: decision.id || id }))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/** 결정에서 만든 작업을 지울 때 원본 결정의 연결도 함께 해제하기 위한 역참조. */
export function programTaskDecisionLink(
  program: RetreatProgram,
  task: RetreatProgramTask,
): { meetingId: string; decisionId: string } | undefined {
  if (task.sourceMeetingId && task.sourceDecisionId) {
    return { meetingId: task.sourceMeetingId, decisionId: task.sourceDecisionId };
  }
  for (const meeting of programMeetings(program)) {
    const decision = meetingDecisions(meeting).find((entry) => entry.taskId === task.id);
    if (decision) return { meetingId: meeting.id, decisionId: decision.id };
  }
  return undefined;
}

/** 같은 회의 결정을 여러 번 변환해도 작업 하나로 수렴시키는 결정적 Firebase 키. */
export function programDecisionTaskId(meetingId: string, decisionId: string): string {
  return `decision-${meetingId}-${decisionId}`;
}

/** 진행 블록의 현장 실행 가능 여부를 목록·진행표·공유 게이트가 함께 사용한다. */
export function programPostReadiness(
  post: RetreatProgramPost,
  items: RetreatProgramItem[],
  roles: RetreatProgramRole[],
) {
  const operationMode = programOperationMode(post);
  const requirements = programActivityRequirements(post);
  const roleCount = roles.filter((role) => role.assignee?.trim()).length;
  const itemCount = items.length;
  const contentReady = Boolean(post.rules?.trim() || post.concept?.trim());
  const rolesReady = roles.length > 0 && roleCount === roles.length;
  // 묵상·브리핑·이동처럼 물품이 본질이 아닌 형식은 빈 물품표를 정상으로 본다.
  const itemsReady = !requirements.items || operationMode === "break" || (
    itemCount > 0
    && items.every((item) =>
      item.status === "inChurch"
      || item.status === "toMake"
      || Number(item.quantity ?? 0) > 0,
    )
  );
  const testReady = !requirements.test || post.testStatus === "passed" || post.testStatus === "notNeeded";
  const blocked = Boolean(post.blocker?.trim());
  return {
    contentReady,
    rolesReady,
    itemsReady,
    testReady,
    blocked,
    roleCount,
    itemCount,
    ready: contentReady && rolesReady && itemsReady && testReady && !blocked,
  };
}

export function sortRetreatPrograms(programs: RetreatProgram[]): RetreatProgram[] {
  return [...programs].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/**
 * 준비율이 보는 항목.
 *
 * 본문 필드만 세면 활동 11개와 물품 30줄을 다 채워도 0%에 머문다 — 실제로 한 일과
 * 화면의 진행 표시가 어긋나 "뭘 해도 진도가 안 나가는" 화면이 된다.
 * 그래서 활동·역할·물품도 함께 센다.
 */
const CHECKS: Array<{
  key: string;
  section: ProgramSectionKey;
  action: string;
  targetId: (program: RetreatProgram) => string;
  ready: (program: RetreatProgram) => boolean;
}> = [
  {
    key: "일정과 장소",
    section: "overview",
    action: "일정·장소 입력",
    targetId: (program) => !program.date ? "program-date" : !program.startTime ? "program-start-time" : "program-place",
    ready: (program) => Boolean(program.date && program.startTime && program.place?.trim()),
  },
  { key: "담당", section: "overview", action: "총괄 담당 지정", targetId: () => "program-lead", ready: (program) => Boolean(program.lead?.trim()) },
  { key: "목표", section: "overview", action: "프로그램 목표 작성", targetId: () => "program-objective", ready: (program) => Boolean(program.objective?.trim()) },
  { key: "진행안", section: "posts", action: "전체 진행안 작성", targetId: () => "program-flow", ready: (program) => Boolean(program.flow?.trim()) },
  // 존재 여부만 세면 이름만 적은 활동·담당 없는 역할·수량 없는 물품으로도 100%가 된다.
  // 지표가 거짓말하지 않도록 "현장에서 쓸 수 있는 최소한"이 채워졌는지까지 본다.
  {
    key: "활동 구성",
    section: "posts",
    action: "진행 블록 내용 채우기",
    targetId: (program) => {
      const incomplete = programPosts(program).find((post) => !post.rules?.trim() && !post.concept?.trim());
      return incomplete ? `program-post-rules-${incomplete.id}` : "program-new-block-name";
    },
    ready: (program) => {
      const posts = programPosts(program);
      return posts.length > 0 && posts.every((post) => programPostReadiness(post, itemsOfPost(program, post.id), rolesOfPost(program, post.id)).contentReady);
    },
  },
  {
    key: "역할",
    section: "posts",
    action: "진행 블록에 담당 배치",
    targetId: (program) => {
      for (const post of programPosts(program)) {
        const roles = rolesOfPost(program, post.id);
        if (roles.length > 0 && roles.every((role) => role.assignee?.trim())) continue;
        const unassigned = roles.find((role) => !role.assignee?.trim());
        return unassigned ? `program-role-assignee-${unassigned.id}` : `program-role-add-${post.id}`;
      }
      return "program-new-block-name";
    },
    ready: (program) => {
      const posts = programPosts(program);
      return posts.length > 0 && posts.every((post) => programPostReadiness(post, itemsOfPost(program, post.id), rolesOfPost(program, post.id)).rolesReady);
    },
  },
  {
    key: "물품",
    section: "posts",
    action: "진행 블록에 준비물 입력",
    targetId: (program) => {
      for (const post of programPosts(program)) {
        if (!programActivityRequirements(post).items) continue;
        const items = itemsOfPost(program, post.id);
        const incomplete = items.find((item) =>
          item.status !== "inChurch" && item.status !== "toMake" && Number(item.quantity ?? 0) <= 0,
        );
        if (incomplete) return `program-item-quantity-${incomplete.id}`;
        if (items.length === 0) return `program-item-add-${post.id}`;
      }
      return "program-new-block-name";
    },
    // 사야 하는 물품은 수량이 있어야 발주가 된다. 교회 비품·제작 예정은 수량 없이도 정리된 것으로 본다.
    ready: (program) => {
      const posts = programPosts(program);
      return posts.length > 0 && posts.every((post) =>
        programPostReadiness(post, itemsOfPost(program, post.id), rolesOfPost(program, post.id)).itemsReady,
      );
    },
  },
  {
    key: "사전 테스트",
    section: "posts",
    action: "진행 블록 테스트 확인",
    targetId: (program) => {
      const post = programPosts(program).find((entry) => !programPostReadiness(entry, itemsOfPost(program, entry.id), rolesOfPost(program, entry.id)).testReady);
      return post ? `program-post-test-${post.id}` : "program-new-block-name";
    },
    ready: (program) => {
      const posts = programPosts(program);
      return posts.length > 0 && posts.every((post) => programPostReadiness(post, itemsOfPost(program, post.id), rolesOfPost(program, post.id)).testReady);
    },
  },
  {
    key: "막힌 준비",
    section: "posts",
    action: "막힌 준비 해결",
    targetId: (program) => {
      const post = programPosts(program).find((entry) => entry.blocker?.trim());
      return post ? `program-post-blocker-${post.id}` : "program-new-block-name";
    },
    ready: (program) => programPosts(program).every((post) => !post.blocker?.trim()),
  },
  { key: "브리핑 또는 대본", section: "overview", action: "현장 전달 내용 작성", targetId: () => "program-briefing", ready: (program) => Boolean(program.briefing?.trim() || program.script?.trim()) },
];

export function programReadiness(program: RetreatProgram) {
  const items = CHECKS.map((check) => ({
    label: check.key,
    section: check.section,
    action: check.action,
    targetId: check.targetId(program),
    ready: check.ready(program),
  }));
  const readyLabels = items.filter((item) => item.ready).map((item) => item.label);
  const missingLabels = items.filter((item) => !item.ready).map((item) => item.label);
  return {
    ready: readyLabels.length,
    total: CHECKS.length,
    percent: Math.round((readyLabels.length / CHECKS.length) * 100),
    readyLabels,
    missingLabels,
    items,
  };
}

/** 현장 공유는 일반 상태 변경이 아니라 준비 항목을 모두 통과한 뒤 실행하는 별도 작업이다. */
export function canPublishProgram(program: RetreatProgram): boolean {
  return programReadiness(program).percent === 100
    && programTasks(program).every((task) => programTaskStatus(task) === "done");
}

export function programTasks(program: RetreatProgram) {
  return Object.entries(program.tasks ?? {})
    .map(([id, task]) => ({ ...task, id: task.id || id }))
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

// ── 하위 목록 ────────────────────────────────────────────────
// tasks와 같은 규약: DB는 id를 필드로 저장하지 않으므로 Firebase 키에서 복원한다.
// 이 복원을 빼면 화면이 undefined 키로 저장·삭제를 시도해 노드를 오염시킨다.
function listOf<T extends { order?: number; createdAt: number; id: string }>(
  map: Record<string, T> | undefined,
): T[] {
  return Object.entries(map ?? {})
    .map(([id, entry]) => ({ ...entry, id: entry.id || id }))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.id.localeCompare(b.id));
}

export function programPosts(program: RetreatProgram): RetreatProgramPost[] {
  return listOf(program.posts);
}

/** 진행 블록 한 개를 위·아래로 옮긴 뒤 저장할 ID 순서를 반환한다. 범위를 벗어나면 원래 순서를 유지한다. */
export function moveProgramPostOrder(
  posts: RetreatProgramPost[],
  postId: string,
  direction: -1 | 1,
): string[] {
  const ordered = [...posts].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const index = ordered.findIndex((post) => post.id === postId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= ordered.length) return ordered.map((post) => post.id);
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
  return ordered.map((post) => post.id);
}

export function programItems(program: RetreatProgram): RetreatProgramItem[] {
  return listOf(program.items);
}

export function programRoles(program: RetreatProgram): RetreatProgramRole[] {
  return listOf(program.roles);
}

export function programCompetitionTeams(program: RetreatProgram): RetreatProgramCompetitionTeam[] {
  return listOf(program.competitionTeams);
}

/**
 * 기본 조를 쪼개지 않고 연합팀별 학생 수가 비슷해지도록 큰 조부터 차례로 배치한다.
 * 결과는 미리보기용 순수 함수이고, 실제 저장은 사용자가 적용을 눌렀을 때만 한다.
 */
export function balanceGroupsAcrossCompetitionTeams(
  groups: Group[],
  teams: RetreatProgramCompetitionTeam[],
): Record<string, string> {
  if (teams.length === 0) return {};
  const orderedTeams = [...teams].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const loads = new Map(orderedTeams.map((team) => [team.id, 0]));
  const assignment: Record<string, string> = {};
  const orderedGroups = [...groups].sort((a, b) =>
    (b.studentIds?.length ?? 0) - (a.studentIds?.length ?? 0) || a.name.localeCompare(b.name, "ko"),
  );

  for (const group of orderedGroups) {
    const target = orderedTeams.reduce((best, team) => {
      const bestLoad = loads.get(best.id) ?? 0;
      const teamLoad = loads.get(team.id) ?? 0;
      return teamLoad < bestLoad ? team : best;
    });
    assignment[group.id] = target.id;
    loads.set(target.id, (loads.get(target.id) ?? 0) + (group.studentIds?.length ?? 0));
  }
  return assignment;
}

export const PROGRAM_ITEM_STATUS_META: Record<RetreatProgramItemStatus, { label: string; counts: boolean }> = {
  todo: { label: "구매 예정", counts: true },
  ordered: { label: "주문함", counts: true },
  purchased: { label: "구매 완료", counts: true },
  // 교회 비품과 자체 제작은 지출이 아니므로 예산 합계에서 뺀다.
  inChurch: { label: "교회에 있음", counts: false },
  toMake: { label: "제작 예정", counts: false },
};

export const PROGRAM_FULFILLMENT_STATUS_META: Record<RetreatProgramFulfillmentStatus, string> = {
  requested: "요청",
  approved: "확인",
  ordered: "주문",
  received: "수령",
  packed: "포장",
  onsite: "현장 도착",
  returned: "반납",
};

export function programItemStatusMeta(status: RetreatProgramItemStatus) {
  return PROGRAM_ITEM_STATUS_META[status] ?? PROGRAM_ITEM_STATUS_META.todo;
}

/** 물품 한 줄의 금액 — 수량 × 단가. 둘 중 하나라도 없으면 0으로 본다. */
export function programItemTotal(item: Pick<RetreatProgramItem, "quantity" | "unitPrice">): number {
  const quantity = Number(item.quantity ?? 0);
  const unitPrice = Number(item.unitPrice ?? 0);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  return Math.max(0, Math.round(quantity * unitPrice));
}

/**
 * 예산 집계. 시트가 맨 위에 총액 한 칸을 두고 손으로 더하던 것을 대신한다.
 * spent는 이미 산 것, planned는 앞으로 살 것 — 둘을 나눠야 남은 예산을 판단할 수 있다.
 */
export function programBudget(items: RetreatProgramItem[]) {
  let spent = 0;
  let planned = 0;
  for (const item of items) {
    if (!programItemStatusMeta(item.status).counts) continue;
    const total = programItemTotal(item);
    if (item.status === "purchased") spent += total;
    else planned += total;
  }
  return { spent, planned, total: spent + planned, count: items.length };
}

export function programActualSpend(items: RetreatProgramItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(0, Number(item.actualAmount ?? 0) || 0), 0);
}

export function programFulfillmentStatus(item: RetreatProgramItem): RetreatProgramFulfillmentStatus {
  if (item.fulfillmentStatus && PROGRAM_FULFILLMENT_STATUS_META[item.fulfillmentStatus]) return item.fulfillmentStatus;
  if (item.status === "ordered") return "ordered";
  if (item.status === "purchased") return "received";
  if (item.status === "inChurch") return "onsite";
  return "requested";
}

export function programFormatLabels(program: RetreatProgram): string[] {
  const labels = new Set(programPosts(program).map((post) => PROGRAM_ACTIVITY_TYPE_META[programActivityType(post)].label));
  return [...labels];
}

export function programReleases(program: RetreatProgram): RetreatProgramRelease[] {
  return Object.entries(program.releases ?? {}).map(([id, release]) => ({ ...release, id: release.id || id }))
    .sort((a, b) => b.releasedAt - a.releasedAt || b.id.localeCompare(a.id));
}

/** 현장은 활성 배포본을 읽고, 배포본 도입 전 published 데이터만 기존 방식으로 호환한다. */
export function publishedProgramForField(program: RetreatProgram): RetreatProgram | null {
  if (program.status !== "published") return null;
  if (!program.activeReleaseId) return program;
  const release = program.releases?.[program.activeReleaseId];
  if (!release?.snapshot) return null;
  return {
    id: program.id,
    status: "published",
    createdAt: program.createdAt,
    updatedAt: release.releasedAt,
    activeReleaseId: program.activeReleaseId,
    ...release.snapshot,
  };
}

function minutes(value?: string): number | null {
  if (!value || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

/** 같은 날짜·장소에 시간이 겹치는 프로그램을 찾는다. 미정 값은 충돌로 단정하지 않는다. */
export function programScheduleConflicts(programs: RetreatProgram[]): Array<{ firstId: string; secondId: string; place: string }> {
  const conflicts: Array<{ firstId: string; secondId: string; place: string }> = [];
  for (let left = 0; left < programs.length; left += 1) {
    const first = programs[left];
    const firstStart = minutes(first.startTime);
    const firstEnd = minutes(first.endTime);
    if (!first.date || !first.place?.trim() || firstStart === null || firstEnd === null) continue;
    for (let right = left + 1; right < programs.length; right += 1) {
      const second = programs[right];
      const secondStart = minutes(second.startTime);
      const secondEnd = minutes(second.endTime);
      if (second.date !== first.date || secondStart === null || secondEnd === null) continue;
      if (second.place?.trim().toLocaleLowerCase("ko-KR") !== first.place.trim().toLocaleLowerCase("ko-KR")) continue;
      if (firstStart < secondEnd && secondStart < firstEnd) {
        conflicts.push({ firstId: first.id, secondId: second.id, place: first.place.trim() });
      }
    }
  }
  return conflicts;
}

export type ProgramActivityPasteRow = Pick<RetreatProgramPost, "name" | "activityType" | "operationMode" | "place" | "startTime" | "endTime" | "staff">;

/**
 * 스프레드시트의 행을 활동 작업실에 붙여넣는다.
 * 열 순서: 활동명 / 종류 / 운영 방식 / 장소 / 시작 / 종료 / 담당. 첫 행이 제목이면 건너뛴다.
 */
export function parseProgramActivityPaste(value: string): ProgramActivityPasteRow[] {
  const activityLabels = new Map(Object.entries(PROGRAM_ACTIVITY_TYPE_META).flatMap(([key, meta]) => [[key, key], [meta.label, key]]));
  const operationLabels = new Map(Object.entries(PROGRAM_OPERATION_MODE_META).flatMap(([key, meta]) => [[key, key], [meta.label, key]]));
  const clock = (cell?: string) => cell && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cell) ? cell : undefined;
  return value.split(/\r?\n/).map((line) => line.split("\t").map((cell) => cell.trim())).filter((cells, index) => {
    if (!cells[0]) return false;
    return !(index === 0 && ["활동", "활동명", "이름"].includes(cells[0]));
  }).slice(0, 100).map(([name, activity, operation, place, startTime, endTime, staff]) => ({
    name: name.slice(0, 80),
    activityType: (activityLabels.get(activity) || "other") as RetreatProgramActivityType,
    operationMode: (operationLabels.get(operation) || "whole") as RetreatProgramOperationMode,
    place: place?.slice(0, 120) || undefined,
    startTime: clock(startTime),
    endTime: clock(endTime),
    staff: staff?.slice(0, 120) || undefined,
  }));
}

export const PROGRAM_WORKSPACE_SECTIONS = [
  { key: "overview", label: "전체 준비", description: "막힌 준비와 다음 행동" },
  { key: "programs", label: "프로그램 준비", description: "프로그램별 기획과 진행 순서" },
  { key: "schedule", label: "시간·장소", description: "시간, 장소와 담당 충돌" },
  { key: "supplies", label: "준비물·비용", description: "요청부터 현장 도착과 정산" },
  { key: "collaboration", label: "담당자·할 일", description: "결정과 실행 업무" },
  { key: "resources", label: "현장 공유", description: "브리핑과 현장 공유" },
] as const;

export type ProgramWorkspaceSectionKey = (typeof PROGRAM_WORKSPACE_SECTIONS)[number]["key"];

export function programWorkspaceSectionFromParam(value: string | null | undefined): ProgramWorkspaceSectionKey {
  return PROGRAM_WORKSPACE_SECTIONS.some((section) => section.key === value)
    ? value as ProgramWorkspaceSectionKey
    : "programs";
}

/** 편집기 상단 내비게이션 — 각 탭이 서로 다른 일을 맡는다. */
export const PROGRAM_SECTIONS = [
  { key: "overview", label: "1 기획 시작" },
  { key: "posts", label: "2 진행 순서" },
  { key: "roles", label: "3 준비물·담당" },
  { key: "tasks", label: "4 확인·현장 공유" },
] as const;

export type ProgramSectionKey = (typeof PROGRAM_SECTIONS)[number]["key"];

export function isProgramSection(value: string | null | undefined): value is ProgramSectionKey {
  return !!value && PROGRAM_SECTIONS.some((section) => section.key === value);
}

/** 예전 링크의 진행안·물품 탭도 새 4단계 작업 흐름으로 안전하게 연결한다. */
export function programSectionFromParam(value: string | null | undefined): ProgramSectionKey {
  if (value === "flow") return "posts";
  if (value === "items") return "roles";
  return isProgramSection(value) ? value : "overview";
}

/**
 * 대진표 — 라운드별로 묶어 돌려준다.
 * 시트는 라운드를 "열"로 두고 경기를 아래로 적었는데, 라운드가 늘 때마다 열을 밀어야 했다.
 * 여기서는 경기마다 round를 들고 있고 화면이 묶기만 하므로 라운드를 늘려도 구조가 흔들리지 않는다.
 */
export function postMatchRounds(post: RetreatProgramPost): Array<{ round: number; matches: RetreatProgramMatch[] }> {
  const all = Object.entries(post.matches ?? {})
    .map(([id, match]) => ({ ...match, id: match.id || id }))
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0) || (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
  const rounds: Array<{ round: number; matches: RetreatProgramMatch[] }> = [];
  for (const match of all) {
    const round = match.round ?? 1;
    const bucket = rounds.find((entry) => entry.round === round);
    if (bucket) bucket.matches.push(match);
    else rounds.push({ round, matches: [match] });
  }
  return rounds;
}

/** 다음 경기를 추가할 라운드 — 마지막 라운드에 이어 붙인다. */
export function nextMatchRound(post: RetreatProgramPost): number {
  const rounds = postMatchRounds(post);
  return rounds.length === 0 ? 1 : rounds[rounds.length - 1].round;
}

// ── 활동 ↔ 물품·역할 연결 ────────────────────────────────────
// 원본 시트는 게임 탭 하나에 규칙·준비물·스탭이 함께 있었다. 이를 묵상·영상 등 모든 활동으로
// 확장하되, 물품·역할은 postId로 같은 활동에 묶어 한 사실을 여러 번 입력하지 않는다.

export function itemsOfPost(program: RetreatProgram, postId: string): RetreatProgramItem[] {
  return programItems(program).filter((item) => item.postId === postId);
}

export function rolesOfPost(program: RetreatProgram, postId: string): RetreatProgramRole[] {
  return programRoles(program).filter((role) => role.postId === postId);
}

/** 어느 활동에도 묶이지 않은 항목 — 프로그램 공통. postId 도입 이전 데이터도 여기 모인다. */
export function commonItems(program: RetreatProgram): RetreatProgramItem[] {
  const postIds = new Set(programPosts(program).map((post) => post.id));
  return programItems(program).filter((item) => !item.postId || !postIds.has(item.postId));
}

export function commonRoles(program: RetreatProgram): RetreatProgramRole[] {
  const postIds = new Set(programPosts(program).map((post) => post.id));
  return programRoles(program).filter((role) => !role.postId || !postIds.has(role.postId));
}

export interface ProgramGroupedEntries<T> {
  postId: string | null;
  /** 화면에 보여줄 이름 — 활동 이름, 또는 공통 묶음 */
  label: string;
  entries: T[];
}

/** 활동 순서대로 묶고, 공통 묶음을 마지막에 둔다. 비어 있는 활동도 자리를 남겨 어디가 비었는지 보이게 한다. */
export function groupItemsByPost(program: RetreatProgram): Array<ProgramGroupedEntries<RetreatProgramItem>> {
  const groups = programPosts(program).map((post) => ({
    postId: post.id as string | null,
    label: post.name,
    entries: itemsOfPost(program, post.id),
  }));
  const common = commonItems(program);
  if (common.length > 0 || groups.length === 0) {
    groups.push({ postId: null, label: "프로그램 공통", entries: common });
  }
  return groups;
}

export function groupRolesByPost(program: RetreatProgram): Array<ProgramGroupedEntries<RetreatProgramRole>> {
  const groups = programPosts(program).map((post) => ({
    postId: post.id as string | null,
    label: post.name,
    entries: rolesOfPost(program, post.id),
  }));
  const common = commonRoles(program);
  if (common.length > 0 || groups.length === 0) {
    groups.push({ postId: null, label: "프로그램 전체", entries: common });
  }
  return groups;
}
