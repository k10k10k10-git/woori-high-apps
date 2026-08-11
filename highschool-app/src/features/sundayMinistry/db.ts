import { getSemesters, subscribeNewFriends, subscribeNewFriendsPrivate } from "@/features/semester/db";
import {
  collectSundayNewFriends,
  collectSundayNewFriendsPrivate,
  sundayStorageIds,
  type SundayNewFriend,
} from "./model";
import type { NewFriendPrivate } from "@/features/semester/types";

let storageIdsPromise: Promise<string[]> | null = null;

function loadSundayStorageIds() {
  if (!storageIdsPromise) {
    storageIdsPromise = getSemesters()
      .then((semesters) => sundayStorageIds(semesters.map((semester) => semester.id), new Date().getFullYear()))
      .catch((error: unknown) => {
        storageIdsPromise = null;
        throw error;
      });
  }
  return storageIdsPromise;
}

export function subscribeSundayNewFriends(
  cb: (friends: SundayNewFriend[]) => void,
  onError?: (error: Error) => void,
) {
  let disposed = false;
  const unsubs: Array<() => void> = [];
  const valuesByStorage = new Map<string, Record<string, Omit<SundayNewFriend, "id" | "storageSid">>>();
  const loaded = new Set<string>();

  void loadSundayStorageIds().then((storageIds) => {
    if (disposed) return;
    storageIds.forEach((storageSid) => {
      unsubs.push(subscribeNewFriends(storageSid, (friends) => {
        valuesByStorage.set(storageSid, Object.fromEntries(friends.map(({ id, ...friend }) => [id, friend])));
        loaded.add(storageSid);
        if (loaded.size === storageIds.length) {
          cb(collectSundayNewFriends(Object.fromEntries(
            [...valuesByStorage].map(([sid, publicValues]) => [sid, { newFriends: publicValues }]),
          )));
        }
      }, onError));
    });
  }).catch((error: unknown) => onError?.(error instanceof Error ? error : new Error(String(error))));

  return () => {
    disposed = true;
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}

export function subscribeSundayNewFriendsPrivate(
  cb: (values: Record<string, NewFriendPrivate>) => void,
  onError?: (error: Error) => void,
) {
  let disposed = false;
  const unsubs: Array<() => void> = [];
  const valuesByStorage = new Map<string, Record<string, NewFriendPrivate>>();
  const loaded = new Set<string>();

  void loadSundayStorageIds().then((storageIds) => {
    if (disposed) return;
    storageIds.forEach((storageSid) => {
      unsubs.push(subscribeNewFriendsPrivate(storageSid, (values) => {
        valuesByStorage.set(storageSid, values);
        loaded.add(storageSid);
        if (loaded.size === storageIds.length) {
          cb(collectSundayNewFriendsPrivate(Object.fromEntries(
            [...valuesByStorage].map(([sid, privateValues]) => [sid, { newFriendsPrivate: privateValues }]),
          )));
        }
      }, onError));
    });
  }).catch((error: unknown) => onError?.(error instanceof Error ? error : new Error(String(error))));

  return () => {
    disposed = true;
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}
