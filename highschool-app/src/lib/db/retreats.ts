import { ref, get, push, onChildAdded, onChildRemoved, onValue } from "@/lib/rtdb";
import { auditedSet as set, auditedUpdate as update } from "@/features/activityLog/write";
import { db } from "../firebase";
import { Retreat } from "../types";
import { paths } from "../paths";
import { buildRetreatRemovalUpdates } from "../retreatRemoval";
import { stripUndefined, snapToList } from "./core";

// ── Retreats ──────────────────────────────────────────────

function toRetreatSummary(id: string, value: Partial<Retreat>): Retreat {
  return {
    id,
    name: String(value.name ?? ""),
    year: Number(value.year) || 0,
    sheetId: String(value.sheetId ?? ""),
    sheetGid: String(value.sheetGid ?? ""),
    createdAt: Number(value.createdAt) || 0,
    groupCount: Number(value.groupCount) || 0,
    ...(value.startDate ? { startDate: String(value.startDate) } : {}),
    ...(value.endDate ? { endDate: String(value.endDate) } : {}),
  };
}

export async function getRetreats(): Promise<Retreat[]> {
  const snap = await get(ref(db, paths.retreats()));
  return snapToList<Retreat>(snap);
}

export function subscribeToRetreats(callback: (retreats: Retreat[]) => void, onError?: (error: Error) => void): () => void {
  const records = new Map<string, Retreat>();
  const fieldUnsubs = new Map<string, Array<() => void>>();
  let emitTimer: ReturnType<typeof setTimeout> | null = null;
  const fields = ["name", "year", "sheetId", "sheetGid", "createdAt", "groupCount", "startDate", "endDate"] as const;
  const emit = () => {
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => callback([...records.values()]), 0);
  };
  const reportError = (error: Error) => {
    console.warn("subscribeToRetreats error:", error);
    onError?.(error);
  };
  const attachFields = (retreat: Retreat) => {
    if (fieldUnsubs.has(retreat.id)) return;
    records.set(retreat.id, retreat);
    fieldUnsubs.set(retreat.id, fields.map((field) => onValue(ref(db, paths.retreatMetaField(retreat.id, field)), (snap) => {
      const current = records.get(retreat.id);
      if (!current) return;
      records.set(retreat.id, { ...current, [field]: snap.val() });
      emit();
    }, reportError)));
  };
  const root = ref(db, paths.retreats());
  emit(); // 빈 목록도 최초 상태를 전달해 로딩이 끝나도록 한다.
  const unsubs = [
    onChildAdded(root, (snap) => {
      if (!snap.key || fieldUnsubs.has(snap.key)) return;
      attachFields(toRetreatSummary(snap.key, snap.val() as Partial<Retreat>));
      emit();
    }, reportError),
    onChildRemoved(root, (snap) => {
      if (!snap.key) return;
      fieldUnsubs.get(snap.key)?.forEach((unsubscribe) => unsubscribe());
      fieldUnsubs.delete(snap.key);
      records.delete(snap.key);
      emit();
    }, reportError),
  ];
  return () => {
    if (emitTimer) clearTimeout(emitTimer);
    unsubs.forEach((unsubscribe) => unsubscribe());
    fieldUnsubs.forEach((listeners) => listeners.forEach((unsubscribe) => unsubscribe()));
  };
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
  const fields = ["name", "year", "sheetId", "sheetGid", "createdAt", "groupCount", "startDate", "endDate"] as const;
  const values: Partial<Retreat> = { id };
  const ready = new Set<string>();
  let emitTimer: ReturnType<typeof setTimeout> | null = null;
  const emit = () => {
    if (ready.size !== fields.length) return;
    if (emitTimer) clearTimeout(emitTimer);
    emitTimer = setTimeout(() => callback(values.name ? toRetreatSummary(id, values) : null), 0);
  };
  const unsubs = fields.map((field) => onValue(ref(db, paths.retreatMetaField(id, field)), (snap) => {
    Object.assign(values, { [field]: snap.val() });
    ready.add(field);
    emit();
  }, (error) => { console.warn("subscribeToRetreat error:", error); onError?.(error); }));
  return () => {
    if (emitTimer) clearTimeout(emitTimer);
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
