import { ref, get, set, update, push, remove, onValue, runTransaction, DataSnapshot } from "firebase/database";
import { db } from "./firebase";
import { paths } from "./paths";
import { Retreat, Group, Room, Participant, Student, ClassData, IguardMeal,
  IguardScheduleBlock, IguardSegment, IguardPost, IguardMovement, IguardBus, IguardSeating,
  RetreatPeriod, Milestone, IguardAttendance, IguardAttendanceInfo, TeacherAttendance, PartialAttendanceMap,
  IguardAccessLock, IguardGbsPlace } from "./types";
import type { IguardLodgingHotspot, IguardLodgingMap } from "./types";
export { snapToList } from "./snapToList";
import { snapToList } from "./snapToList";
import { normalizePartialAttendanceMap } from "./partialAttendance";
import { DEFAULT_SEGMENT_LABEL, isDefaultSegment } from "./defaultSegment";
import { buildStructureClonePayload, occupiedCloneNodes, type CloneIdFactory, type IguardStructureSource } from "./structureClone";
import { parseOwnerSegments, venueForBlock } from "./cueSheet";
import {
  looksLikeLegacySheetMovement,
  reconcileSegmentSheetMovements,
  type SegmentSheetMovement,
} from "./movementReconcile";
import {
  isRetreatRole, isSemesterRole, ownSundayTeam,
  type MinistryRoles, type RetreatRole, type SemesterRole,
} from "@/features/portal/accessPolicy";
import { normalizeIguardPendingRequests, type IguardPendingReq } from "./pendingAccess";
import { isMinistryGuideMilestone } from "@/features/ministryGuide/ministryGuidePersistence";
import { isWorshipMilestone } from "@/features/sundayWorship/worshipSeating";
import {
  subscribeToRetreat as subscribeToAdminRetreat,
  subscribeToRetreats as subscribeToAdminRetreats,
} from "@/lib/db/retreats";

// ════════════════════════════════════════════════════════════
// 🔒 읽기 전용 영역 — 행정 앱(retreat-app)이 소유한 노드
//    절대 set/update/remove 정의 금지. 소비(read/subscribe)만 한다.
// ════════════════════════════════════════════════════════════

export async function getRetreats(): Promise<Retreat[]> {
  const snap = await get(ref(db, paths.retreats()));
  return snapToList<Retreat>(snap);
}

export function subscribeToRetreats(callback: (retreats: Retreat[]) => void, onError?: (error: Error) => void): () => void {
  return subscribeToAdminRetreats(callback, onError);
}

export async function getRetreat(id: string): Promise<Retreat | null> {
  const snap = await get(ref(db, paths.retreat(id)));
  if (!snap.exists()) return null;
  return { id, ...snap.val() } as Retreat;
}

export function subscribeToRetreat(id: string, cb: (retreat: Retreat | null) => void, onError?: (error: Error) => void): () => void {
  return subscribeToAdminRetreat(id, cb, onError);
}

export function subscribeToGroups(retreatId: string, callback: (groups: Group[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.groups(retreatId)), (snap) => callback(snapToList<Group>(snap)),
    (error) => { console.warn("subscribeToGroups error:", error); onError?.(error); });
}

export function subscribeToRooms(retreatId: string, callback: (rooms: Room[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.rooms(retreatId)), (snap) => callback(snapToList<Room>(snap)),
    (error) => { console.warn("subscribeToRooms error:", error); onError?.(error); });
}

export function subscribeToParticipants(retreatId: string, callback: (parts: Record<string, Participant>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.participants(retreatId)), (snap) => callback(snap.exists() ? snap.val() : {}),
    (error) => { console.warn("subscribeToParticipants error:", error); onError?.(error); });
}

export function subscribeToTeacherAttendances(retreatId: string, callback: (teachers: TeacherAttendance[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.teachers(retreatId)), (snap) => callback(snapToList<TeacherAttendance>(snap)),
    (error) => { console.warn("subscribeToTeacherAttendances error:", error); onError?.(error); });
}

/** classes/{year} 원시 데이터를 uniqueKey(`${buNum}_${studentId}`)로 정규화.
 *  retreat-app/getStudentsByYear 와 동일 규칙 (단일 원천). */
function normalizeClasses(classesData: Record<string, ClassData> | null): Record<string, Student> {
  if (!classesData) return {};
  const result: Record<string, Student> = {};
  Object.entries(classesData).forEach(([classKey, classData]) => {
    // classKey 형식: {부}-{학년}-{반} (예: "1-2-3" = 1부 2학년 3반)
    const parts = classKey.split("-");
    const buNum = parseInt(parts[0]);
    const grade = parseInt(parts[1]);
    const cls   = parseInt(parts[2]);
    if (classData.students) {
      Object.entries(classData.students).forEach(([studentId, student]) => {
        const normalizedStudent = student as Student;
        const sourceId = typeof normalizedStudent.id === "string" && normalizedStudent.id.trim()
          ? normalizedStudent.id.trim()
          : studentId;
        const uniqueKey = `${buNum}_${sourceId}`;
        result[uniqueKey] = { ...normalizedStudent, id: uniqueKey, buNum, grade, class: cls };
      });
    }
  });
  return result;
}

export async function getStudentsByYear(year: number): Promise<Record<string, Student>> {
  const snap = await get(ref(db, paths.classes(year)));
  return normalizeClasses(snap.exists() ? snap.val() : null);
}

export function subscribeToStudentsByYear(year: number, cb: (students: Record<string, Student>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.classes(year)), (snap) => cb(normalizeClasses(snap.exists() ? snap.val() : null)),
    (error) => { console.warn("subscribeToStudentsByYear error:", error); onError?.(error); });
}

// 부분참(선복귀/후발대/당일참석) — 행정 소유, 이가드는 읽기 전용 소비
// 노드: retreats/{id}/partialAttendances/{uniqueKey} = { type, day?, note?, updatedAt? }
export function subscribeToPartialAttendances(retreatId: string, cb: (map: PartialAttendanceMap) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.partialAttendances(retreatId)), (snap) => {
    cb(normalizePartialAttendanceMap(snap.exists() ? snap.val() : null));
  }, (error) => { console.warn("subscribeToPartialAttendances error:", error); onError?.(error); });
}

// 참가자 명단 셀 색상 — 행정 소유, 이가드는 읽기 전용 소비.
// red = 취소/불참 학생. 키는 uniqueKey("${buNum}_${studentId}") 또는 raw studentId.
export function subscribeToCellColors(retreatId: string, cb: (colors: Record<string, string>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.cellColors(retreatId)), (snap) => cb(snap.exists() ? snap.val() : {}),
    (error) => { console.warn("subscribeToCellColors error:", error); onError?.(error); });
}

