import { get, onValue, push, ref, set, update } from "firebase/database";
import { db } from "./firebase";
import { paths } from "./paths";
import { buildStaffMoveUpdates } from "./staffMove";
import type { AttValue, UserRole } from "@/types";

type ErrorHandler = (error: Error) => void;

export function subscribeClasses(year: number, callback: (value: unknown) => void, onError?: ErrorHandler) {
  return onValue(ref(db, paths.classes(year)), (snap) => callback(snap.exists() ? snap.val() : {}), onError);
}

export function subscribeStaffMembers(year: number, team: string, callback: (value: unknown) => void, onError?: ErrorHandler) {
  return onValue(ref(db, paths.staffMembers(year, team)), (snap) => callback(snap.exists() ? snap.val() : {}), onError);
}

export function subscribeStaffAttendance(year: number, callback: (value: unknown) => void, onError?: ErrorHandler) {
  return onValue(ref(db, paths.staffAttendance(year)), (snap) => callback(snap.exists() ? snap.val() : {}), onError);
}

export function subscribeStaffEvents(year: number, callback: (value: unknown) => void, onError?: ErrorHandler) {
  return onValue(ref(db, paths.staffEvents(year)), (snap) => callback(snap.exists() ? snap.val() : {}), onError);
}

export async function getUserRole(key: string): Promise<UserRole | null> {
  const snap = await get(ref(db, paths.staffRole(key)));
  return snap.exists() ? snap.val() as UserRole : null;
}

export async function markStaffAdmin(uid: string): Promise<void> {
  await set(ref(db, paths.staffAdmin(uid)), true);
}

export async function getAllUserRoles(): Promise<Record<string, UserRole & { email?: string }>> {
  const snap = await get(ref(db, paths.staffRoles()));
  return snap.exists() ? snap.val() : {};
}

export async function saveUserRole(key: string, role: UserRole & { email?: string }): Promise<void> {
  await set(ref(db, paths.staffRole(key)), role);
}

export async function deleteUserRole(key: string): Promise<void> {
  await set(ref(db, paths.staffRole(key)), null);
}

export async function saveStaffEvent(year: number, id: string, value: { month: string; day: string; label: string }): Promise<void> {
  await set(ref(db, paths.staffEvent(year, id)), value);
}

export async function deleteStaffEvent(year: number, id: string): Promise<void> {
  await set(ref(db, paths.staffEvent(year, id)), null);
}

export async function saveAttendance(year: number, team: string, memberId: string, cellKey: string, value: AttValue): Promise<void> {
  await set(ref(db, paths.staffAttendanceCell(year, team, memberId, cellKey)), value || null);
}

export async function addStaffMember(year: number, team: string, name: string, phone: string, maxNum: number): Promise<void> {
  await push(ref(db, paths.staffMembers(year, team)), {
    name: name.trim(),
    phone: phone.trim() || null,
    num: maxNum + 1,
  });
}

export async function updateStaffMember(year: number, team: string, id: string, name: string, phone: string, num: number): Promise<void> {
  await set(ref(db, paths.staffMember(year, team, id)), {
    name: name.trim(),
    phone: phone.trim() || null,
    num,
  });
}

export async function deleteStaffMember(year: number, team: string, id: string): Promise<void> {
  await update(ref(db), {
    [paths.staffMember(year, team, id)]: null,
    [paths.staffMemberAttendance(year, team, id)]: null,
  });
}

export async function moveStaffMemberToTeam(
  year: number,
  fromTeam: string,
  toTeam: string,
  id: string,
  name: string,
  phone: string,
  toTeamMemberCount: number,
): Promise<void> {
  const attSnap = await get(ref(db, paths.staffMemberAttendance(year, fromTeam, id)));
  await update(ref(db), buildStaffMoveUpdates(
    year,
    fromTeam,
    toTeam,
    id,
    { name, phone, toTeamMemberCount },
    attSnap.exists() ? attSnap.val() : null,
  ));
}

export async function swapStaffOrder(
  year: number,
  team: string,
  id1: string,
  num1: number | undefined,
  id2: string,
  num2: number | undefined,
): Promise<void> {
  await update(ref(db), {
    [paths.staffMemberOrder(year, team, id1)]: num2 ?? null,
    [paths.staffMemberOrder(year, team, id2)]: num1 ?? null,
  });
}
