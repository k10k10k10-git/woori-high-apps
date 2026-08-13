import { ref, get, onValue, set, remove } from "firebase/database";
import { db } from "../firebase";
import { paths } from "../paths";
import { stripUndefined } from "./core";
import {
  isAdminSideRole, isRetreatRole, isSemesterRole,
  type AdminSideRole, type MinistryRoles, type RetreatRole, type SemesterRole,
} from "@/features/portal/accessPolicy";

export interface RetreatAdminMember {
  email: string;
  name?: string;
  approvedAt?: number;
  /** 교역자·팀장·행정팀 구분. 없으면 행정팀(레거시)으로 간주한다. */
  role?: AdminSideRole;
  /** 두 축 역할 — 없으면 role에서 파생한다(resolveMinistryRoles) */
  semesterRole?: SemesterRole;
  retreatRole?: RetreatRole;
}

function normalizeRetreatAdminMember(value: unknown): RetreatAdminMember {
  if (typeof value === "string") return { email: value };
  if (value && typeof value === "object") {
    const data = value as Partial<RetreatAdminMember>;
    return {
      email: data.email ?? "",
      ...(data.name ? { name: data.name } : {}),
      ...(data.approvedAt ? { approvedAt: data.approvedAt } : {}),
      ...(isAdminSideRole(data.role) ? { role: data.role } : {}),
      ...(isSemesterRole(data.semesterRole) ? { semesterRole: data.semesterRole } : {}),
      ...(isRetreatRole(data.retreatRole) ? { retreatRole: data.retreatRole } : {}),
    };
  }
  return { email: "" };
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

export function subscribeToRetreatAdmins(
  callback: (admins: Record<string, RetreatAdminMember>) => void,
  onError?: (error: Error) => void,
) {
  return onValue(ref(db, paths.retreatAdmins()), (snap) => callback(snap.exists()
    ? Object.fromEntries(Object.entries(snap.val()).map(([uid, value]) => [uid, normalizeRetreatAdminMember(value)]))
    : {}), onError);
}

export async function addRetreatAdmin(
  uid: string,
  email: string,
  name?: string,
  role: AdminSideRole = "adminTeam",
  roles?: MinistryRoles,
): Promise<void> {
  await set(ref(db, paths.retreatAdmin(uid)), stripUndefined({
    email,
    name: name?.trim() || undefined,
    approvedAt: Date.now(),
    role,
    semesterRole: roles?.semester,
    retreatRole: roles?.retreat,
  }));
}

export async function updateRetreatAdminMemberName(uid: string, member: RetreatAdminMember, name: string): Promise<void> {
  // ⚠ 노드 전체를 set으로 덮어쓴다 — 두 축 역할을 함께 넣지 않으면 이름만 고쳐도 역할이 지워진다.
  await set(ref(db, paths.retreatAdmin(uid)), stripUndefined({
    email: member.email,
    name: name.trim() || undefined,
    approvedAt: member.approvedAt ?? Date.now(),
    role: member.role ?? "adminTeam",
    semesterRole: member.semesterRole,
    retreatRole: member.retreatRole,
  }));
}

export async function removeRetreatAdmin(uid: string): Promise<void> {
  await remove(ref(db, paths.retreatAdmin(uid)));
}

// ── 통합관리자 (admins/{uid}) ──────────────────────────────
// admins는 시스템 최상위 권한이다. 통합관리자만 쓸 수 있고(Rules), 화면에서도
// canManageRolesOf(role)이 참일 때만 이 함수를 호출한다.

export async function setMainAdmin(uid: string, enabled: boolean): Promise<void> {
  if (enabled) await set(ref(db, paths.admins(uid)), true);
  else await remove(ref(db, paths.admins(uid)));
}

export async function getMainAdmins(): Promise<Record<string, boolean>> {
  const snap = await get(ref(db, paths.mainAdmins()));
  return snap.exists() ? snap.val() : {};
}

export function subscribeToMainAdmins(callback: (admins: Record<string, boolean>) => void, onError?: (error: Error) => void) {
  return onValue(ref(db, paths.mainAdmins()), (snap) => callback(snap.exists() ? snap.val() : {}), onError);
}

export async function requestRetreatAccess(uid: string, email: string, name: string): Promise<void> {
  await set(ref(db, paths.retreatPendingEntry(uid)), stripUndefined({ email, name, requestedAt: Date.now() }));
}

export async function getPendingRequests(): Promise<Record<string, { email: string; name: string; requestedAt: number }>> {
  const snap = await get(ref(db, paths.retreatPending()));
  return snap.exists() ? snap.val() : {};
}

export function subscribeToPendingRequests(
  callback: (requests: Record<string, { email: string; name: string; requestedAt: number }>) => void,
  onError?: (error: Error) => void,
) {
  return onValue(ref(db, paths.retreatPending()), (snap) => callback(snap.exists() ? snap.val() : {}), onError);
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
