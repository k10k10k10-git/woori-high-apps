import { get, onValue, ref } from "@/lib/rtdb";
import { auditedSet as set } from "@/features/activityLog/write";
import { AutoAssignConfigData, normalizeAutoAssignConfig } from "../autoAssignConfig";
import { db } from "../firebase";
import { paths } from "../paths";
import { stripUndefined } from "./core";

export async function getAutoAssignConfig(retreatId: string): Promise<AutoAssignConfigData | null> {
  const snap = await get(ref(db, paths.autoAssignConfig(retreatId)));
  return snap.exists() ? normalizeAutoAssignConfig(snap.val()) : null;
}

export function subscribeToAutoAssignConfig(
  retreatId: string,
  callback: (config: AutoAssignConfigData | null) => void,
  onError?: (error: Error) => void,
) {
  return onValue(ref(db, paths.autoAssignConfig(retreatId)), (snap) => {
    callback(snap.exists() ? normalizeAutoAssignConfig(snap.val()) : null);
  }, onError);
}

/** 설정은 한 화면의 원자적 문서이므로 명시적 저장 시 최신 상태 전체를 교체한다. */
export async function saveAutoAssignConfig(
  retreatId: string,
  data: Omit<AutoAssignConfigData, "version" | "updatedAt">,
): Promise<void> {
  await set(ref(db, paths.autoAssignConfig(retreatId)), stripUndefined({
    ...data,
    version: 1,
    updatedAt: Date.now(),
  }));
}
