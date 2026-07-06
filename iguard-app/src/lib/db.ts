import { ref, get, set, update, push, remove, onValue, DataSnapshot } from "firebase/database";
import { db } from "./firebase";
import { paths } from "./paths";
import { Retreat, Group, Room, Participant, Student, ClassData, IguardMeal,
  IguardScheduleBlock, IguardPost, IguardMovement, IguardBus, IguardSeating,
  RetreatPeriod, Milestone, IguardAttendance, TeacherAttendance } from "./types";
export { snapToList } from "./snapToList";
import { snapToList } from "./snapToList";

// ════════════════════════════════════════════════════════════
// 🔒 읽기 전용 영역 — 행정 앱(retreat-app)이 소유한 노드
//    절대 set/update/remove 정의 금지. 소비(read/subscribe)만 한다.
// ════════════════════════════════════════════════════════════

export async function getRetreats(): Promise<Retreat[]> {
  const snap = await get(ref(db, paths.retreats()));
  return snapToList<Retreat>(snap);
}

export async function getRetreat(id: string): Promise<Retreat | null> {
  const snap = await get(ref(db, paths.retreat(id)));
  if (!snap.exists()) return null;
  return { id, ...snap.val() } as Retreat;
}

export function subscribeToRetreat(id: string, cb: (retreat: Retreat | null) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.retreat(id)), (snap) =>
    cb(snap.exists() ? ({ id, ...snap.val() } as Retreat) : null),
    (error) => { console.warn("subscribeToRetreat error:", error); onError?.(error); });
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

// 부분참(본대/선복귀/후발대) — 행정 소유, 이가드는 읽기 전용 소비
// 노드: retreats/{id}/partialAttendances/{uniqueKey} = { type: "선복귀"|"후발대", note?, updatedAt? }
export function subscribeToPartialAttendances(retreatId: string, cb: (map: Record<string, "선복귀" | "후발대">) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.partialAttendances(retreatId)), (snap) => {
    if (!snap.exists()) return cb({});
    const out: Record<string, "선복귀" | "후발대"> = {};
    Object.entries(snap.val() as Record<string, { type?: string } | string>).forEach(([key, value]) => {
      const t = typeof value === "string" ? value : value?.type;
      if (t === "선복귀" || t === "후발대") out[key] = t;
    });
    cb(out);
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
  cb: (periods: RetreatPeriodWithOwner[]) => void
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
    })
  );
  return () => unsubs.forEach(u => u());
}

// 🌐 준비 일정(milestones)은 전역 공유 노드 `prepMilestones` — 수련회와 무관.
//    행정·이가드 홈 캘린더 + 이가드 준비할일이 한 노드를 공유.
const GLOBAL_MILESTONES_PATH = paths.prepMilestones();

