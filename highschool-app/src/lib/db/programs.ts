import { onValue, push, ref, remove, set, update } from "firebase/database";
import { db } from "../firebase";
import { paths } from "../paths";
import { createProgramDraft, sortRetreatPrograms } from "../programPreparation";
import type {
  RetreatProgram,
  RetreatProgramItem,
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

export async function createRetreatProgram(
  retreatId: string,
  data: Omit<RetreatProgram, "id">,
): Promise<string> {
  const nextRef = push(ref(db, paths.programs(retreatId)));
  await set(nextRef, stripUndefined(data));
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
  data: Partial<Omit<RetreatProgram, "id" | "tasks" | "createdAt">>,
): Promise<void> {
  await update(ref(db, paths.program(retreatId, programId)), stripUndefined({ ...data, updatedAt: Date.now() }));
}

export async function deleteRetreatProgram(retreatId: string, programId: string): Promise<void> {
  await remove(ref(db, paths.program(retreatId, programId)));
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
  const taskRef = push(ref(db, `${paths.program(retreatId, programId)}/tasks`));
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

export async function deleteRetreatProgramTask(retreatId: string, programId: string, taskId: string): Promise<void> {
  await remove(ref(db, paths.programTask(retreatId, programId, taskId)));
}

export async function restoreRetreatProgramTask(
  retreatId: string,
  programId: string,
  task: RetreatProgramTask,
): Promise<void> {
  const { id, ...value } = task;
  await set(ref(db, paths.programTask(retreatId, programId, id)), stripUndefined({ ...value, updatedAt: Date.now() }));
}

// ── 하위 컬렉션 (포스트·물품·역할) ──────────────────────────────
// tasks와 같은 규약: push로 만든 키가 곧 id이고, 저장은 경로 단위 update만 쓴다.
// 프로그램 노드 전체를 set으로 덮으면 동시 편집이 서로를 지운다(루트 실수 2).

type SubCollection = "posts" | "items" | "roles";

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
