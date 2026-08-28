import type { Participant, Student, SyncDuplicateGroup } from "./types";
import { findStudent } from "./studentMatcher";
import {
  buildExtraPreservationMaps,
  dedupeSheetParticipants,
  identityKeyOf,
} from "./syncParticipants";

export type ParticipantSyncSummary = {
  currentCount: number;
  sourceCount: number;
  nextCount: number;
  addedCount: number;
  removedCount: number;
  changedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  duplicateGroupCount: number;
  preservedExtraCount: number;
};

export type SheetSyncPlan = {
  kind: "sheet";
  participants: Record<string, Participant>;
  duplicates: SyncDuplicateGroup[];
  summary: ParticipantSyncSummary;
};

export type RematchUpdate = {
  studentId: string | null;
  phone: string | null;
  pPhone: string | null;
};

export type RematchPlan = {
  kind: "rematch";
  updates: Record<string, RematchUpdate>;
  students: Record<string, Student>;
  summary: ParticipantSyncSummary;
  missedNames: string[];
};

export type ParticipantBulkPlan = SheetSyncPlan | RematchPlan;

function withoutRaw(participant: Participant): Omit<Participant, "raw"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- 시트 원본은 저장 계획에서도 의도적으로 제외한다.
  const { raw: _raw, ...rest } = participant;
  return rest;
}

function stableIdentity(participant: Participant): string {
  return participant.studentId
    ? `student:${participant.studentId}`
    : `identity:${identityKeyOf(participant)}`;
}

function comparable(participant: Participant): string {
  return JSON.stringify({
    name: participant.name,
    gender: participant.gender,
    grade: participant.grade,
    class: participant.class,
    bu: participant.bu,
    studentId: participant.studentId ?? null,
    registeredAt: participant.registeredAt,
    phone: participant.phone ?? null,
    pPhone: participant.pPhone ?? null,
    extra: participant.extra ?? null,
  });
}

function summarizeReplacement(
  existing: Record<string, Participant>,
  next: Record<string, Participant>,
  sourceCount: number,
  duplicateGroupCount: number,
): ParticipantSyncSummary {
  const currentByIdentity = new Map(Object.values(existing).map((participant) => [stableIdentity(participant), participant]));
  const nextByIdentity = new Map(Object.values(next).map((participant) => [stableIdentity(participant), participant]));
  let addedCount = 0;
  let changedCount = 0;
  let preservedExtraCount = 0;

  nextByIdentity.forEach((participant, identity) => {
    const previous = currentByIdentity.get(identity);
    if (!previous) addedCount += 1;
    else if (comparable(previous) !== comparable(participant)) changedCount += 1;
    if (previous?.extra && previous.extra === participant.extra) preservedExtraCount += 1;
  });

  let removedCount = 0;
  currentByIdentity.forEach((_, identity) => {
    if (!nextByIdentity.has(identity)) removedCount += 1;
  });

  const nextValues = Object.values(next);
  const matchedCount = nextValues.filter((participant) => participant.studentId).length;
  return {
    currentCount: Object.keys(existing).length,
    sourceCount,
    nextCount: nextValues.length,
    addedCount,
    removedCount,
    changedCount,
    matchedCount,
    unmatchedCount: nextValues.length - matchedCount,
    duplicateGroupCount,
    preservedExtraCount,
  };
}

/** 읽기 결과만으로 시트 동기화 계획을 만든다. 이 함수는 Firebase 쓰기를 절대 수행하지 않는다. */
export function buildSheetSyncPlan(
  source: Participant[],
  students: Record<string, Student>,
  existing: Record<string, Participant>,
): SheetSyncPlan {
  const { extraByStudentId, extraByIdentity } = buildExtraPreservationMaps(existing);
  const { deduped, dupEntries } = dedupeSheetParticipants(source, students);
  const sorted = [...deduped].sort((left, right) => left.p.name.localeCompare(right.p.name, "ko"));
  const participants: Record<string, Participant> = {};
  const dedupKeyToParticipantKey = new Map<string, string>();

  sorted.forEach(({ p, ms, dedupKey }, index) => {
    const key = `p_${index}`;
    const preservedExtra = (ms?.id ? extraByStudentId.get(ms.id) : undefined)
      ?? extraByIdentity.get(identityKeyOf(p));
    participants[key] = {
      ...withoutRaw(p),
      studentId: ms?.id ?? null,
      phone: p.phone || ms?.phone || null,
      pPhone: ms?.pPhone ?? null,
      ...(preservedExtra ? { extra: preservedExtra } : {}),
    };
    dedupKeyToParticipantKey.set(dedupKey, key);
  });

  const duplicates: SyncDuplicateGroup[] = [...dupEntries.entries()].map(([key, value]) => ({
    ...value,
    resolvedIndex: 0,
    participantKey: dedupKeyToParticipantKey.get(key),
  }));

  return {
    kind: "sheet",
    participants,
    duplicates,
    summary: summarizeReplacement(existing, participants, source.length, duplicates.length),
  };
}

/** 현재 참가자와 최신 출석부로 재매칭 계획을 만든다. 적용 전에는 아무 경로도 수정하지 않는다. */
export function buildRematchPlan(
  participants: Record<string, Participant>,
  students: Record<string, Student>,
): RematchPlan {
  const updates: Record<string, RematchUpdate> = {};
  const missedNames: string[] = [];
  let matchedCount = 0;
  let changedCount = 0;

  Object.entries(participants).forEach(([key, participant]) => {
    const found = findStudent(participant, students);
    if (found) matchedCount += 1;
    else missedNames.push(`${participant.name}(${participant.grade}학년 ${participant.class}반)`);
    const update = {
      studentId: found?.id ?? null,
      phone: found?.phone ?? participant.phone ?? null,
      pPhone: found?.pPhone ?? participant.pPhone ?? null,
    };
    updates[key] = update;
    if (
      (participant.studentId ?? null) !== update.studentId
      || (participant.phone ?? null) !== update.phone
      || (participant.pPhone ?? null) !== update.pPhone
    ) changedCount += 1;
  });

  const count = Object.keys(participants).length;
  return {
    kind: "rematch",
    updates,
    students,
    missedNames,
    summary: {
      currentCount: count,
      sourceCount: Object.keys(students).length,
      nextCount: count,
      addedCount: 0,
      removedCount: 0,
      changedCount,
      matchedCount,
      unmatchedCount: count - matchedCount,
      duplicateGroupCount: 0,
      preservedExtraCount: count,
    },
  };
}
