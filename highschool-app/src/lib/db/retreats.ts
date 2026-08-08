import { ref, get, set, update, push, onValue } from "firebase/database";
import { db } from "../firebase";
import { Retreat } from "../types";
import { paths } from "../paths";
import { buildRetreatRemovalUpdates } from "../retreatRemoval";
import { stripUndefined, snapToList } from "./core";

// ── Retreats ──────────────────────────────────────────────

export async function getRetreats(): Promise<Retreat[]> {
  const snap = await get(ref(db, paths.retreats()));
  return snapToList<Retreat>(snap);
}

export async function createRetreat(data: Omit<Retreat, "id">): Promise<string> {
  const newRef = push(ref(db, paths.retreats()));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateRetreat(id: string, data: Partial<Retreat>): Promise<void> {
  await update(ref(db, paths.retreat(id)), stripUndefined(data));
}

/** 공개 노드와 민감정보 노드를 한 번의 루트 update로 함께 지운다(중간 실패로 고아가 남지 않게). */
export async function deleteRetreat(id: string): Promise<void> {
  await update(ref(db), buildRetreatRemovalUpdates(id));
}

export async function getRetreat(id: string): Promise<Retreat | null> {
  const snap = await get(ref(db, paths.retreat(id)));
  if (!snap.exists()) return null;
  return { id, ...snap.val() } as Retreat;
}

export function subscribeToRetreat(id: string, callback: (retreat: Retreat | null) => void, onError?: (error: Error) => void) {
  const r = ref(db, paths.retreat(id));
  return onValue(r, (snap) => callback(snap.exists() ? { id, ...snap.val() } : null),
    (error) => { console.warn("subscribeToRetreat error:", error); onError?.(error); });
}
