import { ref, get, set, remove } from "firebase/database";
import { db } from "../firebase";
import { paths } from "../paths";
import { stripUndefined } from "./core";

export interface RetreatAdminMember {
  email: string;
  name?: string;
  approvedAt?: number;
}

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
