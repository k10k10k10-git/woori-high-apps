import { ref, get, set, update, push, remove, onValue } from "firebase/database";
import { db } from "../firebase";
import { Participant, SyncDuplicateGroup } from "../types";
import { paths } from "../paths";
import { snapToList, stripUndefined, backupNodeBeforeOverwrite } from "./core";

// ── Participants ───────────────────────────────────────────

/**
 * ⚠ participants 노드 **전체 덮어쓰기**. 시트 동기화·중복 신청 선택처럼 전체 재생성이
 * 불가피한 경로에서만 쓴다(단일 필드는 `updateParticipant`/`updateParticipantExtra`).
 *
 * 저장 직전 롤링 백업을 **함수 안에서** 강제한다 — groups/rooms와 같은 규칙(CLAUDE.md 패턴 3b).
 * 예전에는 호출부가 `backupParticipants()`를 따로 불러야 했는데, 이가드까지 읽는
 * 2순위 꼬임 경로(DB_OWNERSHIP.md)를 호출부 규약에만 맡기면 새 호출부 하나가
 * 백업 없이 전체를 날릴 수 있다. 최근 백업이 있으면 스로틀이 중복 쓰기를 막는다.
 */
export async function saveParticipants(
  retreatId: string,
  participants: Record<string, Participant>
): Promise<void> {
  await backupNodeBeforeOverwrite(
    paths.participants(retreatId),
    paths.participantsBackups(retreatId),
  );
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

/**
 * 백업 시점으로 되돌린다. 복구 자체가 현재 상태를 덮으므로, 잘못된 시점을 골랐을 때
 * 다시 돌아올 수 있도록 **스로틀을 무시한 강제 백업** 후에만 실행한다(groups/rooms와 동일).
 * 백업에 실패하면 복구하지 않는다 — 되돌릴 수 없는 덮어쓰기를 막는 것이 우선이다.
 */
export async function restoreParticipantsBackup(retreatId: string, backupKey: string): Promise<void> {
  const snap = await get(ref(db, paths.participantsBackup(retreatId, backupKey)));
  if (!snap.exists()) throw new Error("백업을 찾을 수 없습니다.");
  const backedUp = await backupNodeBeforeOverwrite(
    paths.participants(retreatId),
    paths.participantsBackups(retreatId),
    0,
  );
  if (!backedUp) throw new Error("현재 상태 백업에 실패해 복구를 중단했습니다.");
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
