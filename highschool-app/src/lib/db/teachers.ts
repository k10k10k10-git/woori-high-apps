import { ref, get, push, onValue } from "@/lib/rtdb";
import { auditedSet as set, auditedUpdate as update, auditedRemove as remove } from "@/features/activityLog/write";
import { db } from "../firebase";
import { TeacherAttendance } from "../types";
import { paths } from "../paths";
import type { TeacherUpdate } from "../teacherWrite";
import { snapToList, stripUndefined } from "./core";

// ── Teacher Attendance ────────────────────────────────────

export async function getTeachers(retreatId: string): Promise<TeacherAttendance[]> {
  const snap = await get(ref(db, paths.teachers(retreatId)));
  return snapToList<TeacherAttendance>(snap);
}

export function subscribeToTeachers(retreatId: string, callback: (teachers: TeacherAttendance[]) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.teachers(retreatId)), (snap) => callback(snapToList<TeacherAttendance>(snap)),
    (error) => { console.warn("subscribeToTeachers error:", error); onError?.(error); });
}

export async function saveTeacher(retreatId: string, teacher: Omit<TeacherAttendance, "id">): Promise<string> {
  const newRef = push(ref(db, paths.teachers(retreatId)));
  await set(newRef, stripUndefined(teacher));
  return newRef.key!;
}

export async function updateTeacher(retreatId: string, teacherId: string, data: TeacherUpdate): Promise<void> {
  await update(ref(db, paths.teacher(retreatId, teacherId)), stripUndefined(data));
}

export async function deleteTeacher(retreatId: string, teacherId: string): Promise<void> {
  await remove(ref(db, paths.teacher(retreatId, teacherId)));
}

// ── 교사/스탭 주민등록번호 ─────────────────────────────────
// 🔒 민감 — retreatsPrivate/{id}/teacherIdNumbers/{teacherId}. teachers 노드에 두면 이가드가 읽으므로 분리.
export async function getTeacherIdNumbers(retreatId: string): Promise<Record<string, string>> {
  const snap = await get(ref(db, paths.teacherIdNumbers(retreatId)));
  return snap.exists() ? (snap.val() as Record<string, string>) : {};
}

export function subscribeToTeacherIdNumbers(retreatId: string, callback: (values: Record<string, string>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.teacherIdNumbers(retreatId)), (snap) => callback(snap.exists() ? snap.val() as Record<string, string> : {}), onError);
}

export async function updateTeacherIdNumber(retreatId: string, teacherId: string, idNumber: string): Promise<void> {
  const path = paths.teacherIdNumber(retreatId, teacherId);
  if (idNumber.trim()) {
    await set(ref(db, path), idNumber.trim());
  } else {
    await remove(ref(db, path));
  }
}
