import type { NewFriend, NewFriendPrivate } from "@/features/semester/types";

export type SundayNewFriend = NewFriend & { storageSid: string };

export type SundayAdminChange = {
  id: string;
  year: string;
  changedAt: string;
  changedAtMs: number;
  classKey: string;
  teacher: string;
  studentId?: string;
  personId?: string;
  studentName: string;
  action: string;
  changeSummary: string;
  result: string;
  actor: string;
};

type PublicWorkspaceNode = Record<string, { newFriends?: Record<string, Omit<NewFriend, "id">> }>;
type PrivateWorkspaceNode = Record<string, { newFriendsPrivate?: Record<string, NewFriendPrivate> }>;

export function sundayWorkspaceId(year: number) {
  return `${year}-sunday`;
}

export function sundayFriendKey(storageSid: string, friendId: string) {
  return `${storageSid}:${friendId}`;
}

export function sundayStorageIds(semesterIds: string[], currentYear: number) {
  const years = new Set([String(currentYear)]);
  semesterIds.forEach((id) => {
    const year = id.match(/^\d{4}/)?.[0];
    if (year) years.add(year);
  });
  return [...new Set([
    ...semesterIds,
    ...[...years].map((year) => sundayWorkspaceId(Number(year))),
  ])].sort();
}

export function collectSundayNewFriends(value: unknown): SundayNewFriend[] {
  if (!value || typeof value !== "object") return [];
  const workspaces = value as PublicWorkspaceNode;
  return Object.entries(workspaces)
    .flatMap(([storageSid, workspace]) => Object.entries(workspace?.newFriends ?? {}).map(([id, friend]) => ({
      id,
      ...friend,
      storageSid,
    })))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function collectSundayNewFriendsPrivate(value: unknown): Record<string, NewFriendPrivate> {
  if (!value || typeof value !== "object") return {};
  const workspaces = value as PrivateWorkspaceNode;
  return Object.fromEntries(Object.entries(workspaces).flatMap(([storageSid, workspace]) =>
    Object.entries(workspace?.newFriendsPrivate ?? {}).map(([friendId, privateValue]) => [
      sundayFriendKey(storageSid, friendId),
      privateValue,
    ]),
  ));
}

export function privateValueForSundayFriend(
  privateMap: Record<string, NewFriendPrivate>,
  friend: SundayNewFriend,
) {
  return privateMap[sundayFriendKey(friend.storageSid, friend.id)];
}

export function collectSundayAdminChanges(value: unknown): SundayAdminChange[] {
  if (!value || typeof value !== "object") return [];
  const result: SundayAdminChange[] = [];
  for (const [year, classes] of Object.entries(value as Record<string, unknown>)) {
    if (!classes || typeof classes !== "object") continue;
    for (const [classKey, classValue] of Object.entries(classes as Record<string, unknown>)) {
      if (!classValue || typeof classValue !== "object") continue;
      const changes = (classValue as { adminChanges?: unknown }).adminChanges;
      if (!changes || typeof changes !== "object") continue;
      for (const [id, raw] of Object.entries(changes as Record<string, unknown>)) {
        if (!raw || typeof raw !== "object") continue;
        const change = raw as Partial<Omit<SundayAdminChange, "id" | "year">>;
        if (!change.changedAt || !change.studentName || !change.changeSummary) continue;
        result.push({
          id,
          year,
          changedAt: change.changedAt,
          changedAtMs: Number(change.changedAtMs) || new Date(change.changedAt).getTime() || 0,
          classKey: change.classKey || classKey,
          teacher: change.teacher || "미배정",
          ...(change.studentId ? { studentId: change.studentId } : {}),
          ...(change.personId ? { personId: change.personId } : {}),
          studentName: change.studentName,
          action: change.action || "학생 정보 수정",
          changeSummary: change.changeSummary,
          result: change.result || "반영 완료",
          actor: change.actor || "출석부 관리자",
        });
      }
    }
  }
  return result.sort((a, b) => b.changedAtMs - a.changedAtMs);
}