// 수련회 기간(periods)은 수련회 고유 — 수련회별 노드 유지
export function subscribeToRetreatPeriods(retreatId: string, cb: (periods: RetreatPeriod[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.periods(retreatId)), (snap) =>
    cb(snapToList<RetreatPeriod>(snap).sort((a, b) => a.startDate.localeCompare(b.startDate))),
    (error) => { console.warn("subscribeToRetreatPeriods error:", error); onError?.(error); });
}

export type RetreatPeriodWithOwner = RetreatPeriod & { retreatId: string };

/** 수련회별 대표 날짜(가장 이른 기간 시작일) 일회성 조회 — 수련회 목록을 "날짜순"으로 정렬할 때 사용 */
export async function getEarliestPeriodDateByRetreat(retreatIds: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  await Promise.all(retreatIds.map(async id => {
    const snap = await get(ref(db, paths.periods(id)));
    if (!snap.exists()) return;
    const list = snapToList<RetreatPeriod>(snap);
    if (list.length === 0) return;
    result[id] = list.reduce((min, p) => p.startDate < min ? p.startDate : min, list[0].startDate);
  }));
  return result;
}

/** 모든 수련회의 기간을 합쳐서 구독(읽기 전용) — "준비 일정" 패널은 수련회 선택과 무관하게 항상 전체 표시 */
export function subscribeToAllRetreatPeriods(
  retreatIds: string[],
  cb: (periods: RetreatPeriodWithOwner[]) => void,
  onError?: (error: Error) => void
): () => void {
  if (retreatIds.length === 0) { cb([]); return () => {}; }
  const byRetreat = new Map<string, RetreatPeriodWithOwner[]>();
  const emit = () => {
    const merged = retreatIds.flatMap(id => byRetreat.get(id) ?? []);
    cb(merged.sort((a, b) => a.startDate.localeCompare(b.startDate)));
  };
  const unsubs = retreatIds.map(id =>
    subscribeToRetreatPeriods(id, list => {
      byRetreat.set(id, list.map(p => ({ ...p, retreatId: id })));
      emit();
    }, onError)
  );
  return () => unsubs.forEach(u => u());
}

// 🌐 준비 일정(milestones)은 전역 공유 노드 `prepMilestones` — 수련회와 무관.
//    행정·이가드 홈 캘린더 + 이가드 준비할일이 한 노드를 공유.
const GLOBAL_MILESTONES_PATH = paths.prepMilestones();

