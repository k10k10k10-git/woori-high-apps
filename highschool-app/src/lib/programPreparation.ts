import type {
  RetreatProgram,
  RetreatProgramItem,
  RetreatProgramItemStatus,
  RetreatProgramKind,
  RetreatProgramMatch,
  RetreatProgramPost,
  RetreatProgramRole,
  RetreatProgramStatus,
} from "./types";

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
  other: "기타",
};

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

export function sortRetreatPrograms(programs: RetreatProgram[]): RetreatProgram[] {
  return [...programs].sort((a, b) => a.order - b.order || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

/**
 * 준비율이 보는 항목.
 *
 * 본문 필드만 세면 게임 11개와 물품 30줄을 다 채워도 0%에 머문다 — 실제로 한 일과
 * 화면의 진행 표시가 어긋나 "뭘 해도 진도가 안 나가는" 화면이 된다.
 * 그래서 게임·역할·물품도 함께 센다.
 */
const CHECKS: Array<{ key: string; ready: (program: RetreatProgram) => boolean }> = [
  { key: "일정·장소", ready: (program) => Boolean(program.date && program.startTime && program.place?.trim()) },
  { key: "담당", ready: (program) => Boolean(program.lead?.trim()) },
  { key: "목표", ready: (program) => Boolean(program.objective?.trim()) },
  { key: "진행안", ready: (program) => Boolean(program.flow?.trim()) },
  { key: "게임·포스트", ready: (program) => programPosts(program).length > 0 },
  { key: "역할", ready: (program) => programRoles(program).length > 0 },
  { key: "물품", ready: (program) => programItems(program).length > 0 },
  { key: "브리핑·대본", ready: (program) => Boolean(program.briefing?.trim() || program.script?.trim()) },
];

export function programReadiness(program: RetreatProgram) {
  const readyLabels = CHECKS.filter((check) => check.ready(program)).map((check) => check.key);
  const missingLabels = CHECKS.filter((check) => !check.ready(program)).map((check) => check.key);
  return {
    ready: readyLabels.length,
    total: CHECKS.length,
    percent: Math.round((readyLabels.length / CHECKS.length) * 100),
    readyLabels,
    missingLabels,
  };
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

export function programItems(program: RetreatProgram): RetreatProgramItem[] {
  return listOf(program.items);
}

export function programRoles(program: RetreatProgram): RetreatProgramRole[] {
  return listOf(program.roles);
}

export const PROGRAM_ITEM_STATUS_META: Record<RetreatProgramItemStatus, { label: string; counts: boolean }> = {
  todo: { label: "구매 예정", counts: true },
  ordered: { label: "주문함", counts: true },
  purchased: { label: "구매 완료", counts: true },
  // 교회 비품과 자체 제작은 지출이 아니므로 예산 합계에서 뺀다.
  inChurch: { label: "교회에 있음", counts: false },
  toMake: { label: "제작 예정", counts: false },
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

/** 편집기 상단 내비게이션 — 각 탭이 서로 다른 일을 맡는다. */
export const PROGRAM_SECTIONS = [
  { key: "overview", label: "개요" },
  { key: "flow", label: "진행안" },
  { key: "posts", label: "게임·포스트" },
  { key: "roles", label: "역할·배치" },
  { key: "items", label: "물품·예산" },
  { key: "tasks", label: "할 일·기록" },
] as const;

export type ProgramSectionKey = (typeof PROGRAM_SECTIONS)[number]["key"];

export function isProgramSection(value: string | null | undefined): value is ProgramSectionKey {
  return !!value && PROGRAM_SECTIONS.some((section) => section.key === value);
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

// ── 게임 ↔ 물품·역할 연결 ────────────────────────────────────
// 준비 시트는 게임 탭 하나에 규칙·준비물·스탭이 함께 있었다. 프로그램 단위로 흩어 놓으면
// 게임 하나를 준비하는 데 탭을 세 번 오가고 게임 이름을 세 번 다시 적게 된다.
// 그래서 물품·역할은 프로그램 아래 그대로 두되 postId로 게임에 묶고,
// 물품·예산·역할·배치 탭은 "입력하는 곳"이 아니라 게임별로 모아 보는 집계 화면이 된다.

export function itemsOfPost(program: RetreatProgram, postId: string): RetreatProgramItem[] {
  return programItems(program).filter((item) => item.postId === postId);
}

export function rolesOfPost(program: RetreatProgram, postId: string): RetreatProgramRole[] {
  return programRoles(program).filter((role) => role.postId === postId);
}

/** 어느 게임에도 묶이지 않은 항목 — 프로그램 공통. postId 도입 이전 데이터도 여기 모인다. */
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
  /** 화면에 보여줄 이름 — 게임 이름, 또는 공통 묶음 */
  label: string;
  entries: T[];
}

/** 게임 순서대로 묶고, 공통 묶음을 마지막에 둔다. 비어 있는 게임도 자리를 남겨 어디가 비었는지 보이게 한다. */
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
