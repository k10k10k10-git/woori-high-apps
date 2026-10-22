import { subscribeSemesters, subscribeNewFriends, subscribeNewFriendsPrivate } from "@/features/semester/db";
import { paths } from "@/features/semester/paths";
import { db } from "@/lib/firebase";
import { onValue, ref } from "firebase/database";
import {
  collectSundayAdminChanges,
  collectSundayNewFriends,
  collectSundayNewFriendsPrivate,
  sundayStorageIds,
  type SundayNewFriend,
  type SundayAdminChange,
} from "./model";
import type { NewFriendPrivate } from "@/features/semester/types";

export function subscribeSundayAdminChanges(
  cb: (changes: SundayAdminChange[]) => void,
  onError?: (error: Error) => void,
  year?: number,
) {
  const location = year === undefined ? paths.classes() : `${paths.classes()}/${year}`;
  return onValue(ref(db, location), (snapshot) => cb(collectSundayAdminChanges(year === undefined ? snapshot.val() : { [year]: snapshot.val() })), onError);
}

export function subscribeSundayNewFriends(
  cb: (friends: SundayNewFriend[]) => void,
  onError?: (error: Error) => void,
) {
  let disposed = false;
  const unsubs: Array<() => void> = [];
  const sourceUnsubs = new Map<string, () => void>();
  const valuesByStorage = new Map<string, Record<string, Omit<SundayNewFriend, "id" | "storageSid">>>();
  const loaded = new Set<string>();
  let currentStorageIds: string[] = [];

  const emit = () => {
    if (loaded.size !== currentStorageIds.length) return;
    cb(collectSundayNewFriends(Object.fromEntries(
      [...valuesByStorage].map(([sid, publicValues]) => [sid, { newFriends: publicValues }]),
    )));
  };

  unsubs.push(subscribeSemesters((semesters) => {
    if (disposed) return;
    currentStorageIds = sundayStorageIds(semesters.map((semester) => semester.id), new Date().getFullYear());
    const desired = new Set(currentStorageIds);
    sourceUnsubs.forEach((unsubscribe, sid) => {
      if (desired.has(sid)) return;
      unsubscribe();
      sourceUnsubs.delete(sid);
      valuesByStorage.delete(sid);
      loaded.delete(sid);
    });
    currentStorageIds.forEach((storageSid) => {
      if (sourceUnsubs.has(storageSid)) return;
      sourceUnsubs.set(storageSid, subscribeNewFriends(storageSid, (friends) => {
        valuesByStorage.set(storageSid, Object.fromEntries(friends.map(({ id, ...friend }) => [id, friend])));
        loaded.add(storageSid);
        emit();
      }, onError));
    });
    emit();
  }, onError));

  return () => {
    disposed = true;
    unsubs.forEach((unsubscribe) => unsubscribe());
    sourceUnsubs.forEach((unsubscribe) => unsubscribe());
  };
}

export function subscribeSundayNewFriendsPrivate(
  cb: (values: Record<string, NewFriendPrivate>) => void,
  onError?: (error: Error) => void,
) {
  let disposed = false;
  const unsubs: Array<() => void> = [];
  const sourceUnsubs = new Map<string, () => void>();
  const valuesByStorage = new Map<string, Record<string, NewFriendPrivate>>();
  const loaded = new Set<string>();
  let currentStorageIds: string[] = [];

  const emit = () => {
    if (loaded.size !== currentStorageIds.length) return;
    cb(collectSundayNewFriendsPrivate(Object.fromEntries(
      [...valuesByStorage].map(([sid, privateValues]) => [sid, { newFriendsPrivate: privateValues }]),
    )));
  };

  unsubs.push(subscribeSemesters((semesters) => {
    if (disposed) return;
    currentStorageIds = sundayStorageIds(semesters.map((semester) => semester.id), new Date().getFullYear());
    const desired = new Set(currentStorageIds);
    sourceUnsubs.forEach((unsubscribe, sid) => {
      if (desired.has(sid)) return;
      unsubscribe();
      sourceUnsubs.delete(sid);
      valuesByStorage.delete(sid);
      loaded.delete(sid);
    });
    currentStorageIds.forEach((storageSid) => {
      if (sourceUnsubs.has(storageSid)) return;
      sourceUnsubs.set(storageSid, subscribeNewFriendsPrivate(storageSid, (values) => {
        valuesByStorage.set(storageSid, values);
        loaded.add(storageSid);
        emit();
      }, onError));
    });
    emit();
  }, onError));

  return () => {
    disposed = true;
    unsubs.forEach((unsubscribe) => unsubscribe());
    sourceUnsubs.forEach((unsubscribe) => unsubscribe());
  };
}