export function subscribeToMilestones(cb: (milestones: Milestone[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(
    ref(db, GLOBAL_MILESTONES_PATH),
    (snap) => cb(
      snapToList<Milestone>(snap)
        .filter((item) => !isMinistryGuideMilestone(item) && !isWorshipMilestone(item))
        .sort((a, b) => a.targetDate.localeCompare(b.targetDate)),
    ),
    (error) => {
      console.warn(`Failed to subscribe ${GLOBAL_MILESTONES_PATH}:`, error);
      cb([]);
      onError?.(error);
    }
  );
}
export async function saveMilestone(
  data: Omit<Milestone, "id" | "createdAt" | "updatedAt" | "sourceSite"> & Partial<Pick<Milestone, "createdAt" | "updatedAt" | "sourceSite">>
): Promise<string> {
  const now = Date.now();
  const r = push(ref(db, GLOBAL_MILESTONES_PATH));
  await set(r, stripUndefined({
    ...data,
    createdAt: data.createdAt ?? now,
    updatedAt: data.updatedAt ?? now,
    sourceSite: data.sourceSite ?? "move-guide",
  }));
  return r.key!;
}
export async function updateMilestone(
  id: string,
  data: Partial<Omit<Milestone, "id" | "note" | "updatedAt">> & { note?: string | null; updatedAt?: number }
): Promise<void> {
  await update(ref(db, paths.prepMilestone(id)), stripUndefined({
    ...data,
    updatedAt: data.updatedAt ?? Date.now(),
  }));
}
export async function deleteMilestone(id: string): Promise<void> {
  await remove(ref(db, paths.prepMilestone(id)));
}

// ════════════════════════════════════════════════════════════
// ✏️ 쓰기 가능 영역 — 이가드 앱 소유 (retreats/{id}/iguard/*)
// ════════════════════════════════════════════════════════════

// ── 식사 세션 (MVP-A) ──────────────────────────────────────

export function subscribeToIguardMeals(retreatId: string, callback: (meals: IguardMeal[]) => void, onError?: (error: Error) => void): () => void {
  const r = ref(db, paths.iguardMeals(retreatId));
  return onValue(r, (snap) => callback(
    snapToList<IguardMeal>(snap).sort((a, b) => a.day - b.day || a.slot - b.slot)
  ), (error) => { console.warn("subscribeToIguardMeals error:", error); onError?.(error); });
}

export async function saveIguardMeal(retreatId: string, data: Omit<IguardMeal, "id">): Promise<string> {
  const newRef = push(ref(db, paths.iguardMeals(retreatId)));
  await set(newRef, data);
  return newRef.key!;
}

export async function updateIguardMeal(retreatId: string, id: string, data: Partial<Omit<IguardMeal, "id">>): Promise<void> {
  await update(ref(db, paths.iguardMeal(retreatId, id)), data);
}

export async function deleteIguardMeal(retreatId: string, id: string): Promise<void> {
  await remove(ref(db, paths.iguardMeal(retreatId, id)));
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

// ── 이가드 스탭 ─────────────────────────────────────────────
// 스탭의 단일 원천은 행정 teachers(bu=스탭). 이가드는 스탭을 생성/수정/삭제하지 않는다.
// (레거시 iguard/staff 쓰기 함수는 제거됨 — migrateMovementStaffIds 만 옛 데이터 복구용으로 직접 읽음.)

// ── 타임테이블 (iguard/schedule) ───────────────────────────
export function subscribeToIguardSchedule(retreatId: string, cb: (list: IguardScheduleBlock[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardSchedule(retreatId)), (snap) =>
    cb(snapToList<IguardScheduleBlock>(snap).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))),
    (error) => { console.warn("subscribeToIguardSchedule error:", error); onError?.(error); });
}
export async function saveIguardScheduleBlock(retreatId: string, data: Omit<IguardScheduleBlock, "id">): Promise<string> {
  const blockRef = push(ref(db, paths.iguardSchedule(retreatId)));
  const segmentRef = push(ref(db, paths.iguardSegments(retreatId)));
  const blockId = blockRef.key!;
  const segmentId = segmentRef.key!;
  await update(ref(db), {
    [paths.iguardScheduleBlock(retreatId, blockId)]: stripUndefined(data),
    [paths.iguardSegment(retreatId, segmentId)]: {
      blockId,
      order: 0,
      label: DEFAULT_SEGMENT_LABEL,
      source: "manual",
    },
  });
  return blockId;
}
export async function updateIguardScheduleBlock(
  retreatId: string,
  id: string,
  data: Omit<Partial<Omit<IguardScheduleBlock, "id">>, "end" | "meal"> & {
    end?: string | null;
    meal?: boolean | null;
  },
): Promise<void> {
  await update(ref(db, paths.iguardScheduleBlock(retreatId, id)), stripUndefined(data));
}

function ownerSyncKey(value?: string | null): string {
  return (value || "")
    .trim()
    .toLocaleLowerCase("ko-KR")
    .replace(/sf$/i, "")
    .replace(/[\s\[\](){}._-]/g, "");
}

/**
 * 시트형 `장소: 담당자` 입력을 포스트·구간·동선으로 동기화한다.
 *
 * source=sheet 레코드만 교체하며 사이트에서 만든 수동 포스트·구간·동선은 보존한다.
 * 행정 소유 경로는 읽거나 쓰지 않고 retreats/{id}/iguard 하위만 multi-path update한다.
 */
export async function syncIguardScheduleOwner(
  retreatId: string,
  block: IguardScheduleBlock,
  schedule: IguardScheduleBlock[],
  staff: Array<{ id: string; name: string }>,
  posts: IguardPost[],
  segments: IguardSegment[],
  movements: IguardMovement[],
): Promise<{ posts: number; movements: number; unmatched: string[] }> {
  const parsed = parseOwnerSegments(block);
  const drafts = parsed.movements;
  const updates: Record<string, unknown | null> = {};
  const area = venueForBlock(block, schedule);
  const workingPosts = [...posts];
  let createdPosts = 0;

  const postFor = (name: string): IguardPost => {
    const key = ownerSyncKey(name);
    const existing = workingPosts.find(post =>
      ownerSyncKey(post.name) === key && (!post.area || post.area === area),
    ) || workingPosts.find(post => ownerSyncKey(post.name) === key);
    if (existing) return existing;
    const postRef = push(ref(db, paths.iguardPosts(retreatId)));
    const post: IguardPost = { id: postRef.key!, name: name.trim(), area, source: "sheet" };
    workingPosts.push(post);
    updates[paths.iguardPost(retreatId, post.id)] = stripUndefined({
      name: post.name,
      area: post.area,
      source: post.source,
    });
    createdPosts++;
    return post;
  };

  drafts.forEach(draft => postFor(draft.postName));

  const blockSegments = segments.filter(segment => segment.blockId === block.id);
  let defaultSegment = blockSegments.find(segment => isDefaultSegment(segment));
  if (!defaultSegment) {
    const segmentRef = push(ref(db, paths.iguardSegments(retreatId)));
    defaultSegment = {
      id: segmentRef.key!,
      blockId: block.id,
      order: 0,
      label: DEFAULT_SEGMENT_LABEL,
      source: "manual",
    };
    updates[paths.iguardSegment(retreatId, defaultSegment.id)] = stripUndefined({
      blockId: block.id,
      order: 0,
      label: DEFAULT_SEGMENT_LABEL,
      source: "manual",
    });
  }

  const segmentIdByOrder = new Map<number, string>([[0, defaultSegment.id]]);
  parsed.segments.forEach(draft => {
    const existing = blockSegments.find(segment =>
      segment.order === draft.order && (segment.source === "sheet"
        || (segment.label === draft.label && (segment.zone || undefined) === draft.zone)),
    );
    if (existing) {
      segmentIdByOrder.set(draft.order, existing.id);
      if (existing.source === "sheet"
        && (existing.label !== draft.label || (existing.zone || undefined) !== draft.zone)) {
        updates[paths.iguardSegment(retreatId, existing.id)] = stripUndefined({
          label: draft.label,
          zone: draft.zone ?? null,
        });
      }
      return;
    }
    const segmentRef = push(ref(db, paths.iguardSegments(retreatId)));
    segmentIdByOrder.set(draft.order, segmentRef.key!);
    updates[paths.iguardSegment(retreatId, segmentRef.key!)] = stripUndefined({
      blockId: block.id,
      order: draft.order,
      label: draft.label,
      zone: draft.zone,
      source: "sheet",
    });
  });

  const staffByName = new Map(staff.map(member => [ownerSyncKey(member.name), member.id]));
  const unmatched = new Set<string>();
  const actorSlots = new Map<string, number>();
  const nextMovements: SegmentSheetMovement[] = [];
  drafts.forEach(draft => {
    const segmentId = segmentIdByOrder.get(draft.segmentOrder);
    if (!segmentId) return;
    const post = postFor(draft.postName);
    const staffId = draft.staffName ? staffByName.get(ownerSyncKey(draft.staffName)) : undefined;
    if (draft.staffName && !staffId) {
      unmatched.add(draft.staffName);
      return;
    }
    let slot = draft.slot;
    if (draft.actor) {
      const key = `${segmentId}__${post.id}__${ownerSyncKey(draft.actor)}`;
      slot = (actorSlots.get(key) || 0) + 1;
      actorSlots.set(key, slot);
    }
    nextMovements.push({
      segmentId,
      blockId: block.id,
      postId: post.id,
      staffId,
      actor: draft.actor,
      slot,
      round: draft.round,
      detail: draft.detail,
      note: draft.note,
    });
  });

  const existingBlockMovements = movements
    .filter(movement => movement.blockId === block.id)
    .map(movement => {
      if (movement.source != null) return movement;
      const assigneeName = movement.staffId
        ? staff.find(member => member.id === movement.staffId)?.name
        : movement.actor || undefined;
      const postName = workingPosts.find(post => post.id === movement.postId)?.name;
      return looksLikeLegacySheetMovement(movement, assigneeName, postName)
        ? { ...movement, source: "sheet" as const }
        : movement;
    });
  const plan = reconcileSegmentSheetMovements(existingBlockMovements, nextMovements);
  plan.removes.forEach(movement => {
    updates[paths.iguardMovement(retreatId, movement.id)] = null;
  });
  plan.upserts.forEach(movement => {
    updates[paths.iguardMovement(retreatId, iguardMovementKey(movement))] = stripUndefined(movement);
  });
  if (Object.keys(updates).length > 0) await update(ref(db), updates);
  return { posts: createdPosts, movements: plan.upserts.length, unmatched: [...unmatched] };
}

export function subscribeToIguardLodgingMaps(
  retreatId: string,
  cb: (maps: IguardLodgingMap[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(ref(db, paths.iguardLodgingMaps(retreatId)), snap =>
    cb(snapToList<IguardLodgingMap>(snap).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))),
  error => {
    console.warn("subscribeToIguardLodgingMaps error:", error);
    onError?.(error);
  });
}

export function createIguardLodgingMapId(retreatId: string): string {
  return push(ref(db, paths.iguardLodgingMaps(retreatId))).key!;
}

export async function saveIguardLodgingMap(
  retreatId: string,
  mapId: string,
  data: Omit<IguardLodgingMap, "id">,
): Promise<void> {
  await update(ref(db, paths.iguardLodgingMap(retreatId, mapId)), stripUndefined(data));
}

export async function saveIguardLodgingHotspot(
  retreatId: string,
  mapId: string,
  hotspot: IguardLodgingHotspot,
): Promise<void> {
  await set(ref(db, paths.iguardLodgingHotspot(retreatId, mapId, hotspot.roomId)), hotspot);
}

export async function deleteIguardLodgingHotspot(
  retreatId: string,
  mapId: string,
  roomId: string,
): Promise<void> {
  await remove(ref(db, paths.iguardLodgingHotspot(retreatId, mapId, roomId)));
}

export async function deleteIguardLodgingMap(retreatId: string, mapId: string): Promise<void> {
  await remove(ref(db, paths.iguardLodgingMap(retreatId, mapId)));
}
export async function markIguardScheduleProgress(retreatId: string, id: string, actualStart: string): Promise<void> {
  await update(ref(db, paths.iguardScheduleBlock(retreatId, id)), {
    actualStart,
    actualStartAt: Date.now(),
  });
}
export async function deleteIguardScheduleBlock(retreatId: string, id: string): Promise<void> {
  const [segmentsSnap, movementsSnap] = await Promise.all([
    get(ref(db, paths.iguardSegments(retreatId))),
    get(ref(db, paths.iguardMovements(retreatId))),
  ]);
  const updates: Record<string, null> = { [paths.iguardScheduleBlock(retreatId, id)]: null };
  if (segmentsSnap.exists()) {
    Object.entries(segmentsSnap.val() as Record<string, IguardSegment>).forEach(([key, segment]) => {
      if (segment?.blockId === id) updates[paths.iguardSegment(retreatId, key)] = null;
    });
  }
  if (movementsSnap.exists()) {
    Object.entries(movementsSnap.val() as Record<string, IguardMovement>).forEach(([key, movement]) => {
      if (movement?.blockId === id) updates[paths.iguardMovement(retreatId, key)] = null;
    });
  }
  await update(ref(db), updates);
}

// ── 시간 블록 구간 (iguard/segments) ───────────────────────
export function subscribeToIguardSegments(
  retreatId: string,
  cb: (list: IguardSegment[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(ref(db, paths.iguardSegments(retreatId)), (snap) =>
    cb(snapToList<IguardSegment>(snap).sort((a, b) =>
      a.blockId.localeCompare(b.blockId) || a.order - b.order || a.label.localeCompare(b.label, "ko")
    )),
    (error) => { console.warn("subscribeToIguardSegments error:", error); onError?.(error); });
}
export async function saveIguardSegment(retreatId: string, data: Omit<IguardSegment, "id">): Promise<string> {
  const r = push(ref(db, paths.iguardSegments(retreatId)));
  await update(r, stripUndefined(data));
  return r.key!;
}
export async function updateIguardSegment(
  retreatId: string,
  id: string,
  data: Partial<Omit<IguardSegment, "id">>,
): Promise<void> {
  await update(ref(db, paths.iguardSegment(retreatId, id)), stripUndefined(data));
}
export async function deleteIguardSegment(retreatId: string, id: string): Promise<void> {
  const movementsSnap = await get(ref(db, paths.iguardMovements(retreatId)));
  const updates: Record<string, null> = { [paths.iguardSegment(retreatId, id)]: null };
  if (movementsSnap.exists()) {
    Object.entries(movementsSnap.val() as Record<string, IguardMovement>).forEach(([key, movement]) => {
      if (movement?.segmentId === id) updates[paths.iguardMovement(retreatId, key)] = null;
    });
  }
  await update(ref(db), updates);
}

// ── 포스트 (iguard/posts) ──────────────────────────────────
export function subscribeToIguardPosts(retreatId: string, cb: (list: IguardPost[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardPosts(retreatId)), (snap) =>
    cb(snapToList<IguardPost>(snap)
      .filter(post => !!post.name)
      .sort((a, b) => (a.area || "").localeCompare(b.area || "", "ko") || (a.name || "").localeCompare(b.name || "", "ko"))),
    (error) => { console.warn("subscribeToIguardPosts error:", error); onError?.(error); });
}
export async function saveIguardPost(retreatId: string, data: Omit<IguardPost, "id">): Promise<string> {
  const r = push(ref(db, paths.iguardPosts(retreatId)));
  await update(r, stripUndefined(data)); return r.key!;
}
export async function updateIguardPost(retreatId: string, id: string, data: Partial<Omit<IguardPost, "id">>): Promise<void> {
  await update(ref(db, paths.iguardPost(retreatId, id)), stripUndefined(data));
}
export async function deleteIguardPost(retreatId: string, id: string): Promise<void> {
  const movementsSnap = await get(ref(db, paths.iguardMovements(retreatId)));
  const updates: Record<string, null> = { [paths.iguardPost(retreatId, id)]: null };
  if (movementsSnap.exists()) {
    Object.entries(movementsSnap.val() as Record<string, IguardMovement>).forEach(([key, movement]) => {
      if (movement?.postId === id) updates[paths.iguardMovement(retreatId, key)] = null;
    });
  }
  await update(ref(db), updates);
}

// ── 동선 매트릭스 (iguard/movements) — 복합키 segmentId__postId__담당 ──
export function subscribeToIguardMovements(retreatId: string, cb: (list: IguardMovement[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardMovements(retreatId)), (snap) =>
    cb(snapToList<IguardMovement>(snap)),
    (error) => { console.warn("subscribeToIguardMovements error:", error); onError?.(error); });
}
export function iguardMovementKey(data: Pick<IguardMovement, "segmentId" | "postId" | "staffId" | "slot" | "actor">): string {
  if (!data.segmentId) throw new Error("동선 저장에는 segmentId가 필요합니다.");
  const assignee = data.staffId?.trim()
    ? data.staffId.trim()
    : data.actor
      ? `actor${data.slot || 1}`
      : `tbd${data.slot || 1}`;
  return `${data.segmentId}__${data.postId}__${assignee}`;
}

/** 구간 단위 동선을 자연키로 저장한다. 동일 자연키만 갱신하며 다른 수동 배정은 건드리지 않는다. */
export async function setIguardSegmentMovement(
  retreatId: string,
  data: Omit<IguardMovement, "id">,
): Promise<string> {
  const key = iguardMovementKey(data);
  await update(ref(db, paths.iguardMovement(retreatId, key)), stripUndefined(data));
  return key;
}

export async function deleteIguardMovementById(retreatId: string, id: string): Promise<void> {
  await remove(ref(db, paths.iguardMovement(retreatId, id)));
}

export async function updateIguardMovementById(
  retreatId: string,
  id: string,
  data: Partial<Omit<IguardMovement, "id">>,
): Promise<void> {
  await update(ref(db, paths.iguardMovement(retreatId, id)), stripUndefined(data));
}

/** 담당자·포스트 변경으로 자연키가 바뀔 때 이전 키 삭제와 새 키 생성을 원자적으로 처리한다. */
export async function replaceIguardSegmentMovement(
  retreatId: string,
  oldId: string,
  data: Omit<IguardMovement, "id">,
): Promise<string> {
  const nextId = iguardMovementKey(data);
  if (nextId === oldId) {
    await updateIguardMovementById(retreatId, oldId, data);
    return nextId;
  }
  await update(ref(db), {
    [paths.iguardMovement(retreatId, oldId)]: null,
    [paths.iguardMovement(retreatId, nextId)]: stripUndefined(data),
  });
  return nextId;
}

/** 포스트 이름·장소 일괄 변경. 변경된 필드 경로만 한 번의 update로 보낸다. */
export async function updateIguardPostFields(
  retreatId: string,
  changes: Record<string, Partial<Pick<IguardPost, "name" | "area">>>,
): Promise<void> {
  const updates: Record<string, string | null> = {};
  Object.entries(changes).forEach(([postId, fields]) => {
    if (fields.name !== undefined) updates[`${postId}/name`] = fields.name.trim();
    if (fields.area !== undefined) updates[`${postId}/area`] = fields.area.trim() || null;
  });
  if (Object.keys(updates).length > 0) await update(ref(db, paths.iguardPosts(retreatId)), updates);
}

/** 다른 수련회의 큐싯 구조만 빈 대상에 복제한다. 사람·메모·배정·체크 상태는 복제하지 않는다. */
export async function cloneIguardStructure(sourceRetreatId: string, targetRetreatId: string): Promise<number> {
  if (!sourceRetreatId || sourceRetreatId === targetRetreatId) throw new Error("다른 원본 수련회를 선택해주세요.");
  const [sourceSnap, targetSnap] = await Promise.all([
    get(ref(db, paths.iguard(sourceRetreatId))),
    get(ref(db, paths.iguard(targetRetreatId))),
  ]);
  if (!sourceSnap.exists()) throw new Error("원본 수련회에 복제할 이가드 구조가 없습니다.");
  const occupied = occupiedCloneNodes(targetSnap.exists() ? targetSnap.val() : null);
  if (occupied.length > 0) {
    throw new Error(`대상에 이미 데이터가 있어 중단했습니다: ${occupied.join(", ")}`);
  }
  const targetRefFor = (node: Parameters<CloneIdFactory>[0]) => {
    switch (node) {
      case "schedule": return paths.iguardSchedule(targetRetreatId);
      case "segments": return paths.iguardSegments(targetRetreatId);
      case "posts": return paths.iguardPosts(targetRetreatId);
      case "movements": return paths.iguardMovements(targetRetreatId);
      case "seating": return paths.iguardSeating(targetRetreatId);
      case "meals": return paths.iguardMeals(targetRetreatId);
    }
  };
  const makeId: CloneIdFactory = node => push(ref(db, targetRefFor(node))).key!;
  const relativePayload = buildStructureClonePayload(sourceSnap.val() as IguardStructureSource, makeId);
  const updates: Record<string, unknown> = {};
  Object.entries(relativePayload).forEach(([relativePath, value]) => {
    updates[`${paths.iguard(targetRetreatId)}/${relativePath}`] = value;
  });
  if (Object.keys(updates).length === 0) throw new Error("원본에 복제 가능한 구조가 없습니다.");
  await update(ref(db), updates);
  return Object.keys(updates).length;
}

async function defaultSegmentForBlock(
  retreatId: string,
  blockId: string,
): Promise<{ id: string; created: boolean }> {
  const segmentsSnap = await get(ref(db, paths.iguardSegments(retreatId)));
  if (segmentsSnap.exists()) {
    const entry = Object.entries(segmentsSnap.val() as Record<string, Omit<IguardSegment, "id">>)
      .find(([, segment]) => segment.blockId === blockId && isDefaultSegment({ id: "", ...segment }));
    if (entry) return { id: entry[0], created: false };
  }
  const segmentRef = push(ref(db, paths.iguardSegments(retreatId)));
  return { id: segmentRef.key!, created: true };
}

export async function ensureIguardDefaultSegment(retreatId: string, blockId: string): Promise<string> {
  const result = await defaultSegmentForBlock(retreatId, blockId);
  if (result.created) {
    await set(ref(db, paths.iguardSegment(retreatId, result.id)), {
      blockId,
      order: 0,
      label: DEFAULT_SEGMENT_LABEL,
      source: "manual",
    });
  }
  return result.id;
}

/**
 * 구버전 블록 편집 UI용 어댑터.
 * 기본 구간의 한 스탭 배정만 교체하고, 다른 명시 구간의 배정은 보존한다.
 */
export async function setIguardMovement(
  retreatId: string, staffId: string, blockId: string,
  data: { postId: string; round?: "선밥" | "후밥"; note?: string; source?: "sheet" | "manual" } | null
): Promise<void> {
  const [defaultSegment, movementsSnap] = await Promise.all([
    defaultSegmentForBlock(retreatId, blockId),
    get(ref(db, paths.iguardMovements(retreatId))),
  ]);
  const updates: Record<string, unknown | null> = {};
  if (defaultSegment.created) {
    updates[paths.iguardSegment(retreatId, defaultSegment.id)] = {
      blockId,
      order: 0,
      label: DEFAULT_SEGMENT_LABEL,
      source: "manual",
    };
  }
  if (movementsSnap.exists()) {
    Object.entries(movementsSnap.val() as Record<string, IguardMovement>).forEach(([id, movement]) => {
      if (movement.blockId === blockId
        && movement.segmentId === defaultSegment.id
        && movement.staffId === staffId) {
        updates[paths.iguardMovement(retreatId, id)] = null;
      }
      // P2 이전 키가 편집 시 남아 있다면 같은 셀의 레거시 레코드도 함께 정리한다.
      if (!movement.segmentId && movement.blockId === blockId && movement.staffId === staffId) {
        updates[paths.iguardMovement(retreatId, id)] = null;
      }
    });
  }
  if (data !== null) {
    const movement: Omit<IguardMovement, "id"> = {
      segmentId: defaultSegment.id,
      staffId,
      blockId,
      ...data,
    };
    updates[paths.iguardMovement(retreatId, iguardMovementKey(movement))] = stripUndefined(movement);
  }
  if (Object.keys(updates).length) await update(ref(db), updates);
}

// ── 버스(호차) 배정 (iguard/buses) ─────────────────────────
export function subscribeToIguardBuses(retreatId: string, cb: (list: IguardBus[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardBuses(retreatId)), (snap) =>
    cb(snapToList<IguardBus>(snap).sort((a, b) => (a.day ?? 1) - (b.day ?? 1) || a.busNo - b.busNo)),
    (error) => { console.warn("subscribeToIguardBuses error:", error); onError?.(error); });
}
export async function saveIguardBus(retreatId: string, data: Omit<IguardBus, "id">): Promise<string> {
  const r = push(ref(db, paths.iguardBuses(retreatId)));
  await set(r, stripUndefined(data)); return r.key!;
}
export async function updateIguardBus(
  retreatId: string,
  id: string,
  data: Partial<Omit<IguardBus, "id" | "staff" | "note" | "assignmentMode" | "segments">> & {
    staff?: string | null;
    note?: string | null;
    assignmentMode?: IguardBus["assignmentMode"] | null;
    segments?: IguardBus["segments"] | null;
  },
): Promise<void> {
  // null = 필드 삭제(빈 값으로 지울 때 null 사용)
  await update(ref(db, paths.iguardBus(retreatId, id)), stripUndefined(data));
}
export async function deleteIguardBus(retreatId: string, id: string): Promise<void> {
  await remove(ref(db, paths.iguardBus(retreatId, id)));
}

// ── 인원체크 저장 상태 (iguard/attendance) ──────────────────
function attendancePathKey(key: string): string {
  return encodeURIComponent(key);
}
export function subscribeToIguardAttendance(
  retreatId: string,
  cb: (checkedKeys: Set<string>, info: Record<string, IguardAttendanceInfo>) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(ref(db, paths.iguardAttendance(retreatId)), (snap) => {
    if (!snap.exists()) return cb(new Set(), {});
    const keys: string[] = [];
    const info: Record<string, IguardAttendanceInfo> = {};
    Object.entries(snap.val() as Record<string, IguardAttendance | boolean>).forEach(([rawKey, value]) => {
      const key = decodeURIComponent(rawKey);
      // 하위호환: 구버전 `true` / 신버전 `{checked, updatedAt?, by?}` 모두 지원.
      // checked:false는 해제 톰스톤 — 체크 목록에서 제외하되 info에는 남긴다(누가 해제했는지 표시용).
      if (value === true) { keys.push(key); info[key] = { checked: true }; return; }
      if (typeof value === "object" && value !== null) {
        info[key] = { checked: !!value.checked, updatedAt: value.updatedAt, by: value.by };
        if (value.checked) keys.push(key);
      }
    });
    cb(new Set(keys), info);
  }, (error) => { console.warn("subscribeToIguardAttendance error:", error); onError?.(error); });
}
/**
 * 인원체크 설정/해제 — 동시 사용 안전 버전.
 * - 트랜잭션으로 updatedAt을 비교해, 오프라인에서 늦게 도착한 낡은 쓰기가
 *   더 최신 기록을 덮어쓰지 못하게 한다(재연결 시 서버 값 기준으로 재실행됨).
 * - 해제는 삭제 대신 checked:false 톰스톤을 남긴다 — 삭제하면 낡은 체크가 되살아날 수 있음.
 */
export async function updateIguardAttendance(retreatId: string, key: string, checked: boolean, by?: string): Promise<void> {
  const r = ref(db, paths.iguardAttendanceEntry(retreatId, attendancePathKey(key)));
  const now = Date.now();
  await runTransaction(r, (cur: IguardAttendance | boolean | null) => {
    const curTs = cur && typeof cur === "object" && typeof cur.updatedAt === "number" ? cur.updatedAt : 0;
    if (curTs > now) return undefined; // 서버에 더 최신 기록 — 이 쓰기는 폐기(abort)
    return stripUndefined({ checked, updatedAt: now, by });
  });
}
/** 여러 체크를 한 번의 multi-path update로 해제 — 재점호용 초기화.
 *  개별 해제와 같은 이유로 삭제 대신 톰스톤을 기록한다(초기화 직전 오프라인 체크의 부활 방지). */
export async function clearIguardAttendance(retreatId: string, keys: string[], by?: string): Promise<void> {
  if (keys.length === 0) return;
  const now = Date.now();
  const updates: Record<string, IguardAttendance | Omit<IguardAttendance, "id">> = {};
  keys.forEach(key => { updates[attendancePathKey(key)] = stripUndefined({ checked: false, updatedAt: now, by }); });
  await update(ref(db, paths.iguardAttendance(retreatId)), updates);
}

// ── 집회 자리배치 (iguard/seating) ─────────────────────────
export function subscribeToIguardSeating(retreatId: string, cb: (list: IguardSeating[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardSeating(retreatId)), (snap) =>
    cb(snapToList<IguardSeating>(snap).sort((a, b) => a.day - b.day || a.order - b.order)),
    (error) => { console.warn("subscribeToIguardSeating error:", error); onError?.(error); });
}
export async function saveIguardSeating(retreatId: string, data: Omit<IguardSeating, "id">): Promise<string> {
  const r = push(ref(db, paths.iguardSeating(retreatId)));
  await set(r, stripUndefined(data)); return r.key!;
}
export async function updateIguardSeating(retreatId: string, id: string, data: Partial<Omit<IguardSeating, "id">>): Promise<void> {
  await update(ref(db, paths.iguardSeatingEntry(retreatId, id)), stripUndefined(data));
}
export async function deleteIguardSeating(retreatId: string, id: string): Promise<void> {
  await remove(ref(db, paths.iguardSeatingEntry(retreatId, id)));
}

// ── 조스탭 배정 (iguard/groupStaff) ─────────────────────────
// 이가드가 조별 조스탭을 배정(teacher.id 기준). 행정은 이 노드를 읽어 조편성 탭에 공유 표시.
// 키 = groupId(행정 groups 노드 id), 값 = staffId[](= 행정 teachers 노드 id).
export function subscribeToIguardGroupStaff(retreatId: string, cb: (map: Record<string, string[]>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardGroupStaff(retreatId)), (snap) =>
    cb(snap.exists() ? (snap.val() as Record<string, string[]>) : {}),
    (error) => { console.warn("subscribeToIguardGroupStaff error:", error); onError?.(error); });
}
export async function setIguardGroupStaff(retreatId: string, groupId: string, staffIds: string[]): Promise<void> {
  const path = paths.iguardGroupStaffEntry(retreatId, groupId);
  if (staffIds.length === 0) { await remove(ref(db, path)); return; }
  await set(ref(db, path), staffIds);
}

// 여러 조의 조스탭 배정을 한 번에 원자적으로 갱신 (조 이동 시 이전 조 제거+새 조 추가를 한 쓰기로,
// 고아 배정 정리 시 여러 키 삭제를 한 쓰기로). 빈 배열/null은 해당 키 삭제.
export async function updateIguardGroupStaffEntries(retreatId: string, entries: Record<string, string[] | null>): Promise<void> {
  const updates: Record<string, string[] | null> = {};
  Object.entries(entries).forEach(([gid, ids]) => { updates[gid] = ids && ids.length > 0 ? ids : null; });
  await update(ref(db, paths.iguardGroupStaff(retreatId)), updates);
}

// ── 조별 GBS 장소 (iguard/gbs) ──────────────────────────────
// 행정 groups의 gbs 필드는 읽기 폴백으로만 두고, 새 편집값은 이가드 소유 경로의 조 한 건만 갱신한다.
export function subscribeToIguardGbs(retreatId: string, cb: (map: Record<string, IguardGbsPlace>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardGbs(retreatId)), (snap) =>
    cb(snap.exists() ? (snap.val() as Record<string, IguardGbsPlace>) : {}),
    (error) => { console.warn("subscribeToIguardGbs error:", error); onError?.(error); });
}
export async function saveIguardGbsPlace(retreatId: string, groupId: string, place: string): Promise<void> {
  const value = place.trim();
  const target = ref(db, paths.iguardGbsGroup(retreatId, groupId));
  if (!value) {
    await remove(target);
    return;
  }
  await update(target, { groupId, place: value, updatedAt: Date.now() });
}

// 준비 할 일은 전역 prepMilestones(행정과 공유)를 사용한다. iguard/todos는 폐기됨.

// (이가드 staffMeta 오버레이는 폐기됨 — 스탭 속성의 단일 원천은 행정 teachers.
//  StaffView 읽기전용화 + teachersToStaff 폴백 제거로 staffMeta 읽기/쓰기 모두 제거.)

// (레거시 동선 staffId 마이그레이션 도구 migrateMovementStaffIds 제거됨 —
//  스탭 단일 원천이 행정 teachers로 통일되고 iguard/staff 노드를 폐기하면서 불필요.
//  고아 동선 감지는 ValidationView의 unknownStaffIds 경고로 계속 표면화한다.)

// ── 큐싯 시트 연동 (iguard/cueSheet) ───────────────────────
export interface IguardCueSheet {
  url: string; sheetId: string; gid: string; name?: string; updatedAt?: number;
  // 같은 스프레드시트 내 조장 큐싯 탭 이름. 있으면 불러올 때 함께 가져와 leaderNote를 채움(기본 "조장 큐싯")
  leaderTabName?: string;
  // 마지막 임포트 마커 — 원본 시트가 임포트 이후 바뀌었는지(스냅샷 어긋남) 판정용.
  // lastImportHash = 마지막으로 가져온 CSV 텍스트의 해시(hashCsv). markCueSheetImported가 경로 지정으로 기록한다.
  lastImportHash?: string;
  lastImportedAt?: number;
  lastImportBlockCount?: number;
}
export function subscribeToIguardCueSheet(retreatId: string, cb: (sheet: IguardCueSheet | null) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardCueSheet(retreatId)), (snap) =>
    cb(snap.exists() ? (snap.val() as IguardCueSheet) : null),
    (error) => { console.warn("subscribeToIguardCueSheet error:", error); onError?.(error); });
}
export async function saveIguardCueSheet(retreatId: string, data: Omit<IguardCueSheet, "updatedAt" | "lastImportHash" | "lastImportedAt" | "lastImportBlockCount">): Promise<void> {
  // set()으로 노드 전체 교체 — 설정(URL 등)을 바꾸면 임포트 마커도 자연히 초기화된다(원본이 바뀌었으니 재임포트가 안전한 기본값).
  await set(ref(db, paths.iguardCueSheet(retreatId)), stripUndefined({ ...data, updatedAt: Date.now() }));
}
/** 임포트 성공 직후 마커만 경로 지정으로 기록 — 설정(url/gid 등)은 건드리지 않는다(set 아님, update). */
export async function markCueSheetImported(retreatId: string, meta: { hash: string; blockCount: number }): Promise<void> {
  await update(ref(db, paths.iguardCueSheet(retreatId)), {
    lastImportHash: meta.hash,
    lastImportedAt: Date.now(),
    lastImportBlockCount: meta.blockCount,
  });
}
export async function deleteIguardCueSheet(retreatId: string): Promise<void> {
  await remove(ref(db, paths.iguardCueSheet(retreatId)));
}

