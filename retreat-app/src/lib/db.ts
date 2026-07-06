import { ref, get, set, update, push, remove, onValue, query, orderByChild, equalTo, runTransaction, DataSnapshot } from "firebase/database";
import { db } from "./firebase";
import { Retreat, Group, Room, Participant, Student, ClassData, TeacherAttendance, CarPool, PartialAttendance, Cancellation, SupplyItem, SnackItem, AdminSupplyItem, SuppliesBudget, MealCountData, BrainstormNote, BrainstormComment, OnSiteEntry, UnmatchedPayment, TshirtOrder, Milestone, RetreatPeriod, MedicalLog, SyncDuplicateGroup } from "./types";
import { paths } from "./paths";

// Helper: DataSnapshot → typed list (injects id from Firebase key)
function snapToList<T extends { id: string }>(snap: DataSnapshot): T[] {
  if (!snap.exists()) return [];
  return Object.entries(snap.val()).map(([id, data]) => ({ id, ...(data as object) } as T));
}

export const RETREAT_ADMIN_SOURCE_SITE = "retreat-admin";

export interface RetreatAdminMember {
  email: string;
  name?: string;
  approvedAt?: number;
}

export const retreatSharedSchedulePaths = {
  milestones: (retreatId: string) => `retreats/${retreatId}/milestones` as const,
  periods: (retreatId: string) => paths.periods(retreatId),
};

function normalizeRetreatAdminMember(value: unknown): RetreatAdminMember {
  if (typeof value === "string") return { email: value };
  if (value && typeof value === "object") {
    const data = value as Partial<RetreatAdminMember>;
    return {
      email: data.email ?? "",
      ...(data.name ? { name: data.name } : {}),
      ...(data.approvedAt ? { approvedAt: data.approvedAt } : {}),
    };
  }
  return { email: "" };
}

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

// ── Participants ───────────────────────────────────────────

export async function saveParticipants(
  retreatId: string,
  participants: Record<string, Participant>
): Promise<void> {
  await set(ref(db, paths.participants(retreatId)), stripUndefined(participants));
}

/**
 * 시트 동기화/재매칭으로 participants를 덮어쓰기 전, 현재 상태를 백업으로 저장.
 * 매칭이 잘못되어 입금완료 표시 등 수기 데이터 참조가 어긋났을 때 복구할 수 있는 안전망.
 * 최근 5개만 유지 (오래된 백업은 자동 삭제).
 */
export async function backupParticipants(retreatId: string): Promise<void> {
  const current = await getParticipants(retreatId);
  if (Object.keys(current).length === 0) return;
  const basePath = paths.participantsBackups(retreatId);
  const snap = await get(ref(db, basePath));
  const existing = snap.exists() ? Object.keys(snap.val()) : [];
  const payload: Record<string, Record<string, Participant> | null> = {};
  if (existing.length >= 5) {
    existing.sort().slice(0, existing.length - 4).forEach(k => { payload[`${basePath}/${k}`] = null; });
  }
  payload[`${basePath}/${Date.now()}`] = stripUndefined(current);
  await update(ref(db), stripUndefined(payload));
}

export async function getParticipantsBackups(retreatId: string): Promise<Record<string, Record<string, Participant>>> {
  const snap = await get(ref(db, paths.participantsBackups(retreatId)));
  return snap.exists() ? snap.val() : {};
}

export async function restoreParticipantsBackup(retreatId: string, backupKey: string): Promise<void> {
  const snap = await get(ref(db, paths.participantsBackup(retreatId, backupKey)));
  if (!snap.exists()) throw new Error("백업을 찾을 수 없습니다.");
  await set(ref(db, paths.participants(retreatId)), snap.val());
}

// ── Sync Meta (중복 신청 등 동기화 결과 저장) ─────────────
export async function saveSyncDuplicates(retreatId: string, duplicates: SyncDuplicateGroup[]): Promise<void> {
  await set(ref(db, paths.syncDuplicates(retreatId)), duplicates.length > 0 ? stripUndefined(duplicates) : null);
}
export async function getSyncDuplicates(retreatId: string): Promise<SyncDuplicateGroup[]> {
  const snap = await get(ref(db, paths.syncDuplicates(retreatId)));
  if (!snap.exists()) return [];
  const val = snap.val();
  return Array.isArray(val) ? val : Object.values(val);
}

export async function getParticipants(retreatId: string): Promise<Record<string, Participant>> {
  const snap = await get(ref(db, paths.participants(retreatId)));
  return snap.exists() ? snap.val() : {};
}

/** 특정 참가자 1명의 경로만 덮어쓰기 — 중복 신청 중 다른 항목을 선택했을 때 사용 (전체 participants 덮어쓰기 금지) */
export async function updateParticipant(retreatId: string, key: string, data: Participant): Promise<void> {
  await set(ref(db, paths.participant(retreatId, key)), stripUndefined(data));
}

