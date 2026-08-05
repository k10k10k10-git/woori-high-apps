import { normalizeName } from "./studentMatcher";

// UnmatchedPaymentsTab 로컬 strip — studentMatcher.stripSuffix와 다름(영문 꼬리 전부 제거). 통합 금지.
export function stripEnglishTail(n: string): string {
  return n.replace(/[A-Za-z]+$/, "").trim();
}

/**
 * "미납자 현황" 색상 판정 키 결정.
 * p.studentId(findStudent로 학년·반까지 확인된 정확한 매칭, cellColors 쓰기·ClassRosterTab과 동일 포맷)를
 * 항상 1순위로 쓴다. nameToColorKey(이름만 보고 학년·반 구분이 없는 근사 매칭)는 p.studentId가 없을 때만
 * 폴백으로 쓴다 — 순서가 바뀌면 동명이인이 있는 경우 다른 학생의 색상 키를 가리켜, 입금 연결·체크가
 * 반영됐는데도 미납자 현황엔 그대로 남는 버그가 된다(2026-07-09).
 */
export function resolvePaymentColorKey(
  name: string,
  studentId: string | null | undefined,
  buNum: number,
  nameToColorKey: Map<string, string>,
): string | null {
  if (studentId) return studentId;
  const stripped = stripEnglishTail(name);
  return (
    nameToColorKey.get(`${buNum}_${name}`) ??
    nameToColorKey.get(`${buNum}_${normalizeName(name)}`) ??
    nameToColorKey.get(`${buNum}_${stripped}`) ??
    nameToColorKey.get(`${buNum}_${normalizeName(stripped)}`) ??
    null
  );
}