// ── 조스탭 가이드 (iguard/guide = string[]) ────────────────
export const DEFAULT_GUIDE = [
  "조장도 어쨌거나 학생. 잘 케어해주기.",
  "인원체크, 줄 세우기는 무조건 조장이 하도록 잘 독려해주기",
  "이성 학생과의 선 잘 지키기, 특히 스킨십 조심!",
  "선생님들의 무리한 요구를 무조건 받아들이지 말고 담당 총괄에게 알리기",
  "아이들 앞에서 핸드폰 조심!",
  "동선 잘 체크하기!! 그 시간에 안 보이거나 연락 안 되면 안 됨",
  "조장이 미처 못 챙기는 소외되는 친구들에게 적극적으로 다가가기",
  "프로그램·동선 때 제외하고는 항상 조와 붙어있기",
  "언어 조심. 복음의 언어를 사용하는 참된 하나님의 자녀가 됩시다",
  "학생한테 해도 되는 말인지 한 번 필터링을 거치기",
];
export function subscribeToIguardGuide(retreatId: string, cb: (items: string[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardGuide(retreatId)), (snap) =>
    cb(snap.exists() && Array.isArray(snap.val()) ? snap.val() : DEFAULT_GUIDE),
    (error) => { console.warn("subscribeToIguardGuide error:", error); onError?.(error); });
}
export async function saveIguardGuide(retreatId: string, items: string[]): Promise<void> {
  await set(ref(db, paths.iguardGuide(retreatId)), items);
}