/** 재매칭 전용 — studentId/phone/pPhone만 경로 지정 업데이트, extra 등 나머지 필드는 건드리지 않음 */
export async function applyRematch(
  retreatId: string,
  updates: Record<string, { studentId: string | null; phone: string | null; pPhone: string | null }>
): Promise<void> {
  const flatUpdates: Record<string, string | null> = {};
  for (const [key, upd] of Object.entries(updates)) {
    flatUpdates[`${paths.participant(retreatId, key)}/studentId`] = upd.studentId;
    flatUpdates[`${paths.participant(retreatId, key)}/phone`] = upd.phone;
    flatUpdates[`${paths.participant(retreatId, key)}/pPhone`] = upd.pPhone;
  }
  await update(ref(db), flatUpdates);
}

/** 특이사항만 경로 지정 업데이트 — 전체 participants 덮어쓰기 방지 */
export async function updateParticipantExtra(
  retreatId: string,
  key: string,
  extra: string | undefined
): Promise<void> {
  if (extra === undefined) {
    await remove(ref(db, paths.participantExtra(retreatId, key)));
  } else {
    await set(ref(db, paths.participantExtra(retreatId, key)), extra);
  }
}

// ── Groups ────────────────────────────────────────────────

export async function getGroups(retreatId: string): Promise<Group[]> {
  const snap = await get(ref(db, paths.groups(retreatId)));
  return snapToList<Group>(snap);
}

/**
 * 노드 전체 덮어쓰기(set) 직전, 현재 상태를 롤링 백업(최근 5개)한다.
 * groups/rooms는 participants와 달리 전체 set으로 저장돼 저장 버그·실수 시 복구 수단이 없었다.
 * 편집 중 저장이 잦으므로 마지막 백업이 minIntervalMs 이내면 건너뛰어 쓰기 폭주를 막는다.
 * 백업 실패가 본 저장을 막지 않도록 베스트 에포트로 동작한다.
 */
async function backupNodeBeforeOverwrite(
  currentPath: string,
  backupsBasePath: string,
  minIntervalMs = 10 * 60 * 1000,
): Promise<void> {
  try {
    const curSnap = await get(ref(db, currentPath));
    if (!curSnap.exists()) return; // 백업할 현재 데이터 없음
    const backupsSnap = await get(ref(db, backupsBasePath));
    const existingKeys = backupsSnap.exists() ? Object.keys(backupsSnap.val()) : [];
    const now = Date.now();
    const lastTs = existingKeys.map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a)[0];
    if (lastTs && now - lastTs < minIntervalMs) return; // 최근 백업이 있으면 스킵
    const payload: Record<string, unknown> = {};
    const sorted = [...existingKeys].sort();
    if (sorted.length >= 5) sorted.slice(0, sorted.length - 4).forEach(k => { payload[`${backupsBasePath}/${k}`] = null; });
    payload[`${backupsBasePath}/${now}`] = curSnap.val();
    await update(ref(db), payload);
  } catch {
    // 베스트 에포트 — 백업 실패는 저장을 막지 않는다
  }
}

export async function saveGroups(retreatId: string, groups: Group[]): Promise<void> {
  await backupNodeBeforeOverwrite(paths.groups(retreatId), paths.groupsBackups(retreatId));
  const data: Record<string, Omit<Group, "id">> = {};
  groups.forEach((g) => {
    const { id, ...rest } = g;
    data[id] = rest;
  });
  await set(ref(db, paths.groups(retreatId)), stripUndefined(data));
}

export async function getGroupsBackups(retreatId: string): Promise<Record<string, Record<string, Omit<Group, "id">>>> {
  const snap = await get(ref(db, paths.groupsBackups(retreatId)));
  return snap.exists() ? snap.val() : {};
}

export async function restoreGroupsBackup(retreatId: string, backupKey: string): Promise<void> {
  const snap = await get(ref(db, paths.groupsBackup(retreatId, backupKey)));
  if (!snap.exists()) throw new Error("조편성 백업을 찾을 수 없습니다.");
  // 복구도 되돌릴 수 있도록 현재 상태를 강제 백업(스로틀 무시)한 뒤 덮어쓴다.
  await backupNodeBeforeOverwrite(paths.groups(retreatId), paths.groupsBackups(retreatId), 0);
  await set(ref(db, paths.groups(retreatId)), snap.val());
}

export async function updateGroup(retreatId: string, groupId: string, data: Partial<Group>): Promise<void> {
  await update(ref(db, paths.group(retreatId, groupId)), stripUndefined(data));
}

// 조스탭 배정 — 이가드가 소유(retreats/{id}/iguard/groupStaff). 행정은 읽기 전용으로 공유 표시.
// 키 = groupId, 값 = staffId[](= teacher.id).
export function subscribeToIguardGroupStaff(retreatId: string, callback: (map: Record<string, string[]>) => void): () => void {
  return onValue(ref(db, paths.iguardGroupStaff(retreatId)), (snap) =>
    callback(snap.exists() ? (snap.val() as Record<string, string[]>) : {}));
}

// ── Rooms ─────────────────────────────────────────────────

export async function getRooms(retreatId: string): Promise<Room[]> {
  const snap = await get(ref(db, paths.rooms(retreatId)));
  return snapToList<Room>(snap);
}

export async function saveRooms(retreatId: string, rooms: Room[]): Promise<void> {
  await backupNodeBeforeOverwrite(paths.rooms(retreatId), paths.roomsBackups(retreatId));
  const data: Record<string, Omit<Room, "id">> = {};
  rooms.forEach((r) => {
    const { id, ...rest } = r;
    data[id] = rest;
  });
  await set(ref(db, paths.rooms(retreatId)), stripUndefined(data));
}

