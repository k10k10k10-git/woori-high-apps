import { get, onValue, ref } from "firebase/database";
import { auditedSet as set } from "@/features/activityLog/write";
import type { RoomAutoAssignConfigData, RoomAutoAssignSettings } from "../roomAutoAssignConfig";
import { normalizeRoomAutoAssignConfig } from "../roomAutoAssignConfig";
import { db } from "../firebase";
import { paths } from "../paths";
import { stripUndefined } from "./core";

export async function getRoomAutoAssignConfig(retreatId: string): Promise<RoomAutoAssignConfigData | null> {
  const snap = await get(ref(db, paths.roomAutoAssignConfig(retreatId)));
  return snap.exists() ? normalizeRoomAutoAssignConfig(snap.val()) : null;
}

export function subscribeToRoomAutoAssignConfig(
  retreatId: string,
  callback: (config: RoomAutoAssignConfigData | null) => void,
  onError?: (error: Error) => void,
) {
  return onValue(ref(db, paths.roomAutoAssignConfig(retreatId)), (snap) => {
    callback(snap.exists() ? normalizeRoomAutoAssignConfig(snap.val()) : null);
  }, onError);
}

/** 방배정 입력 설정은 결과 노드와 분리된 하나의 원자적 문서로 명시 저장한다. */
export async function saveRoomAutoAssignConfig(retreatId: string, settings: RoomAutoAssignSettings): Promise<void> {
  await set(ref(db, paths.roomAutoAssignConfig(retreatId)), stripUndefined({
    ...settings,
    version: 1,
    updatedAt: Date.now(),
  }));
}
