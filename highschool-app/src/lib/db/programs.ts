import { onValue, push, ref, remove, set, update } from "firebase/database";
import { db } from "../firebase";
import { paths } from "../paths";
import { createProgramDraft, sortRetreatPrograms } from "../programPreparation";
import type { RetreatProgram, RetreatProgramTask } from "../types";
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