export async function getRoomsBackups(retreatId: string): Promise<Record<string, Record<string, Omit<Room, "id">>>> {
  const snap = await get(ref(db, paths.roomsBackups(retreatId)));
  return snap.exists() ? snap.val() : {};
}

export async function restoreRoomsBackup(retreatId: string, backupKey: string): Promise<void> {
  const snap = await get(ref(db, paths.roomsBackup(retreatId, backupKey)));
  if (!snap.exists()) throw new Error("방배정 백업을 찾을 수 없습니다.");
  // 복구도 되돌릴 수 있도록 현재 상태를 강제 백업(스로틀 무시)한 뒤 덮어쓴다.
  await backupNodeBeforeOverwrite(paths.rooms(retreatId), paths.roomsBackups(retreatId), 0);
  await set(ref(db, paths.rooms(retreatId)), snap.val());
}

export async function updateRoom(retreatId: string, roomId: string, data: Partial<Room>): Promise<void> {
  await update(ref(db, paths.room(retreatId, roomId)), stripUndefined(data));
}

// ── Firebase Students ──────────────────────────────────────

export async function getStudentsByYear(year: number): Promise<Record<string, Student>> {
  const snap = await get(ref(db, paths.classes(year)));
  if (!snap.exists()) return {};

  const result: Record<string, Student> = {};
  const classesData = snap.val() as Record<string, ClassData>;

  Object.entries(classesData).forEach(([classKey, classData]) => {
    // classKey 형식: {부}-{학년}-{반} (예: "1-2-3" = 1부 2학년 3반)
    const parts = classKey.split("-");
    const buNum = parseInt(parts[0]);   // 부 (1/2)
    const grade = parseInt(parts[1]);   // 학년 (1/2/3)
    const cls   = parseInt(parts[2]);   // 반 번호

    if (classData.students) {
      Object.entries(classData.students).forEach(([studentId, student]) => {
        // 1부와 2부에 동일한 studentId가 있으므로 부 번호를 앞에 붙여 유니크하게
        const uniqueKey = `${buNum}_${studentId}`;
        result[uniqueKey] = {
          ...student,
          id: uniqueKey,  // 부 prefix 포함한 진짜 고유 ID
          buNum,
          grade,
          class: cls,
        };
      });
    }
  });

  return result;
}

/** classes/{year} 전체를 원시 형태로 반환 — 직접 Firebase 접근 대신 사용 */
export async function getClassesByYear(year: number): Promise<Record<string, {
  teacher?: string;
  students?: Record<string, { name: string; num?: number; phone?: string; jang?: boolean }>;
}>> {
  const snap = await get(ref(db, paths.classes(year)));
  return snap.exists() ? snap.val() : {};
}

export async function getAttendanceByYear(year: number): Promise<Record<string, Record<string, Record<string, string>>>> {
  const snap = await get(ref(db, paths.attendance(year)));
  return snap.exists() ? snap.val() : {};
}

// ── Teacher Attendance ────────────────────────────────────

export async function getTeachers(retreatId: string): Promise<TeacherAttendance[]> {
  const snap = await get(ref(db, paths.teachers(retreatId)));
  return snapToList<TeacherAttendance>(snap);
}

export function subscribeToParticipants(retreatId: string, callback: (parts: Record<string, Participant>) => void): () => void {
  return onValue(ref(db, paths.participants(retreatId)), (snap) => callback(snap.exists() ? snap.val() : {}));
}

export function subscribeToCellColors(retreatId: string, callback: (colors: Record<string, string>) => void): () => void {
  return onValue(ref(db, paths.cellColors(retreatId)), (snap) => callback(snap.exists() ? snap.val() : {}));
}

export function subscribeToTeachers(retreatId: string, callback: (teachers: TeacherAttendance[]) => void): () => void {
  return onValue(ref(db, paths.teachers(retreatId)), (snap) => callback(snapToList<TeacherAttendance>(snap)));
}

export async function saveTeacher(retreatId: string, teacher: Omit<TeacherAttendance, "id">): Promise<string> {
  const newRef = push(ref(db, paths.teachers(retreatId)));
  await set(newRef, stripUndefined(teacher));
  return newRef.key!;
}

export async function updateTeacher(retreatId: string, teacherId: string, data: Partial<TeacherAttendance>): Promise<void> {
  await update(ref(db, paths.teacher(retreatId, teacherId)), stripUndefined(data));
}

export async function deleteTeacher(retreatId: string, teacherId: string): Promise<void> {
  await remove(ref(db, paths.teacher(retreatId, teacherId)));
}

// ── Carpool ───────────────────────────────────────────────

export async function getCarpools(retreatId: string): Promise<CarPool[]> {
  const snap = await get(ref(db, paths.carpools(retreatId)));
  return snapToList<CarPool>(snap);
}

export async function saveCarpool(retreatId: string, carpool: Omit<CarPool, "id">): Promise<string> {
  const newRef = push(ref(db, paths.carpools(retreatId)));
  await set(newRef, stripUndefined(carpool));
  return newRef.key!;
}

