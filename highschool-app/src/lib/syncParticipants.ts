import { Participant, Student } from "./types";
import { findStudent } from "./studentMatcher";

/** 특이사항 보존·중복 판정에 쓰는 identity 키 — ParticipantsTab의 보존맵 조립과 조회가 반드시 같은 형식을 쓰게 하는 단일 원천 */
export function identityKeyOf(p: Pick<Participant, "name" | "bu" | "grade" | "class">): string {
  return `${p.name.trim()}|${p.bu ?? ""}|${p.grade}|${p.class}`;
}

/**
 * 시트 동기화 시 기존 participants의 특이사항(extra) 보존 맵 생성.
 * ⚠ studentId·identity가 두 명 이상에게 겹치면(매칭 애매 등으로 DB에 일시적으로 중복 매핑된 경우)
 * 그 키는 누구 것인지 신뢰할 수 없으므로 보존 후보에서 제외한다 — 안 그러면 엉뚱한 사람의
 * 특이사항이 studentId를 공유하는 다른 사람에게 옮겨붙어("복사")버리고, 이후 재동기화마다
 * 그 잘못된 값이 "기존값 우선 보존"되어 영구화된다(실제 사례: 서로 다른 6쌍/12명 오염 확인, 2026-07-08).
 */
export function buildExtraPreservationMaps(existing: Record<string, Participant>): {
  extraByStudentId: Map<string, string>;
  extraByIdentity: Map<string, string>;
} {
  const extraByStudentId = new Map<string, string>();
  const extraByIdentity = new Map<string, string>();
  const ambiguousStudentIds = new Set<string>();
  const ambiguousIdentities = new Set<string>();
  Object.values(existing).forEach(prev => {
    if (!prev.extra) return;
    if (prev.studentId) {
      if (extraByStudentId.has(prev.studentId)) ambiguousStudentIds.add(prev.studentId);
      extraByStudentId.set(prev.studentId, prev.extra);
    }
    const identityKey = identityKeyOf(prev);
    if (extraByIdentity.has(identityKey)) ambiguousIdentities.add(identityKey);
    extraByIdentity.set(identityKey, prev.extra);
  });
  ambiguousStudentIds.forEach(id => extraByStudentId.delete(id));
  ambiguousIdentities.forEach(key => extraByIdentity.delete(key));
  return { extraByStudentId, extraByIdentity };
}

/**
 * 학생 DB 매칭 + 중복 제거 (동일 studentId는 최초 신청만 유지, 미매칭은 name+bu+grade 기준).
 * dupEntries의 entries에는 첫 번째 신청도 포함된다(관리자가 유지할 항목을 고를 수 있도록).
 */
export function dedupeSheetParticipants(list: Participant[], students: Record<string, Student>): {
  deduped: { p: Participant; ms: Student | undefined; dedupKey: string }[];
  dupEntries: Map<string, { name: string; bu: string; entries: Participant[] }>;
} {
  const seenStudentIds = new Set<string>();
  const dupEntries = new Map<string, { name: string; bu: string; entries: Participant[] }>();
  const deduped: { p: Participant; ms: Student | undefined; dedupKey: string }[] = [];
  list.forEach(p => {
    const ms = findStudent(p, students);
    const dedupKey = ms?.id ?? `name:${p.name.trim()}:${p.bu ?? ""}:${p.grade}`;
    if (seenStudentIds.has(dedupKey)) {
      const prev = dupEntries.get(dedupKey);
      if (prev) prev.entries.push(p);
      else dupEntries.set(dedupKey, { name: p.name, bu: p.bu, entries: [p] });
      return;
    }
    seenStudentIds.add(dedupKey);
    deduped.push({ p, ms, dedupKey });
  });
  // 첫 번째 신청도 entries에 포함
  dupEntries.forEach((v, k) => {
    const first = deduped.find(d => d.dedupKey === k);
    if (first) v.entries.unshift(first.p);
  });
  return { deduped, dupEntries };
}
