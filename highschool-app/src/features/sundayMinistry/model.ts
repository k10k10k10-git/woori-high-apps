import type { NewFriend, NewFriendPrivate } from "@/features/semester/types";

export type SundayNewFriend = NewFriend & { storageSid: string };

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