export async function updateCarpool(retreatId: string, carpoolId: string, data: Partial<CarPool>): Promise<void> {
  await update(ref(db, paths.carpool(retreatId, carpoolId)), stripUndefined(data));
}

export async function deleteCarpool(retreatId: string, carpoolId: string): Promise<void> {
  await remove(ref(db, paths.carpool(retreatId, carpoolId)));
}

// ── Retreat Access Control ────────────────────────────────

export async function isRetreatAdmin(uid: string): Promise<boolean> {
  const snap = await get(ref(db, paths.retreatAdmin(uid)));
  return snap.exists();
}

export async function getRetreatAdmins(): Promise<Record<string, RetreatAdminMember>> {
  const snap = await get(ref(db, paths.retreatAdmins()));
  if (!snap.exists()) return {};
  return Object.fromEntries(
    Object.entries(snap.val()).map(([uid, value]) => [uid, normalizeRetreatAdminMember(value)])
  );
}

export async function addRetreatAdmin(uid: string, email: string, name?: string): Promise<void> {
  await set(ref(db, paths.retreatAdmin(uid)), stripUndefined({
    email,
    name: name?.trim() || undefined,
    approvedAt: Date.now(),
  }));
}

export async function updateRetreatAdminMemberName(uid: string, member: RetreatAdminMember, name: string): Promise<void> {
  await set(ref(db, paths.retreatAdmin(uid)), stripUndefined({
    email: member.email,
    name: name.trim() || undefined,
    approvedAt: member.approvedAt ?? Date.now(),
  }));
}

export async function removeRetreatAdmin(uid: string): Promise<void> {
  await remove(ref(db, paths.retreatAdmin(uid)));
}

export async function requestRetreatAccess(uid: string, email: string, name: string): Promise<void> {
  await set(ref(db, paths.retreatPendingEntry(uid)), stripUndefined({ email, name, requestedAt: Date.now() }));
}

export async function getPendingRequests(): Promise<Record<string, { email: string; name: string; requestedAt: number }>> {
  const snap = await get(ref(db, paths.retreatPending()));
  return snap.exists() ? snap.val() : {};
}

export async function approveRetreatRequest(uid: string, request: { email: string; name?: string } | string): Promise<void> {
  const email = typeof request === "string" ? request : request.email;
  const name = typeof request === "string" ? undefined : request.name;
  await addRetreatAdmin(uid, email, name);
  await remove(ref(db, paths.retreatPendingEntry(uid)));
}

export async function denyRetreatRequest(uid: string): Promise<void> {
  await remove(ref(db, paths.retreatPendingEntry(uid)));
}

// ── Teachers from DB (classes node) ──────────────────────

export interface LoadableTeacher { name: string; bu: string; classKey: string; originKey: string; }
export interface LoadTeachersResult {
  teachers: LoadableTeacher[];
  hasStaffNode: boolean; // teacherStaff/{year} 존재 여부 — 없으면 공식스탭이 비어 나옴(연도 가드용)
}

export async function loadTeachersFromDB(year: number): Promise<LoadTeachersResult> {
  const [classSnap, staffSnap, specialSnap, extraSnap] = await Promise.all([
    get(ref(db, paths.classes(year))),
    get(ref(db, paths.teacherStaff(year))),
    get(ref(db, paths.teacherSpecial(year))),
    get(ref(db, paths.teacherExtra(year))),
  ]);

  const result: LoadableTeacher[] = [];
  const extraData = extraSnap.exists()
    ? extraSnap.val() as Record<string, Record<string, { title?: string; name?: string }>>
    : {};

  if (classSnap.exists()) {
    const classesData = classSnap.val() as Record<string, { teacher?: string }>;
    Object.entries(classesData).forEach(([classKey, cd]) => {
      const parts = classKey.split("-");
      const buNum = parseInt(parts[0]);
      const grade = parseInt(parts[1]);
      const cls = parseInt(parts[2]);
      if (!buNum || !grade || !cls) return;
      const extraKey = classKey.replaceAll("-", "_");
      const extra = extraData[String(buNum)]?.[extraKey];
      const teacherName = extra?.name?.trim() || cd.teacher?.trim();
      if (!teacherName) return;
      result.push({
        name: teacherName,
        bu: buNum === 1 ? "1부" : "2부",
        classKey: extra?.title?.trim() || `${grade}학년 ${cls}반`,
        originKey: `class:${classKey}`, // 반 단위 안정 키 (부-학년-반)
      });
    });
  }

  if (specialSnap.exists()) {
    const specialData = specialSnap.val() as Record<string, Array<{ title?: string; name?: string }>>;
    Object.entries(specialData).forEach(([part, list]) => {
      if (!Array.isArray(list)) return;
      list.forEach((teacher, index) => {
        const name = teacher?.name?.trim();
        if (!name) return;
        result.push({
          name,
          bu: part === "1" ? "1부" : "2부",
          classKey: teacher.title?.trim() || "비반담임",
          originKey: `special:${part}:${index}`,
        });
      });
    });
  }

  if (staffSnap.exists()) {
    const staffData = staffSnap.val() as Record<string, { name?: string; title?: string }>;
    Object.entries(staffData).forEach(([staffKey, s]) => {
      if (!s.name) return;
      result.push({
        name: s.name,
        bu: "스탭",
        classKey: s.title || "스탭",
        originKey: `staff:${staffKey}`, // teacherStaff 노드키 = 인물 단위 안정 키
      });
    });
  }

  return {
    teachers: result.sort((a, b) => a.bu.localeCompare(b.bu) || a.classKey.localeCompare(b.classKey, "ko")),
    hasStaffNode: staffSnap.exists(),
  };
}