// ── 수련회별 PIN 잠금 (iguard/accessLock) ─────────────────
// 승인 사용자에게 적용하는 추가 진입 장벽. 관리자 UI에서만 쓰기 함수를 호출한다.
function accessLockFromSnapshot(snap: DataSnapshot): IguardAccessLock | null {
  if (!snap.exists()) return null;
  const value = snap.val() as Partial<IguardAccessLock> | null;
  if (!value || value.enabled !== true) return null;
  return {
    enabled: true,
    version: 1,
    algorithm: "PBKDF2-SHA256",
    iterations: typeof value.iterations === "number" ? value.iterations : 0,
    salt: typeof value.salt === "string" ? value.salt : "",
    pinHash: typeof value.pinHash === "string" ? value.pinHash : "",
    updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
    updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : undefined,
  };
}

export function subscribeToIguardAccessLock(
  retreatId: string,
  cb: (lock: IguardAccessLock | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onValue(
    ref(db, paths.iguardAccessLock(retreatId)),
    snap => cb(accessLockFromSnapshot(snap)),
    error => { console.warn("subscribeToIguardAccessLock error:", error); onError?.(error); },
  );
}

export function subscribeToIguardAccessLocks(
  retreatIds: string[],
  cb: (locks: Record<string, IguardAccessLock>) => void,
  onError?: (error: Error) => void,
): () => void {
  if (retreatIds.length === 0) { cb({}); return () => {}; }
  const values: Record<string, IguardAccessLock> = {};
  const ready = new Set<string>();
  // 실패한 수련회도 ready로 친다 — 한 곳의 읽기가 거부되면 나머지 자물쇠 배지까지
  // 영원히 안 뜨던 문제(에러 경로가 ready에 들어가지 않아 emit 조건이 성립하지 않았다).
  const emit = () => {
    if (ready.size === retreatIds.length) cb({ ...values });
  };
  const unsubs = retreatIds.map(retreatId => subscribeToIguardAccessLock(retreatId, lock => {
    if (lock) values[retreatId] = lock;
    else delete values[retreatId];
    ready.add(retreatId);
    emit();
  }, error => {
    delete values[retreatId];
    ready.add(retreatId);
    emit();
    onError?.(error);
  }));
  return () => unsubs.forEach(unsub => unsub());
}

export async function saveIguardAccessLock(retreatId: string, lock: IguardAccessLock): Promise<void> {
  await set(ref(db, paths.iguardAccessLock(retreatId)), stripUndefined(lock));
}

export async function deleteIguardAccessLock(retreatId: string): Promise<void> {
  await remove(ref(db, paths.iguardAccessLock(retreatId)));
}

// ════════════════════════════════════════════════════════════
// 이가드 접근 관리 — 전용 허용목록 (행정 retreatAdmins와 분리)
//   iguardMembers/{uid} = email  (승인된 이가드 팀원)
//   iguardPending/{uid} = { email, name, requestedAt }  (승인 대기)
// ════════════════════════════════════════════════════════════

export type { IguardPendingReq } from "./pendingAccess";
export interface IguardMemberInfo {
  email: string;
  name?: string;
  /** 두 축 역할 — 없으면 iguardRoles에서 파생한다(resolveMinistryRoles) */
  semesterRole?: SemesterRole;
  retreatRole?: RetreatRole;
}

/** 로그인했지만 권한 없는 사용자가 접근 요청 */
export async function requestIguardAccess(uid: string, email: string, name: string): Promise<void> {
  // siteRequests 하위 노드를 덮지 않도록 접근 요청 필드만 갱신한다.
  await update(ref(db, paths.iguardPendingEntry(uid)), { email, name, requestedAt: Date.now() });
}

/** 본인이 이미 요청 보냈는지 확인 (대기 화면 표시용) */
export async function getMyIguardPending(uid: string): Promise<boolean> {
  const snap = await get(ref(db, paths.iguardPendingRequestedAt(uid)));
  return snap.exists();
}

export function subscribeToIguardPending(cb: (list: IguardPendingReq[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardPending()), (snap) => {
    cb(normalizeIguardPendingRequests(snap.exists() ? snap.val() : null));
  }, (error) => { console.warn("subscribeToIguardPending error:", error); onError?.(error); });
}

function normalizeIguardMembers(raw: unknown): Record<string, IguardMemberInfo> {
  if (!raw || typeof raw !== "object") return {};
  const entries: Array<[string, IguardMemberInfo]> = Object.entries(raw as Record<string, unknown>).map(([uid, value]) => {
    if (typeof value === "string") return [uid, { email: value }];
    const v = value as Partial<IguardMemberInfo> | null;
    return [uid, {
      email: v?.email || "",
      name: v?.name || undefined,
      ...(isSemesterRole(v?.semesterRole) ? { semesterRole: v.semesterRole } : {}),
      ...(isRetreatRole(v?.retreatRole) ? { retreatRole: v.retreatRole } : {}),
    }];
  });
  return Object.fromEntries(entries.filter(([, value]) => value.email || value.name));
}

export function subscribeToIguardMembers(cb: (members: Record<string, IguardMemberInfo>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardMembers()), (snap) => cb(normalizeIguardMembers(snap.exists() ? snap.val() : null)),
    (error) => { console.warn("subscribeToIguardMembers error:", error); onError?.(error); });
}

