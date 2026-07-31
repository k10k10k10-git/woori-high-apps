/**
 * 반별 명단(`ClassRosterTab`)의 참가자 집계 — 순수 계산.
 *
 * 이 화면의 요약 숫자는 인쇄물·식수 계산과 함께 운영 판단에 쓰이는데,
 * 846줄 컴포넌트 안에 있어 검증할 방법이 없었다. 계산만 떼어내 테스트로 고정한다.
 *
 * ⚠ 순수 함수만 둔다. Firebase·React·DOM에 의존하지 않는다.
 */

import type { Participant } from "./types";

export interface RosterHeadcount {
  /** 중복 제거된 매칭 참가자 수 */
  total: number;
  /** studentId가 있는 인원 — 현재 total과 같지만 의미가 달라 별도로 센다 */
  matched: number;
  male: number;
  female: number;
}

/**
 * 부서별 참가자 중 **DB 매칭된 인원만** 중복 없이 남긴다.
 *
 * ⚠ `studentId`가 없는 신청자는 제외한다 — 반 명단과 연결되지 않아 이 화면의
 * 집계 모수에 넣을 수 없다. 같은 `studentId`가 여러 번 나오면 **첫 항목만** 남긴다
 * (중복 신청은 최초 신청 유지 규칙과 같은 방향).
 */
export function uniqueMatchedParticipants(buParticipants: readonly Participant[]): Participant[] {
  const seen = new Set<string>();
  return buParticipants.filter(p => {
    if (!p.studentId) return false;
    if (seen.has(p.studentId)) return false;
    seen.add(p.studentId);
    return true;
  });
}

/**
 * 요약 카드용 인원 집계.
 * 성별은 명시값만 센다 — 값이 없으면 남/여 어느 쪽에도 넣지 않는다
 * (반 홀짝 추론은 인쇄 색상 전용 규칙이고, 여기서 쓰면 요약 숫자가 실제와 달라진다).
 */
export function summarizeRoster(uniqueParticipants: readonly Participant[]): RosterHeadcount {
  return uniqueParticipants.reduce<RosterHeadcount>((acc, p) => {
    acc.total++;
    if (p.studentId != null) acc.matched++;
    if (p.gender === "남") acc.male++;
    else if (p.gender === "여") acc.female++;
    return acc;
  }, { total: 0, matched: 0, male: 0, female: 0 });
}