export function subscribeToMilestones(cb: (milestones: Milestone[]) => void): () => void {
  return onValue(
    ref(db, GLOBAL_MILESTONES_PATH),
    (snap) => cb(snapToList<Milestone>(snap).sort((a, b) => a.targetDate.localeCompare(b.targetDate))),
    (error) => {
      console.warn(`Failed to subscribe ${GLOBAL_MILESTONES_PATH}:`, error);
      cb([]);
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
  const r = push(ref(db, paths.iguardSchedule(retreatId)));
  await set(r, stripUndefined(data)); return r.key!;
}
export async function updateIguardScheduleBlock(retreatId: string, id: string, data: Partial<Omit<IguardScheduleBlock, "id">>): Promise<void> {
  await update(ref(db, paths.iguardScheduleBlock(retreatId, id)), stripUndefined(data));
}
export async function deleteIguardScheduleBlock(retreatId: string, id: string): Promise<void> {
  const movementsSnap = await get(ref(db, paths.iguardMovements(retreatId)));
  const updates: Record<string, null> = { [paths.iguardScheduleBlock(retreatId, id)]: null };
  if (movementsSnap.exists()) {
    Object.entries(movementsSnap.val() as Record<string, IguardMovement>).forEach(([key, movement]) => {
      if (movement?.blockId === id) updates[paths.iguardMovement(retreatId, key)] = null;
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
  await set(r, stripUndefined(data)); return r.key!;
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

// ── 동선 매트릭스 (iguard/movements) — 복합키 staffId__blockId ──
export function subscribeToIguardMovements(retreatId: string, cb: (list: IguardMovement[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardMovements(retreatId)), (snap) =>
    cb(snapToList<IguardMovement>(snap)),
    (error) => { console.warn("subscribeToIguardMovements error:", error); onError?.(error); });
}
/** 한 스탭×블록 셀을 설정(postId 지정) 또는 해제(null) */
export async function setIguardMovement(
  retreatId: string, staffId: string, blockId: string,
  data: { postId: string; round?: "선밥" | "후밥"; note?: string } | null
): Promise<void> {
  const key = `${staffId}__${blockId}`;
  const path = paths.iguardMovement(retreatId, key);
  if (data === null) { await remove(ref(db, path)); return; }
  await set(ref(db, path), stripUndefined({ staffId, blockId, ...data }));
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
export async function updateIguardBus(retreatId: string, id: string, data: Partial<Omit<IguardBus, "id" | "staff" | "note">> & { staff?: string | null; note?: string | null }): Promise<void> {
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
export function subscribeToIguardAttendance(retreatId: string, cb: (checkedKeys: Set<string>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardAttendance(retreatId)), (snap) => {
    if (!snap.exists()) return cb(new Set());
    const keys = Object.entries(snap.val() as Record<string, IguardAttendance | boolean>)
      .filter(([, value]) => value === true || (typeof value === "object" && value?.checked))
      .map(([key]) => decodeURIComponent(key));
    cb(new Set(keys));
  }, (error) => { console.warn("subscribeToIguardAttendance error:", error); onError?.(error); });
}
export async function updateIguardAttendance(retreatId: string, key: string, checked: boolean): Promise<void> {
  const r = ref(db, paths.iguardAttendanceEntry(retreatId, attendancePathKey(key)));
  if (!checked) {
    await remove(r);
    return;
  }
  await set(r, { checked: true, updatedAt: Date.now() });
}
/** 여러 체크를 한 번의 multi-path update로 해제 — 재점호용 초기화 */
export async function clearIguardAttendance(retreatId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const updates: Record<string, null> = {};
  keys.forEach(key => { updates[attendancePathKey(key)] = null; });
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
}
export function subscribeToIguardCueSheet(retreatId: string, cb: (sheet: IguardCueSheet | null) => void): () => void {
  return onValue(ref(db, paths.iguardCueSheet(retreatId)), (snap) =>
    cb(snap.exists() ? (snap.val() as IguardCueSheet) : null));
}
export async function saveIguardCueSheet(retreatId: string, data: Omit<IguardCueSheet, "updatedAt">): Promise<void> {
  await set(ref(db, paths.iguardCueSheet(retreatId)), stripUndefined({ ...data, updatedAt: Date.now() }));
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

// ════════════════════════════════════════════════════════════
// 이가드 접근 관리 — 전용 허용목록 (행정 retreatAdmins와 분리)
//   iguardMembers/{uid} = email  (승인된 이가드 팀원)
//   iguardPending/{uid} = { email, name, requestedAt }  (승인 대기)
// ════════════════════════════════════════════════════════════

export interface IguardPendingReq { uid: string; email: string; name: string; requestedAt: number; }
export interface IguardMemberInfo { email: string; name?: string; }

/** 로그인했지만 권한 없는 사용자가 접근 요청 */
export async function requestIguardAccess(uid: string, email: string, name: string): Promise<void> {
  await set(ref(db, paths.iguardPendingEntry(uid)), { email, name, requestedAt: Date.now() });
}

/** 본인이 이미 요청 보냈는지 확인 (대기 화면 표시용) */
export async function getMyIguardPending(uid: string): Promise<boolean> {
  const snap = await get(ref(db, paths.iguardPendingEntry(uid)));
  return snap.exists();
}

export function subscribeToIguardPending(cb: (list: IguardPendingReq[]) => void): () => void {
  return onValue(ref(db, paths.iguardPending()), (snap) => {
    if (!snap.exists()) return cb([]);
    cb(Object.entries(snap.val()).map(([uid, v]) => ({ uid, ...(v as Omit<IguardPendingReq, "uid">) }))
      .sort((a, b) => a.requestedAt - b.requestedAt));
  });
}

function normalizeIguardMembers(raw: unknown): Record<string, IguardMemberInfo> {
  if (!raw || typeof raw !== "object") return {};
  const entries: Array<[string, IguardMemberInfo]> = Object.entries(raw as Record<string, unknown>).map(([uid, value]) => {
    if (typeof value === "string") return [uid, { email: value }];
    const v = value as Partial<IguardMemberInfo> | null;
    return [uid, { email: v?.email || "", name: v?.name || undefined }];
  });
  return Object.fromEntries(entries.filter(([, value]) => value.email || value.name));
}

export function subscribeToIguardMembers(cb: (members: Record<string, IguardMemberInfo>) => void): () => void {
  return onValue(ref(db, paths.iguardMembers()), (snap) => cb(normalizeIguardMembers(snap.exists() ? snap.val() : null)));
}

// 역할: iguardRoles/{uid} = "staff" | "team" (없으면 team으로 간주)
export type IguardRole = "staff" | "team";
export function subscribeToIguardRoles(cb: (roles: Record<string, IguardRole>) => void): () => void {
  return onValue(ref(db, paths.iguardRoles()), (snap) => cb(snap.exists() ? snap.val() : {}));
}
export async function setIguardRole(uid: string, role: IguardRole): Promise<void> {
  await set(ref(db, paths.iguardRole(uid)), role);
}

/** 승인: 대기열 → 멤버로 이동 + 역할 부여 (단일 multi-path 업데이트) */
export async function approveIguardMember(uid: string, email: string, role: IguardRole = "team", name?: string): Promise<void> {
  await update(ref(db), {
    [paths.iguardMember(uid)]: stripUndefined({ email, name: name?.trim() || undefined }),
    [paths.iguardRole(uid)]: role,
    [paths.iguardPendingEntry(uid)]: null,
  });
}

export async function updateIguardMemberName(uid: string, email: string, name: string): Promise<void> {
  await update(ref(db, paths.iguardMember(uid)), stripUndefined({
    email: email || undefined,
    name: name.trim() || null,
  }));
}

export async function denyIguardPending(uid: string): Promise<void> {
  await remove(ref(db, paths.iguardPendingEntry(uid)));
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
