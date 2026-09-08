import { get, onValue, push, ref } from "firebase/database";
import { auditedRemove as remove, auditedSet as set, auditedUpdate as update } from "@/features/activityLog/write";
import { db } from "../firebase";
import { paths } from "../paths";
import { createProgramDraft, programDecisionTaskId, sortRetreatPrograms } from "../programPreparation";
import type {
  RetreatProgram,
  RetreatProgramCompetitionTeam,
  RetreatProgramItem,
  RetreatProgramMeeting,
  RetreatProgramDecision,
  RetreatProgramMatch,
  RetreatProgramPost,
  RetreatProgramRole,
  RetreatProgramTask,
} from "../types";
import { snapToList, stripUndefined } from "./core";

export function subscribeToRetreatPrograms(
  retreatId: string,
  callback: (programs: RetreatProgram[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(
    ref(db, paths.programs(retreatId)),
    (snapshot) => callback(sortRetreatPrograms(snapToList<RetreatProgram>(snapshot))),
    (error) => {
      console.warn("subscribeToRetreatPrograms error:", error);
      onError?.(error);
    },
  );
}

/** 관리자 전용 준비회의 원문. 공개 프로그램 구독과 분리해 현장 역할에 노출하지 않는다. */
export function subscribeToRetreatProgramMeetings(
  retreatId: string,
  callback: (meetings: Record<string, Record<string, RetreatProgramMeeting>>) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(
    ref(db, paths.programMeetingsRoot(retreatId)),
    (snapshot) => callback((snapshot.val() ?? {}) as Record<string, Record<string, RetreatProgramMeeting>>),
    (error) => {
      console.warn("subscribeToRetreatProgramMeetings error:", error);
      onError?.(error);
    },
  );
}

export async function createRetreatProgram(
  retreatId: string,
  data: Omit<RetreatProgram, "id" | "meetings">,
): Promise<string> {
  const nextRef = push(ref(db, paths.programs(retreatId)));
  // private 회의 기록이 실수로 공개 프로그램 노드에 섞이지 않게 런타임에서도 걷어낸다.
  const publicData: Partial<RetreatProgram> = { ...(data as Omit<RetreatProgram, "id">) };
  delete publicData.meetings;
  await set(nextRef, stripUndefined(publicData));
  return nextRef.key!;
}

export async function createDefaultRetreatPrograms(retreatId: string): Promise<string[]> {
  const refs = [push(ref(db, paths.programs(retreatId))), push(ref(db, paths.programs(retreatId)))];
  const payload: Record<string, unknown> = {};
  refs.forEach((programRef, index) => {
    payload[paths.program(retreatId, programRef.key!)] = createProgramDraft(index + 1);
  });
  await update(ref(db), payload);
  return refs.map((programRef) => programRef.key!);
}

export async function updateRetreatProgram(
  retreatId: string,
  programId: string,
  data: Partial<Omit<RetreatProgram, "id" | "tasks" | "meetings" | "posts" | "items" | "roles" | "competitionTeams" | "createdAt">>,
): Promise<void> {
  await update(ref(db, paths.program(retreatId, programId)), stripUndefined({ ...data, updatedAt: Date.now() }));
}

export async function deleteRetreatProgram(retreatId: string, programId: string): Promise<void> {
  await update(ref(db), {
    [paths.program(retreatId, programId)]: null,
    [paths.programMeetings(retreatId, programId)]: null,
  });
}

export async function reorderRetreatPrograms(retreatId: string, orderedIds: string[]): Promise<void> {
  const now = Date.now();
  const payload: Record<string, unknown> = {};
  orderedIds.forEach((programId, index) => {
    payload[`${paths.program(retreatId, programId)}/order`] = index + 1;
    payload[`${paths.program(retreatId, programId)}/updatedAt`] = now;
  });
  await update(ref(db), payload);
}

export async function createRetreatProgramTask(
  retreatId: string,
  programId: string,
  data: Omit<RetreatProgramTask, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const taskRef = push(ref(db, paths.programTasks(retreatId, programId)));
  const now = Date.now();
  await set(taskRef, stripUndefined({ ...data, createdAt: now, updatedAt: now }));
  return taskRef.key!;
}

export async function updateRetreatProgramTask(
  retreatId: string,
  programId: string,
  taskId: string,
  data: Partial<Omit<RetreatProgramTask, "id" | "createdAt">>,
): Promise<void> {
  await update(ref(db, paths.programTask(retreatId, programId, taskId)), stripUndefined({ ...data, updatedAt: Date.now() }));
}

export async function deleteRetreatProgramTask(
  retreatId: string,
  programId: string,
  taskId: string,
  source?: { meetingId: string; decisionId: string },
): Promise<void> {
  if (!source) {
    await remove(ref(db, paths.programTask(retreatId, programId, taskId)));
    return;
  }
  await update(ref(db), {
    [paths.programTask(retreatId, programId, taskId)]: null,
    [`${paths.programDecision(retreatId, programId, source.meetingId, source.decisionId)}/taskId`]: null,
  });
}

export async function restoreRetreatProgramTask(
  retreatId: string,
  programId: string,
  task: RetreatProgramTask,
): Promise<void> {
  const { id, ...value } = task;
  const now = Date.now();
  const restored = stripUndefined({ ...value, updatedAt: now });
  const programPath = paths.program(retreatId, programId);
  const taskPath = paths.programTask(retreatId, programId, id);
  const [programSnapshot, taskSnapshot] = await Promise.all([
    get(ref(db, programPath)),
    get(ref(db, taskPath)),
  ]);
  if (!programSnapshot.exists() || taskSnapshot.exists()) {
    throw new Error("다른 변경이 먼저 반영되어 이 할 일은 되돌리지 않았습니다.");
  }
  const payload: Record<string, unknown> = { [taskPath]: restored };
  if (task.sourceMeetingId && task.sourceDecisionId) {
    const decisionPath = paths.programDecision(retreatId, programId, task.sourceMeetingId, task.sourceDecisionId);
    const decisionSnapshot = await get(ref(db, decisionPath));
    const currentDecision = decisionSnapshot.val() as RetreatProgramDecision | null;
    if (currentDecision?.taskId && currentDecision.taskId !== id) {
      throw new Error("회의 결정이 다른 할 일에 연결되어 되돌리지 않았습니다.");
    }
    if (currentDecision) {
      payload[`${decisionPath}/taskId`] = id;
      payload[`${decisionPath}/updatedAt`] = now;
    }
  }
  // 공개 작업과 private 결정 링크를 함께 적용해 한쪽만 복구되는 상태를 만들지 않는다.
  await update(ref(db), payload);
}

export async function createRetreatProgramMeeting(
  retreatId: string,
  programId: string,
  data: Omit<RetreatProgramMeeting, "id" | "createdAt" | "updatedAt" | "decisions">,
): Promise<string> {
  const meetingRef = push(ref(db, paths.programMeetings(retreatId, programId)));
  const now = Date.now();
  await set(meetingRef, stripUndefined({ ...data, createdAt: now, updatedAt: now }));
  return meetingRef.key!;
}

export async function updateRetreatProgramMeeting(
  retreatId: string,
  programId: string,
  meetingId: string,
  data: Partial<Omit<RetreatProgramMeeting, "id" | "createdAt" | "decisions">>,
): Promise<void> {
  await update(ref(db, paths.programMeeting(retreatId, programId, meetingId)), stripUndefined({ ...data, updatedAt: Date.now() }));
}

export async function createRetreatProgramDecision(
  retreatId: string,
  programId: string,
  meetingId: string,
  data: Omit<RetreatProgramDecision, "id" | "createdAt" | "updatedAt" | "taskId">,
): Promise<string> {
  const decisionRef = push(ref(db, paths.programDecisions(retreatId, programId, meetingId)));
  const now = Date.now();
  await set(decisionRef, stripUndefined({ ...data, createdAt: now, updatedAt: now }));
  return decisionRef.key!;
}

export async function updateRetreatProgramDecision(
  retreatId: string,
  programId: string,
  meetingId: string,
  decisionId: string,
  data: Partial<Omit<RetreatProgramDecision, "id" | "createdAt">>,
): Promise<void> {
  await update(ref(db, paths.programDecision(retreatId, programId, meetingId, decisionId)), stripUndefined({ ...data, updatedAt: Date.now() }));
}

/** 결정과 실행 작업을 한 번의 multi-location update로 연결한다. */
export async function convertRetreatProgramDecisionToTask(
  retreatId: string,
  programId: string,
  meetingId: string,
  decision: RetreatProgramDecision,
): Promise<string> {
  // 결정 하나의 작업 ID를 고정해 재시도·동시 클릭도 같은 노드에 수렴시킨다.
  const taskId = decision.taskId || programDecisionTaskId(meetingId, decision.id);
  const decisionPath = paths.programDecision(retreatId, programId, meetingId, decision.id);
  const [programSnapshot, decisionSnapshot] = await Promise.all([
    get(ref(db, paths.program(retreatId, programId))),
    get(ref(db, decisionPath)),
  ]);
  if (!programSnapshot.exists()) {
    throw new Error("프로그램이 삭제되어 할 일로 보낼 수 없습니다.");
  }
  if (!decisionSnapshot.exists()) {
    throw new Error("원본 결정이 삭제되어 할 일로 보낼 수 없습니다.");
  }
  const currentDecision = { ...decision, ...(decisionSnapshot.val() as RetreatProgramDecision) };
  const resolvedTaskId = currentDecision.taskId || taskId;
  const taskPath = paths.programTask(retreatId, programId, resolvedTaskId);
  const taskSnapshot = await get(ref(db, taskPath));
  const now = Date.now();
  const payload: Record<string, unknown> = {
    [`${decisionPath}/taskId`]: resolvedTaskId,
    [`${decisionPath}/updatedAt`]: now,
  };
  // 이미 존재하는 작업은 담당자가 수정했을 수 있으므로 링크만 복구하고 절대 덮지 않는다.
  if (!taskSnapshot.exists()) {
    payload[taskPath] = stripUndefined({
      title: currentDecision.title,
      assignee: currentDecision.assignee,
      dueDate: currentDecision.dueDate,
      postId: currentDecision.postId,
      sourceDecisionId: currentDecision.id,
      sourceMeetingId: meetingId,
      status: "todo",
      done: false,
      // 동시 클릭도 동일 payload로 수렴하도록 결정 시각을 작업의 초기 시각으로 쓴다.
      createdAt: currentDecision.createdAt,
      updatedAt: currentDecision.updatedAt,
    });
  }
  // 공개 작업 생성과 private 결정 링크를 한 번의 root update로 적용해 고아 상태를 막는다.
  await update(ref(db), payload);
  return resolvedTaskId;
}

// ── 하위 컬렉션 (포스트·물품·역할) ──────────────────────────────
// tasks와 같은 규약: push로 만든 키가 곧 id이고, 저장은 경로 단위 update만 쓴다.
// 프로그램 노드 전체를 set으로 덮으면 동시 편집이 서로를 지운다(루트 실수 2).

type SubCollection = "posts" | "items" | "roles" | "competitionTeams";

function subPath(retreatId: string, programId: string, kind: SubCollection, id?: string): string {
  const base = `${paths.program(retreatId, programId)}/${kind}`;
  return id ? `${base}/${id}` : base;
}

async function createSubEntry<T extends object>(
  retreatId: string,
  programId: string,
  kind: SubCollection,
  data: T,
): Promise<string> {
  const entryRef = push(ref(db, subPath(retreatId, programId, kind)));
  const now = Date.now();
  await set(entryRef, stripUndefined({ ...data, createdAt: now, updatedAt: now }));
  return entryRef.key!;
}

async function updateSubEntry<T extends object>(
  retreatId: string,
  programId: string,
  kind: SubCollection,
  id: string,
  data: T,
): Promise<void> {
  await update(ref(db, subPath(retreatId, programId, kind, id)), stripUndefined({ ...data, updatedAt: Date.now() }));
}

async function deleteSubEntry(retreatId: string, programId: string, kind: SubCollection, id: string): Promise<void> {
  await remove(ref(db, subPath(retreatId, programId, kind, id)));
}

async function restoreSubEntry<T extends { id: string }>(
  retreatId: string,
  programId: string,
  kind: SubCollection,
  entry: T,
): Promise<void> {
  const { id, ...value } = entry;
  await set(ref(db, subPath(retreatId, programId, kind, id)), stripUndefined({ ...value, updatedAt: Date.now() }));
}

export function createRetreatProgramPost(
  retreatId: string, programId: string,
  data: Omit<RetreatProgramPost, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  return createSubEntry(retreatId, programId, "posts", data);
}

export function updateRetreatProgramPost(
  retreatId: string, programId: string, postId: string,
  data: Partial<Omit<RetreatProgramPost, "id" | "createdAt">>,
): Promise<void> {
  return updateSubEntry(retreatId, programId, "posts", postId, data);
}

/** 진행 블록 순서를 전체 노드 덮어쓰기 없이 order 필드만 한 번에 바꾼다. */
export async function reorderRetreatProgramPosts(
  retreatId: string,
  programId: string,
  orderedIds: string[],
): Promise<void> {
  const now = Date.now();
  const payload: Record<string, unknown> = {
    [`${paths.program(retreatId, programId)}/updatedAt`]: now,
  };
  orderedIds.forEach((postId, index) => {
    payload[`${subPath(retreatId, programId, "posts", postId)}/order`] = index + 1;
    payload[`${subPath(retreatId, programId, "posts", postId)}/updatedAt`] = now;
  });
  await update(ref(db), payload);
}

export function deleteRetreatProgramPost(retreatId: string, programId: string, postId: string): Promise<void> {
  return deleteSubEntry(retreatId, programId, "posts", postId);
}

export function restoreRetreatProgramPost(retreatId: string, programId: string, post: RetreatProgramPost): Promise<void> {
  return restoreSubEntry(retreatId, programId, "posts", post);
}

export function createRetreatProgramItem(
  retreatId: string, programId: string,
  data: Omit<RetreatProgramItem, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  return createSubEntry(retreatId, programId, "items", data);
}

export function updateRetreatProgramItem(
  retreatId: string, programId: string, itemId: string,
  data: Partial<Omit<RetreatProgramItem, "id" | "createdAt">>,
): Promise<void> {
  return updateSubEntry(retreatId, programId, "items", itemId, data);
}

export function deleteRetreatProgramItem(retreatId: string, programId: string, itemId: string): Promise<void> {
  return deleteSubEntry(retreatId, programId, "items", itemId);
}

export function restoreRetreatProgramItem(retreatId: string, programId: string, item: RetreatProgramItem): Promise<void> {
  return restoreSubEntry(retreatId, programId, "items", item);
}

export function createRetreatProgramRole(
  retreatId: string, programId: string,
  data: Omit<RetreatProgramRole, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  return createSubEntry(retreatId, programId, "roles", data);
}

export function updateRetreatProgramRole(
  retreatId: string, programId: string, roleId: string,
  data: Partial<Omit<RetreatProgramRole, "id" | "createdAt">>,
): Promise<void> {
  return updateSubEntry(retreatId, programId, "roles", roleId, data);
}

export function deleteRetreatProgramRole(retreatId: string, programId: string, roleId: string): Promise<void> {
  return deleteSubEntry(retreatId, programId, "roles", roleId);
}

export function restoreRetreatProgramRole(retreatId: string, programId: string, role: RetreatProgramRole): Promise<void> {
  return restoreSubEntry(retreatId, programId, "roles", role);
}

// ── 프로그램 전용 연합팀 ──────────────────────────────────────
// 수련회 기본 groups는 읽기만 한다. 프로그램에서 조를 묶는 정보는 이 하위 노드에만 저장해
// 숙소·인원체크·기본 조 명단이 프로그램 구성 때문에 바뀌지 않게 한다.

export function createRetreatProgramCompetitionTeam(
  retreatId: string,
  programId: string,
  data: Omit<RetreatProgramCompetitionTeam, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  return createSubEntry(retreatId, programId, "competitionTeams", data);
}

export function updateRetreatProgramCompetitionTeam(
  retreatId: string,
  programId: string,
  teamId: string,
  data: Partial<Omit<RetreatProgramCompetitionTeam, "id" | "createdAt" | "groupIds">>,
): Promise<void> {
  return updateSubEntry(retreatId, programId, "competitionTeams", teamId, data);
}

export function deleteRetreatProgramCompetitionTeam(
  retreatId: string,
  programId: string,
  teamId: string,
): Promise<void> {
  return deleteSubEntry(retreatId, programId, "competitionTeams", teamId);
}

export function restoreRetreatProgramCompetitionTeam(
  retreatId: string,
  programId: string,
  team: RetreatProgramCompetitionTeam,
): Promise<void> {
  return restoreSubEntry(retreatId, programId, "competitionTeams", team);
}

export async function createDefaultRetreatProgramCompetitionTeams(
  retreatId: string,
  programId: string,
): Promise<void> {
  const colors: RetreatProgramCompetitionTeam["color"][] = ["blue", "red", "yellow", "green"];
  const names = ["파랑팀", "빨강팀", "노랑팀", "초록팀"];
  const now = Date.now();
  const payload: Record<string, unknown> = {};
  for (let index = 0; index < names.length; index += 1) {
    const teamRef = push(ref(db, paths.programCompetitionTeams(retreatId, programId)));
    payload[paths.programCompetitionTeam(retreatId, programId, teamRef.key!)] = {
      order: index + 1,
      name: names[index],
      color: colors[index],
      createdAt: now,
      updatedAt: now,
    };
  }
  await update(ref(db), payload);
}

/** 조 하나를 연합팀 하나로 옮긴다. 모든 팀에서 제거하고 선택 팀에 넣는 작업을 원자 적용한다. */
export async function assignRetreatGroupToProgramCompetitionTeam(
  retreatId: string,
  programId: string,
  teamIds: string[],
  groupId: string,
  selectedTeamId: string | null,
): Promise<void> {
  const now = Date.now();
  const payload: Record<string, unknown> = {};
  for (const teamId of teamIds) {
    payload[paths.programCompetitionTeamGroup(retreatId, programId, teamId, groupId)] =
      teamId === selectedTeamId ? true : null;
    payload[`${paths.programCompetitionTeam(retreatId, programId, teamId)}/updatedAt`] = now;
  }
  await update(ref(db), payload);
}

/** 현재 연합팀 전체에 기본 조를 인원수 기준으로 균등 분배한 결과를 한 번에 적용한다. */
export async function replaceRetreatProgramCompetitionAssignments(
  retreatId: string,
  programId: string,
  teamIds: string[],
  assignment: Record<string, string>,
): Promise<void> {
  const now = Date.now();
  const payload: Record<string, unknown> = {};
  for (const teamId of teamIds) {
    const groupIds = Object.fromEntries(Object.entries(assignment)
      .filter(([, assignedTeam]) => assignedTeam === teamId).map(([groupId]) => [groupId, true]));
    payload[`${paths.programCompetitionTeam(retreatId, programId, teamId)}/groupIds`] =
      Object.keys(groupIds).length ? groupIds : null;
    payload[`${paths.programCompetitionTeam(retreatId, programId, teamId)}/updatedAt`] = now;
  }
  await update(ref(db), payload);
}

// ── 대진표 (게임 카드 안) ───────────────────────────────────────
// posts/{postId}/matches 아래에 둔다. 게임 필드 수정과 경로가 겹치지 않으므로
// 대진을 고치는 동안 다른 사람이 규칙을 고쳐도 서로를 덮지 않는다.

export async function createRetreatProgramMatch(
  retreatId: string, programId: string, postId: string,
  data: Omit<RetreatProgramMatch, "id" | "createdAt" | "updatedAt">,
): Promise<string> {
  const matchRef = push(ref(db, `${paths.program(retreatId, programId)}/posts/${postId}/matches`));
  const now = Date.now();
  await set(matchRef, stripUndefined({ ...data, createdAt: now, updatedAt: now }));
  return matchRef.key!;
}

export async function updateRetreatProgramMatch(
  retreatId: string, programId: string, postId: string, matchId: string,
  data: Partial<Omit<RetreatProgramMatch, "id" | "createdAt">>,
): Promise<void> {
  await update(
    ref(db, paths.programPostMatch(retreatId, programId, postId, matchId)),
    stripUndefined({ ...data, updatedAt: Date.now() }),
  );
}

export async function deleteRetreatProgramMatch(
  retreatId: string, programId: string, postId: string, matchId: string,
): Promise<void> {
  await remove(ref(db, paths.programPostMatch(retreatId, programId, postId, matchId)));
}

export async function restoreRetreatProgramMatch(
  retreatId: string,
  programId: string,
  postId: string,
  match: RetreatProgramMatch,
): Promise<void> {
  const { id, ...value } = match;
  await set(
    ref(db, paths.programPostMatch(retreatId, programId, postId, id)),
    stripUndefined({ ...value, updatedAt: Date.now() }),
  );
}
