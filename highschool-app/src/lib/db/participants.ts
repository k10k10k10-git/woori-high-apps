import { ref, get, onValue } from "@/lib/rtdb";
import { auditedSet as set, auditedUpdate as update, auditedRemove as remove } from "@/features/activityLog/write";
import { db } from "../firebase";
import { Participant, SyncDuplicateGroup } from "../types";
import { paths } from "../paths";
import { stripUndefined } from "./core";
import {
  mergeParticipantContacts,
  splitParticipant,
  splitParticipants,
  type ParticipantContact,
} from "../participantPrivacy";

// ── Participants ───────────────────────────────────────────

/** 공개 명단과 비공개 연락처를 반드시 같은 키로 백업해 복구 시 서로 다른 시점이 섞이지 않게 한다. */
async function backupParticipantBundle(retreatId: string, minIntervalMs = 10 * 60 * 1000): Promise<boolean> {
  try {
    const [participantsSnap, contactsSnap, backupsSnap] = await Promise.all([
      get(ref(db, paths.participants(retreatId))),
      get(ref(db, paths.participantContacts(retreatId))),
      get(ref(db, paths.participantsBackups(retreatId))),
    ]);
    if (!participantsSnap.exists() && !contactsSnap.exists()) return true;
    const existingKeys = backupsSnap.exists() ? Object.keys(backupsSnap.val()) : [];
    const now = Date.now();
    const latest = existingKeys.map(Number).filter(Number.isFinite).sort((left, right) => right - left)[0];
    if (latest && now - latest < minIntervalMs) return true;

    const payload: Record<string, unknown> = {};
    const sorted = [...existingKeys].sort();
    if (sorted.length >= 5) {
      sorted.slice(0, sorted.length - 4).forEach((key) => {
        payload[paths.participantsBackup(retreatId, key)] = null;
        payload[`${paths.participantContactsBackups(retreatId)}/${key}`] = null;
      });
    }
    if (participantsSnap.exists()) payload[paths.participantsBackup(retreatId, String(now))] = participantsSnap.val();
    payload[`${paths.participantContactsBackups(retreatId)}/${now}`] = contactsSnap.exists()
      ? contactsSnap.val()
      : { __empty: true };
    await update(ref(db), stripUndefined(payload));
    return true;
  } catch {
    return false;
  }
}

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
  if (!await backupParticipantBundle(retreatId)) {
    throw new Error("참가자 명단 백업에 실패하여 저장을 중단했습니다.");
  }
  const { publicParticipants, contacts } = splitParticipants(participants);
  await update(ref(db), stripUndefined({
    [paths.participants(retreatId)]: publicParticipants,
    [paths.participantContacts(retreatId)]: Object.keys(contacts).length > 0 ? contacts : null,
  }));
}

/**
 * 시트 동기화/재매칭으로 participants를 덮어쓰기 전, 현재 상태를 백업으로 저장.
 * 매칭이 잘못되어 입금완료 표시 등 수기 데이터 참조가 어긋났을 때 복구할 수 있는 안전망.
 * 최근 5개만 유지 (오래된 백업은 자동 삭제).
 */
export async function backupParticipants(retreatId: string): Promise<void> {
  if (!await backupParticipantBundle(retreatId)) {
    throw new Error("참가자 명단 백업에 실패하여 변경을 중단했습니다.");
  }
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
  const [snap, contactsSnap] = await Promise.all([
    get(ref(db, paths.participantsBackup(retreatId, backupKey))),
    get(ref(db, `${paths.participantContactsBackups(retreatId)}/${backupKey}`)),
  ]);
  if (!snap.exists()) throw new Error("백업을 찾을 수 없습니다.");
  const backedUp = await backupParticipantBundle(retreatId, 0);
  if (!backedUp) throw new Error("현재 상태 백업에 실패해 복구를 중단했습니다.");
  // 예전 공개 백업에 연락처가 들어 있어도 복구 시 다시 공개 경로로 되살리지 않는다.
  const { publicParticipants, contacts: legacyContacts } = splitParticipants(snap.val());
  const privateContacts = Object.fromEntries(
    Object.entries(contactsSnap.exists() ? contactsSnap.val() : {}).filter(([key]) => key !== "__empty"),
  ) as Record<string, ParticipantContact>;
  const contacts = Object.keys(privateContacts).length > 0
    ? privateContacts as Record<string, ParticipantContact>
    : legacyContacts;
  await update(ref(db), stripUndefined({
    [paths.participants(retreatId)]: publicParticipants,
    [paths.participantContacts(retreatId)]: Object.keys(contacts).length > 0 ? contacts : null,
  }));
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

export async function getParticipantContacts(retreatId: string): Promise<Record<string, ParticipantContact>> {
  const snap = await get(ref(db, paths.participantContacts(retreatId)));
  return snap.exists() ? snap.val() : {};
}

export async function getParticipantsWithContacts(retreatId: string): Promise<Record<string, Participant>> {
  const [participants, contacts] = await Promise.all([
    getParticipants(retreatId),
    getParticipantContacts(retreatId),
  ]);
  return mergeParticipantContacts(participants, contacts);
}

/** 특정 참가자 1명의 경로만 덮어쓰기 — 중복 신청 중 다른 항목을 선택했을 때 사용 (전체 participants 덮어쓰기 금지) */
export async function updateParticipant(retreatId: string, key: string, data: Participant): Promise<void> {
  const { publicValue, privateValue } = splitParticipant(data);
  await update(ref(db), stripUndefined({
    [paths.participant(retreatId, key)]: publicValue,
    [paths.participantContact(retreatId, key)]: privateValue,
  }));
}

/** 재매칭 전용 — studentId/phone/pPhone만 경로 지정 업데이트, extra 등 나머지 필드는 건드리지 않음 */
export async function applyRematch(
  retreatId: string,
  updates: Record<string, { studentId: string | null; phone: string | null; pPhone: string | null }>
): Promise<void> {
  const flatUpdates: Record<string, string | null> = {};
  for (const [key, upd] of Object.entries(updates)) {
    flatUpdates[`${paths.participant(retreatId, key)}/studentId`] = upd.studentId;
    flatUpdates[`${paths.participantContact(retreatId, key)}/phone`] = upd.phone;
    flatUpdates[`${paths.participantContact(retreatId, key)}/pPhone`] = upd.pPhone;
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

/** 행정 화면 중 연락처가 실제로 필요한 곳에서만 호출한다. 이가드 구독은 공개 명단만 유지한다. */
export function subscribeToParticipantsWithContacts(
  retreatId: string,
  callback: (parts: Record<string, Participant>) => void,
  onError?: (error: Error) => void,
): () => void {
  let participants: Record<string, Participant> = {};
  let contacts: Record<string, ParticipantContact> = {};
  let participantsReady = false;
  let contactsReady = false;
  const emit = () => {
    if (participantsReady && contactsReady) callback(mergeParticipantContacts(participants, contacts));
  };
  const publicUnsubscribe = onValue(ref(db, paths.participants(retreatId)), (snap) => {
    participants = snap.exists() ? snap.val() : {};
    participantsReady = true;
    emit();
  }, (error) => { console.warn("subscribeToParticipantsWithContacts public error:", error); onError?.(error); });
  const privateUnsubscribe = onValue(ref(db, paths.participantContacts(retreatId)), (snap) => {
    contacts = snap.exists() ? snap.val() : {};
    contactsReady = true;
    emit();
  }, (error) => { console.warn("subscribeToParticipantsWithContacts private error:", error); onError?.(error); });
  return () => { publicUnsubscribe(); privateUnsubscribe(); };
}
