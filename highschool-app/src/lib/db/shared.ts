import { ref, get, set, update, push, remove, onValue } from "firebase/database";
import { db } from "../firebase";
import { BrainstormNote, BrainstormComment, Milestone, RetreatPeriod } from "../types";
import { paths } from "../paths";
import { snapToList, stripUndefined } from "./core";

export const RETREAT_ADMIN_SOURCE_SITE = "retreat-admin";

export const retreatSharedSchedulePaths = {
  milestones: (retreatId: string) => `retreats/${retreatId}/milestones` as const,
  periods: (retreatId: string) => paths.periods(retreatId),
};

// ── Brainstorm (브레인스토밍 보드 — 전역 공유, 수련회 무관) ──

export function subscribeToBrainstormNotes(callback: (notes: BrainstormNote[]) => void, onError?: (error: Error) => void) {
  const r = ref(db, paths.brainstorm());
  return onValue(r, (snap) => callback(snapToList<BrainstormNote>(snap)),
    (error) => { console.warn("subscribeToBrainstormNotes error:", error); onError?.(error); });
}

export async function saveBrainstormNote(data: Omit<BrainstormNote, "id">): Promise<string> {
  const newRef = push(ref(db, paths.brainstorm()));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateBrainstormNote(noteId: string, data: Partial<Omit<BrainstormNote, "id">>): Promise<void> {
  await update(ref(db, paths.brainstormNote(noteId)), stripUndefined(data));
}

export async function deleteBrainstormNote(noteId: string): Promise<void> {
  await remove(ref(db, paths.brainstormNote(noteId)));
}

export async function addBrainstormComment(noteId: string, data: Omit<BrainstormComment, "id">): Promise<string> {
  const newRef = push(ref(db, paths.brainstormComments(noteId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function deleteBrainstormComment(noteId: string, commentId: string): Promise<void> {
  await remove(ref(db, paths.brainstormComment(noteId, commentId)));
}

// ── Milestones (준비 일정) ─────────────────────────────────
// 🌐 전역 공유 노드 `prepMilestones` — 특정 수련회에 묶이지 않는다.
//    행정·이가드 홈 캘린더 + 이가드 준비할일이 모두 이 한 노드를 공유(수련회 선택과 무관).

const GLOBAL_MILESTONES_PATH = paths.prepMilestones();

export async function saveMilestone(data: Omit<Milestone, "id">): Promise<string> {
  const now = Date.now();
  const newRef = push(ref(db, GLOBAL_MILESTONES_PATH));
  await set(newRef, stripUndefined({
    ...data,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
    sourceSite: data.sourceSite ?? RETREAT_ADMIN_SOURCE_SITE,
  }));
  return newRef.key!;
}

export async function updateMilestone(id: string, data: Partial<Omit<Milestone, "id">> & { note?: string | null }): Promise<void> {
  await update(ref(db, `${GLOBAL_MILESTONES_PATH}/${id}`), stripUndefined({
    ...data,
    updatedAt: data.updatedAt ?? Date.now(),
  }));
}

export async function deleteMilestone(id: string): Promise<void> {
  await remove(ref(db, `${GLOBAL_MILESTONES_PATH}/${id}`));
}

export function subscribeToMilestones(callback: (milestones: Milestone[]) => void, onError?: (error: Error) => void): () => void {
  const r = ref(db, GLOBAL_MILESTONES_PATH);
  return onValue(
    r,
    (snap) => callback(snapToList<Milestone>(snap)),
    (error) => {
      console.warn(`Failed to subscribe ${GLOBAL_MILESTONES_PATH}:`, error);
      callback([]);
      onError?.(error);
    }
  );
}

// ── RetreatPeriods ────────────────────────────────────────

export function subscribeToRetreatPeriods(retreatId: string, callback: (periods: RetreatPeriod[]) => void, onError?: (error: Error) => void): () => void {
  const r = ref(db, retreatSharedSchedulePaths.periods(retreatId));
  return onValue(r, (snap) => callback(snapToList<RetreatPeriod>(snap).sort((a, b) => a.startDate.localeCompare(b.startDate))),
    (error) => { console.warn("subscribeToRetreatPeriods error:", error); onError?.(error); });
}

export type RetreatPeriodWithOwner = RetreatPeriod & { retreatId: string };

/** 수련회별 대표 날짜(가장 이른 기간 시작일) 일회성 조회 — 수련회 목록을 "날짜순"으로 정렬할 때 사용 */
export async function getEarliestPeriodDateByRetreat(retreatIds: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(retreatIds.map(async id => {
    const snap = await get(ref(db, retreatSharedSchedulePaths.periods(id)));
    if (!snap.exists()) return;
    const list = snapToList<RetreatPeriod>(snap);
    if (list.length === 0) return;
    result[id] = list.reduce((min, p) => p.startDate < min ? p.startDate : min, list[0].startDate);
  }));
  return result;
}

/** 모든 수련회의 기간을 합쳐서 구독 — "준비 일정" 패널은 수련회 선택과 무관하게 항상 전체 표시 */
export function subscribeToAllRetreatPeriods(
  retreatIds: string[],
  callback: (periods: RetreatPeriodWithOwner[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (retreatIds.length === 0) { callback([]); return () => {}; }
  const byRetreat = new Map<string, RetreatPeriodWithOwner[]>();
  const emit = () => {
    const merged = retreatIds.flatMap(id => byRetreat.get(id) ?? []);
    callback(merged.sort((a, b) => a.startDate.localeCompare(b.startDate)));
  };
  const unsubs = retreatIds.map(id =>
    subscribeToRetreatPeriods(id, list => {
      byRetreat.set(id, list.map(p => ({ ...p, retreatId: id })));
      emit();
    }, onError)
  );
  return () => unsubs.forEach(u => u());
}

export async function saveRetreatPeriod(retreatId: string, data: Omit<RetreatPeriod, "id">): Promise<string> {
  const newRef = push(ref(db, retreatSharedSchedulePaths.periods(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateRetreatPeriod(retreatId: string, id: string, data: Partial<Omit<RetreatPeriod, "id">>): Promise<void> {
  await update(ref(db, `${retreatSharedSchedulePaths.periods(retreatId)}/${id}`), stripUndefined(data));
}

export async function deleteRetreatPeriod(retreatId: string, id: string): Promise<void> {
  await remove(ref(db, `${retreatSharedSchedulePaths.periods(retreatId)}/${id}`));
}
