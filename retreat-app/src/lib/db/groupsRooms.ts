import { ref, get, set, update, remove, onValue } from "firebase/database";
import { db } from "../firebase";
import { Group, Room } from "../types";
import { paths } from "../paths";
import { snapToList, stripUndefined, backupNodeBeforeOverwrite } from "./core";

// ── Groups ────────────────────────────────────────────────

export async function getGroups(retreatId: string): Promise<Group[]> {
  const snap = await get(ref(db, paths.groups(retreatId)));
  return snapToList<Group>(snap);
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

/** 전체 조 삭제는 스로틀을 무시한 백업이 성공한 경우에만 실행한다. */
export async function clearGroups(retreatId: string): Promise<void> {
  const backedUp = await backupNodeBeforeOverwrite(
    paths.groups(retreatId),
    paths.groupsBackups(retreatId),
    0,
  );
  if (!backedUp) throw new Error("조편성 백업에 실패하여 전체 삭제를 중단했습니다.");
  await remove(ref(db, paths.groups(retreatId)));
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
export function subscribeToIguardGroupStaff(retreatId: string, callback: (map: Record<string, string[]>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.iguardGroupStaff(retreatId)), (snap) =>
    callback(snap.exists() ? (snap.val() as Record<string, string[]>) : {}),
    (error) => { console.warn("subscribeToIguardGroupStaff error:", error); onError?.(error); });
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

/** 전체 방 삭제는 스로틀을 무시한 백업이 성공한 경우에만 실행한다. */
export async function clearRooms(retreatId: string): Promise<void> {
  const backedUp = await backupNodeBeforeOverwrite(
    paths.rooms(retreatId),
    paths.roomsBackups(retreatId),
    0,
  );
  if (!backedUp) throw new Error("방배정 백업에 실패하여 전체 삭제를 중단했습니다.");
  await remove(ref(db, paths.rooms(retreatId)));
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

export function subscribeToGroups(retreatId: string, callback: (groups: Group[]) => void, onError?: (error: Error) => void) {
  const r = ref(db, paths.groups(retreatId));
  return onValue(r, (snap) => callback(snapToList<Group>(snap)),
    (error) => { console.warn("subscribeToGroups error:", error); onError?.(error); });
}

export function subscribeToRooms(retreatId: string, callback: (rooms: Room[]) => void, onError?: (error: Error) => void) {
  const r = ref(db, paths.rooms(retreatId));
  return onValue(r, (snap) => callback(snapToList<Room>(snap)),
    (error) => { console.warn("subscribeToRooms error:", error); onError?.(error); });
}