// ── Cell Colors ───────────────────────────────────────────

export async function getCellColors(retreatId: string): Promise<Record<string, string>> {
  const snap = await get(ref(db, paths.cellColors(retreatId)));
  return snap.exists() ? snap.val() : {};
}

export async function setCellColor(retreatId: string, cellKey: string, color: string | null): Promise<void> {
  if (color === null) {
    await remove(ref(db, paths.cellColor(retreatId, cellKey)));
  } else {
    await set(ref(db, paths.cellColor(retreatId, cellKey)), color);
  }
}

// ── Partial Attendance ────────────────────────────────────

export async function getPartialAttendances(retreatId: string): Promise<PartialAttendance[]> {
  const snap = await get(ref(db, paths.partialAttendances(retreatId)));
  return snapToList<PartialAttendance>(snap)
    .filter(r => r.type === "선복귀" || r.type === "후발대");
}

export async function savePartialAttendance(retreatId: string, studentKey: string, data: Omit<PartialAttendance, "id">): Promise<string> {
  await set(ref(db, paths.partialAttendance(retreatId, studentKey)), stripUndefined({
    type: data.type,
    note: data.note,
    updatedAt: data.updatedAt ?? Date.now(),
  }));
  return studentKey;
}

export async function updatePartialAttendance(retreatId: string, paId: string, data: Partial<PartialAttendance>): Promise<void> {
  await update(ref(db, paths.partialAttendance(retreatId, paId)), stripUndefined({
    type: data.type,
    note: data.note,
    updatedAt: data.updatedAt ?? Date.now(),
  }));
}

export async function deletePartialAttendance(retreatId: string, paId: string): Promise<void> {
  await remove(ref(db, paths.partialAttendance(retreatId, paId)));
}

export async function getPartialAttendanceByStudentKey(retreatId: string, studentKey: string): Promise<PartialAttendance | null> {
  const snap = await get(ref(db, paths.partialAttendance(retreatId, studentKey)));
  if (!snap.exists()) return null;
  const data = snap.val() as Omit<PartialAttendance, "id">;
  if (data.type !== "선복귀" && data.type !== "후발대") return null;
  return { id: studentKey, ...data };
}

// ── Cancellations ─────────────────────────────────────────
// 🔒 민감(환불계좌 등) — retreatsPrivate/{id}/cancellations 에 저장.
//    이가드 멤버가 retreats/{id} 전체를 읽으므로, 민감 노드는 형제 트리로 분리한다.

export async function getCancellations(retreatId: string): Promise<Cancellation[]> {
  const snap = await get(ref(db, paths.cancellations(retreatId)));
  return snapToList<Cancellation>(snap);
}