// 역할: iguardRoles/{uid} = "staff" | "team" (없으면 team으로 간주)
export type IguardRole = "staff" | "team";
export function subscribeToIguardRoles(cb: (roles: Record<string, IguardRole>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardRoles()), (snap) => cb(snap.exists() ? snap.val() : {}),
    (error) => { console.warn("subscribeToIguardRoles error:", error); onError?.(error); });
}
export async function setIguardRole(uid: string, role: IguardRole): Promise<void> {
  await set(ref(db, paths.iguardRole(uid)), role);
}

/** 승인: 대기열 → 멤버로 이동 + 역할 부여 (단일 multi-path 업데이트) */
export async function approveIguardMember(
  uid: string,
  email: string,
  role: IguardRole = "team",
  name?: string,
  roles?: MinistryRoles,
): Promise<void> {
  await update(ref(db), {
    [paths.iguardMember(uid)]: stripUndefined({
      email,
      name: name?.trim() || undefined,
      semesterRole: roles?.semester,
      retreatRole: roles?.retreat,
      // 주일 사역 자기 팀 저장을 Rules가 확인하는 플래그.
      // iguardRoles는 'staff'|'team'만 허용(validate)이라 여기에 따로 둔다.
      // 이 경로는 노드를 통째로 교체하므로, 자격을 잃으면 키가 사라져 플래그도 함께 꺼진다.
      sundayWrite: roles && ownSundayTeam(roles) ? true : undefined,
    }),
    [paths.iguardRole(uid)]: role,
    [paths.iguardPendingEmail(uid)]: null,
    [paths.iguardPendingName(uid)]: null,
    [paths.iguardPendingRequestedAt(uid)]: null,
  });
}

export async function updateIguardMemberName(uid: string, email: string, name: string): Promise<void> {
  await update(ref(db, paths.iguardMember(uid)), stripUndefined({
    email: email || undefined,
    name: name.trim() || null,
  }));
}

export async function denyIguardPending(uid: string): Promise<void> {
  await update(ref(db), {
    [paths.iguardPendingEmail(uid)]: null,
    [paths.iguardPendingName(uid)]: null,
    [paths.iguardPendingRequestedAt(uid)]: null,
  });
}

export async function removeIguardMember(uid: string): Promise<void> {
  await update(ref(db), { [paths.iguardMember(uid)]: null, [paths.iguardRole(uid)]: null });
}

// ── 연결 상태 (오프라인 안내용) ──────────────────────────────
/** Firebase 연결 상태 구독 (".info/connected") — 현장 와이파이 끊김 시 인원체크 유실 경고용.
 *  데이터 노드가 아닌 클라이언트 메타 경로라 읽기 전용 원칙과 무관하다. */
export function subscribeToConnection(callback: (connected: boolean) => void): () => void {
  return onValue(ref(db, ".info/connected"), (snap) => callback(snap.val() === true));
}
