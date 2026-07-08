import { ref, get, set, update, push, remove, onValue } from "firebase/database";
import { db } from "../firebase";
import { Participant, SyncDuplicateGroup } from "../types";
import { paths } from "../paths";
import { snapToList, stripUndefined } from "./core";

// ── Participants ───────────────────────────────────────────

export async function saveParticipants(
  retreatId: string,
  participants: Record<string, Participant>
): Promise<void> {
  await set(ref(db, paths.participants(retreatId)), stripUndefined(participants));
}

/**
 * 시트 동기화/재매칭으로 participants를 덮어쓰기 전, 현재 상태를 백업으로 저장.
 * 매칭이 잘못되어 입금완료 표시 등 수기 데이터 참조가 어긋났을 때 복구할 수 있는 안전망.
 * 최근 5개만 유지 (오래된 백업은 자동 삭제).
 */
export async function backupParticipants(retreatId: string): Promise<void> {
  const current = await getParticipants(retreatId);
  if (Object.keys(current).length === 0) return;
  const basePath = paths.participantsBackups(retreatId);
  const snap = await get(ref(db, basePath));
  const existing = snap.exists() ? Object.keys(snap.val()) : [];
  const payload: Record<string, Record<string, Participant> | null> = {};
  if (existing.length >= 5) {
    existing.sort().slice(0, existing.length - 4).forEach(k => { payload[`${basePath}/${k}`] = null; });
  }
  payload[`${basePath}/${Date.now()}`] = stripUndefined(current);
  await update(ref(db), stripUndefined(payload));
}

export async function getParticipantsBackups(retreatId: string): Promise<Record<string, Record<string, Participant>>> {
  const snap = await get(ref(db, paths.participantsBackups(retreatId)));
  return snap.exists() ? snap.val() : {};
}

export async function restoreParticipantsBackup(retreatId: string, backupKey: string): Promise<void> {
  const snap = await get(ref(db, paths.participantsBackup(retreatId, backupKey)));
  if (!snap.exists()) throw new Error("백업을 찾을 수 없습니다.");
  await set(ref(db, paths.participants(retreatId)), snap.val());
}

// ── Sync Meta (중복 신청 등 동기화 결과 저장) ─────────────
export async function saveSyncDuplicates(retreatId: string, duplicates: SyncDuplicateGroup[]): Promise<void> {
  await set(ref(db, paths.syncDuplicates(retreatId)), duplicates.length > 0 ? stripUndefined(duplicates) : null);
}
export async function getSyncDuplicates(retreatId: string): Promise<SyncDuplicateGroup[]> {
  const snap = await get(ref(db, paths.syncDuplicates(retreatId)));
  if (!snap.exists()) return [];
  const val = snap.val();
  return Array.isArray(val) ? val : Object.values(val);
}

export async function getParticipants(retreatId: string): Promise<Record<string, Participant>> {
  const snap = await get(ref(db, paths.participants(retreatId)));
  return snap.exists() ? snap.val() : {};
}

/** 특정 참가자 1명의 경로만 덮어쓰기 — 중복 신청 중 다른 항목을 선택했을 때 사용 (전체 participants 덮어쓰기 금지) */
export async function updateParticipant(retreatId: string, key: string, data: Participant): Promise<void> {
  await set(ref(db, paths.participant(retreatId, key)), stripUndefined(data));
}

/** 재매칭 전용 — studentId/phone/pPhone만 경로 지정 업데이트, extra 등 나머지 필드는 건드리지 않음 */
export async function applyRematch(
  retreatId: string,
  updates: Record<string, { studentId: string | null; phone: string | null; pPhone: string | null }>
): Promise<void> {
  const flatUpdates: Record<string, string | null> = {};
  for (const [key, upd] of Object.entries(updates)) {
    flatUpdates[`${paths.participant(retreatId, key)}/studentId`] = upd.studentId;
    flatUpdates[`${paths.participant(retreatId, key)}/phone`] = upd.phone;
    flatUpdates[`${paths.participant(retreatId, key)}/pPhone`] = upd.pPhone;
  }
  await update(ref(db), flatUpdates);
}

/** 특이사항만 경로 지정 업데이트 — 전체 participants 덮어쓰기 방지 */
export async function updateParticipantExtra(
  retreatId: string,
  key: string,
  extra: string | undefined
): Promise<void> {
  if (extra === undefined) {
    await remove(ref(db, paths.participantExtra(retreatId, key)));
  } else {
    await set(ref(db, paths.participantExtra(retreatId, key)), extra);
  }
}

export function subscribeToParticipants(retreatId: string, callback: (parts: Record<string, Participant>) => void, onError?: (error: Error) => void): () => void {
  return onValue(ref(db, paths.participants(retreatId)), (snap) => callback(snap.exists() ? snap.val() : {}),
    (error) => { console.warn("subscribeToParticipants error:", error); onError?.(error); });
}