export async function saveCancellation(retreatId: string, data: Omit<Cancellation, "id">): Promise<string> {
  const newRef = push(ref(db, paths.cancellations(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateCancellation(retreatId: string, cId: string, data: Partial<Cancellation>): Promise<void> {
  await update(ref(db, paths.cancellation(retreatId, cId)), stripUndefined(data));
}

export async function deleteCancellation(retreatId: string, cId: string): Promise<void> {
  await remove(ref(db, paths.cancellation(retreatId, cId)));
}

export async function getCancellationByStudentKey(retreatId: string, studentKey: string): Promise<Cancellation | null> {
  const q = query(
    ref(db, paths.cancellations(retreatId)),
    orderByChild("studentKey"),
    equalTo(studentKey),
  );
  const snap = await get(q);
  if (!snap.exists()) return null;
  const [id, data] = Object.entries(snap.val())[0];
  return { id, ...(data as object) } as Cancellation;
}

// ── Supplies ──────────────────────────────────────────────

export async function getSupplies(retreatId: string): Promise<SupplyItem[]> {
  const snap = await get(ref(db, paths.supplies(retreatId)));
  return snapToList<SupplyItem>(snap);
}

export async function saveSupply(retreatId: string, data: Omit<SupplyItem, "id">): Promise<string> {
  const newRef = push(ref(db, paths.supplies(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateSupply(retreatId: string, sId: string, data: Partial<SupplyItem>): Promise<void> {
  await update(ref(db, paths.supply(retreatId, sId)), stripUndefined(data));
}

export async function deleteSupply(retreatId: string, sId: string): Promise<void> {
  await remove(ref(db, paths.supply(retreatId, sId)));
}

// ── Admin Supplies (행정물품 체크리스트) ────────────────────

export async function getAdminSupplies(retreatId: string): Promise<AdminSupplyItem[]> {
  const snap = await get(ref(db, paths.adminSupplies(retreatId)));
  return snapToList<AdminSupplyItem>(snap);
}

export async function saveAdminSupply(retreatId: string, data: Omit<AdminSupplyItem, "id">): Promise<string> {
  const newRef = push(ref(db, paths.adminSupplies(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateAdminSupply(retreatId: string, sId: string, data: Partial<AdminSupplyItem>): Promise<void> {
  await update(ref(db, paths.adminSupply(retreatId, sId)), stripUndefined(data));
}

export async function deleteAdminSupply(retreatId: string, sId: string): Promise<void> {
  await remove(ref(db, paths.adminSupply(retreatId, sId)));
}

// ── Snacks ────────────────────────────────────────────────

export async function getSnacks(retreatId: string): Promise<SnackItem[]> {
  const snap = await get(ref(db, paths.snacks(retreatId)));
  return snapToList<SnackItem>(snap);
}

export async function saveSnack(retreatId: string, data: Omit<SnackItem, "id">): Promise<string> {
  const newRef = push(ref(db, paths.snacks(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateSnack(retreatId: string, sId: string, data: Partial<SnackItem>): Promise<void> {
  await update(ref(db, paths.snack(retreatId, sId)), stripUndefined(data));
}

export async function deleteSnack(retreatId: string, sId: string): Promise<void> {
  await remove(ref(db, paths.snack(retreatId, sId)));
}

// ── Supplies Budget ───────────────────────────────────────

export async function getSuppliesBudget(retreatId: string): Promise<SuppliesBudget | null> {
  const snap = await get(ref(db, paths.suppliesBudget(retreatId)));
  if (!snap.exists()) return null;
  return snap.val() as SuppliesBudget;
}

export async function updateSuppliesBudget(retreatId: string, data: SuppliesBudget): Promise<void> {
  await set(ref(db, paths.suppliesBudget(retreatId)), data);
}

// ── Meal Count (식수 계산) ────────────────────────────────

export async function getMealCount(retreatId: string): Promise<MealCountData | null> {
  const snap = await get(ref(db, paths.mealCount(retreatId)));
  if (!snap.exists()) return null;
  return snap.val() as MealCountData;
}

export async function saveMealCount(retreatId: string, data: MealCountData): Promise<void> {
  await set(ref(db, paths.mealCount(retreatId)), stripUndefined({ ...data, updatedAt: Date.now() }));
}

// ── Brainstorm (브레인스토밍 보드 — 전역 공유, 수련회 무관) ──

export function subscribeToBrainstormNotes(callback: (notes: BrainstormNote[]) => void) {
  const r = ref(db, paths.brainstorm());
  return onValue(r, (snap) => callback(snapToList<BrainstormNote>(snap)));
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

// ── Real-time listeners ───────────────────────────────────

export function subscribeToGroups(retreatId: string, callback: (groups: Group[]) => void) {
  const r = ref(db, paths.groups(retreatId));
  return onValue(r, (snap) => callback(snapToList<Group>(snap)));
}

export function subscribeToRooms(retreatId: string, callback: (rooms: Room[]) => void) {
  const r = ref(db, paths.rooms(retreatId));
  return onValue(r, (snap) => callback(snapToList<Room>(snap)));
}

export function subscribeToRetreat(id: string, callback: (retreat: Retreat | null) => void) {
  const r = ref(db, paths.retreat(id));
  return onValue(r, (snap) => callback(snap.exists() ? { id, ...snap.val() } : null));
}

// ── On-Site Registration ──────────────────────────────────

export function subscribeToOnSiteReg(
  retreatId: string,
  callback: (reg: Record<string, OnSiteEntry>) => void
): () => void {
  const r = ref(db, paths.onSiteReg(retreatId));
  return onValue(r, (snap) => callback(snap.exists() ? snap.val() : {}));
}

/** 기존 신청자 체크인 토글 (key = participant key, e.g. "p_0") */
export async function registerOnSite(retreatId: string, key: string, entry: OnSiteEntry): Promise<void> {
  await set(ref(db, paths.onSiteRegEntry(retreatId, key)), stripUndefined(entry));
}

export async function unregisterOnSite(retreatId: string, key: string): Promise<void> {
  await remove(ref(db, paths.onSiteRegEntry(retreatId, key)));
}

/**
 * 체크인 상태를 원자적으로 토글 (race condition 방지)
 * 여러 스태프가 거의 동시에 같은 학생을 누를 때 마지막 쓰기가 이전 쓰기를 덮어쓰는
 * lost-update를 막기 위해 Firebase 트랜잭션으로 "현재 서버 값 기준" 토글 처리.
 *
 * 반환값: 트랜잭션 적용 후 최종 등록 여부 (true = 등록됨, false = 해제됨)
 * isOnSite=true(현장추가)인 항목은 토글 대상이 아니므로 변경하지 않고 그대로 둠.
 */
export async function toggleOnSiteCheckIn(
  retreatId: string,
  key: string,
  buildEntry: () => OnSiteEntry
): Promise<boolean> {
  const r = ref(db, paths.onSiteRegEntry(retreatId, key));
  const result = await runTransaction(r, (current: OnSiteEntry | null) => {
    if (current && current.isOnSite) return current; // 현장추가 항목은 건드리지 않음
    if (current && !current.isOnSite) return null;   // 이미 등록됨 → 해제
    return buildEntry();                              // 미등록 → 등록
  });
  const finalVal = result.snapshot.val() as OnSiteEntry | null;
  return !!(finalVal && !finalVal.isOnSite);
}

/** Firebase 연결 상태 구독 (".info/connected") — 오프라인 안내 배너용 */
export function subscribeToConnection(callback: (connected: boolean) => void): () => void {
  const r = ref(db, ".info/connected");
  return onValue(r, (snap) => callback(snap.val() === true));
}

/** 현장 추가 등록 (push key 자동 생성) */
export async function addWalkIn(retreatId: string, entry: Omit<OnSiteEntry, "isOnSite">): Promise<string> {
  const newRef = push(ref(db, paths.onSiteReg(retreatId)));
  await set(newRef, stripUndefined({ ...entry, isOnSite: true }));
  return newRef.key!;
}

// ── 입금 미매칭 ──────────────────────────────────────────────

export function subscribeToUnmatchedPayments(
  retreatId: string,
  cb: (list: UnmatchedPayment[]) => void
) {
  const r = ref(db, paths.unmatchedPayments(retreatId));
  return onValue(r, snap => {
    cb(snapToList<UnmatchedPayment>(snap).sort((a, b) => b.createdAt - a.createdAt));
  });
}

export async function addUnmatchedPayment(
  retreatId: string,
  data: Omit<UnmatchedPayment, "id">
): Promise<string> {
  const newRef = push(ref(db, paths.unmatchedPayments(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function resolveUnmatchedPayment(
  retreatId: string,
  paymentId: string,
  fields: Partial<UnmatchedPayment>,
  paidCellKey?: string
): Promise<void> {
  const resolved = stripUndefined({
    ...fields,
    resolvedAt: new Date().toISOString(),
  });

  if (paidCellKey) {
    // unmatchedPayments(민감)는 retreatsPrivate, cellColors는 retreats — 루트 멀티패스로 동시 갱신
    const payload: Record<string, unknown> = {};
    Object.entries(resolved).forEach(([key, value]) => {
      payload[`${paths.unmatchedPayment(retreatId, paymentId)}/${key}`] = value;
    });
    payload[paths.cellColor(retreatId, paidCellKey)] = "blue";
    await update(ref(db), payload);
    return;
  }

  await update(ref(db, paths.unmatchedPayment(retreatId, paymentId)), resolved);
}

export async function unresolveUnmatchedPayment(
  retreatId: string,
  paymentId: string,
  paidCellKey?: string
): Promise<void> {
  const fields = {
    resolvedStudentKey: null,
    resolvedStudentName: null,
    resolvedStudentGrade: null,
    resolvedStudentClass: null,
    resolvedStudentId: null,
    resolvedAt: null,
  };

  if (paidCellKey) {
    // 연결 시 markPaid로 cellColors를 "blue"로 세팅했다면, 해제 시 그 표시도 함께 지운다.
    // (unmatchedPayments는 retreatsPrivate, cellColors는 retreats — 루트 멀티패스로 동시 갱신)
    const payload: Record<string, unknown> = {};
    Object.entries(fields).forEach(([key, value]) => {
      payload[`${paths.unmatchedPayment(retreatId, paymentId)}/${key}`] = value;
    });
    payload[paths.cellColor(retreatId, paidCellKey)] = null;
    await update(ref(db), payload);
    return;
  }

  await update(ref(db, paths.unmatchedPayment(retreatId, paymentId)), fields);
}

export async function deleteUnmatchedPayment(
  retreatId: string,
  paymentId: string
): Promise<void> {
  await remove(ref(db, paths.unmatchedPayment(retreatId, paymentId)));
}

export async function updateUnmatchedPayment(
  retreatId: string,
  paymentId: string,
  fields: Partial<Pick<UnmatchedPayment, "payerName" | "note">>
): Promise<void> {
  await update(ref(db, paths.unmatchedPayment(retreatId, paymentId)), stripUndefined(fields));
}

// ── 단체티 신청 ────────────────────────────────────────────

export function subscribeToTshirtOrders(
  retreatId: string,
  cb: (orders: TshirtOrder[]) => void
): () => void {
  const r = ref(db, paths.tshirtOrders(retreatId));
  return onValue(r, snap => {
    const orders = snapToList<TshirtOrder>(snap);
    orders.sort((a, b) =>
      a.bu.localeCompare(b.bu) ||
      a.grade - b.grade ||
      a.class - b.class ||
      a.name.localeCompare(b.name, "ko")
    );
    cb(orders);
  });
}

export async function addTshirtOrder(
  retreatId: string,
  data: Omit<TshirtOrder, "id">
): Promise<string> {
  const newRef = push(ref(db, paths.tshirtOrders(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateTshirtOrder(
  retreatId: string,
  orderId: string,
  data: Partial<Omit<TshirtOrder, "note">> & { note?: string | null }
): Promise<void> {
  await update(ref(db, paths.tshirtOrder(retreatId, orderId)), stripUndefined(data));
}

export async function deleteTshirtOrder(
  retreatId: string,
  orderId: string
): Promise<void> {
  await remove(ref(db, paths.tshirtOrder(retreatId, orderId)));
}

/** 시트에서 불러온 데이터로 sheet-source 항목만 교체, manual 항목은 유지
 *  단일 multi-path update로 원자적 처리 (중간 실패 시 데이터 유실 없음) */
export async function replaceSheetTshirtOrders(
  retreatId: string,
  orders: Omit<TshirtOrder, "id">[]
): Promise<void> {
  const basePath = paths.tshirtOrders(retreatId);
  const snap = await get(ref(db, basePath));

  // null = Firebase에서 해당 키 삭제, 신규 데이터 = 추가
  const payload: Record<string, Omit<TshirtOrder, "id"> | null> = {};

  // 기존 sheet-source 항목 삭제 마킹
  if (snap.exists()) {
    Object.entries(snap.val()).forEach(([id, data]) => {
      if ((data as TshirtOrder).source === "sheet") {
        payload[`${basePath}/${id}`] = null;
      }
    });
  }

  // 새 항목 추가 마킹 (push().key는 네트워크 없이 로컬에서 키 생성)
  orders.forEach(o => {
    const newKey = push(ref(db, basePath)).key!;
    payload[`${basePath}/${newKey}`] = stripUndefined(o);
  });

  // 한 번의 update()로 원자적 실행
  await update(ref(db), stripUndefined(payload));
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

export function subscribeToMilestones(callback: (milestones: Milestone[]) => void): () => void {
  const r = ref(db, GLOBAL_MILESTONES_PATH);
  return onValue(
    r,
    (snap) => callback(snapToList<Milestone>(snap)),
    (error) => {
      console.warn(`Failed to subscribe ${GLOBAL_MILESTONES_PATH}:`, error);
      callback([]);
    }
  );
}

// ── RetreatPeriods ────────────────────────────────────────

export function subscribeToRetreatPeriods(retreatId: string, callback: (periods: RetreatPeriod[]) => void): () => void {
  const r = ref(db, retreatSharedSchedulePaths.periods(retreatId));
  return onValue(r, (snap) => callback(snapToList<RetreatPeriod>(snap).sort((a, b) => a.startDate.localeCompare(b.startDate))));
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
  callback: (periods: RetreatPeriodWithOwner[]) => void
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
    })
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

// ── MedicalLog ────────────────────────────────────────────

export function subscribeToMedicalLogs(retreatId: string, callback: (logs: MedicalLog[]) => void): () => void {
  const r = ref(db, paths.medicalLogs(retreatId));
  return onValue(r, (snap) => callback(snapToList<MedicalLog>(snap).sort((a, b) => b.createdAt - a.createdAt)));
}

function stripUndefined<T>(value: T): T {
  return stripUndefinedValue(value) as T;
}

function stripUndefinedValue(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map(item => {
      const cleaned = stripUndefinedValue(item);
      return cleaned === undefined ? null : cleaned;
    });
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([key, nested]) => [key, stripUndefinedValue(nested)] as const)
        .filter(([, nested]) => nested !== undefined)
    );
  }
  return value;
}

export async function saveMedicalLog(retreatId: string, data: Omit<MedicalLog, "id">): Promise<string> {
  const newRef = push(ref(db, paths.medicalLogs(retreatId)));
  await set(newRef, stripUndefined(data));
  return newRef.key!;
}

export async function updateMedicalLog(retreatId: string, id: string, data: Partial<Omit<MedicalLog, "id">>): Promise<void> {
  await update(ref(db, paths.medicalLog(retreatId, id)), stripUndefined(data));
}

export async function deleteMedicalLog(retreatId: string, id: string): Promise<void> {
  await remove(ref(db, paths.medicalLog(retreatId, id)));
}

// ── 교사/스탭 주민등록번호 ─────────────────────────────────
// 🔒 민감 — retreatsPrivate/{id}/teacherIdNumbers/{teacherId}. teachers 노드에 두면 이가드가 읽으므로 분리.
export async function getTeacherIdNumbers(retreatId: string): Promise<Record<string, string>> {
  const snap = await get(ref(db, paths.teacherIdNumbers(retreatId)));
  return snap.exists() ? (snap.val() as Record<string, string>) : {};
}

export async function updateTeacherIdNumber(retreatId: string, teacherId: string, idNumber: string): Promise<void> {
  const path = paths.teacherIdNumber(retreatId, teacherId);
  if (idNumber.trim()) {
    await set(ref(db, path), idNumber.trim());
  } else {
    await remove(ref(db, path));
  }
}

// ── Medicine Presets ──────────────────────────────────────

const DEFAULT_MEDICINE_PRESETS = ["타이레놀", "이부프로펜", "소화제", "지사제", "밴드/연고", "멀미약", "두통약"];

export async function getMedicinePresets(retreatId: string): Promise<string[]> {
  const snap = await get(ref(db, paths.medicinePresets(retreatId)));
  if (!snap.exists()) return DEFAULT_MEDICINE_PRESETS;
  const val = snap.val();
  return Array.isArray(val) ? val : DEFAULT_MEDICINE_PRESETS;
}

export async function saveMedicinePresets(retreatId: string, items: string[]): Promise<void> {
  await set(ref(db, paths.medicinePresets(retreatId)), stripUndefined(items));
}
