import { ref, get, set, update, push, remove, onValue } from "firebase/database";
import { db } from "../firebase";
import { Retreat } from "../types";
import { paths } from "../paths";
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

export async function deleteRetreat(id: string): Promise<void> {
  await remove(ref(db, paths.retreat(id)));
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
