// 신청자 키·표기 단일 지점 (순수 함수 — firebase 의존 없음).
// 학생 원장(classes)뿐 아니라 공식스탭(teacherStaff)도 접수 대상이므로
// appKey 규칙과 소속 표기를 화면마다 재구현하지 않는다.

export const STAFF_BU = "스탭";

/**
 * appKey 규칙
 *   학생: "{부번호}_{학생ID}"  (1부/2부에 같은 학생ID가 있어 부 번호를 접두어로 쓴다)
 *   스탭: "s_{teacherStaff 노드키}"  (학생 키와 절대 겹치지 않게 s_ 접두어)
 */
export function makeAppKey(bu: string, personId: string): string {
  if (bu === STAFF_BU) return `s_${personId}`;
  const buNum = bu === "1부" ? "1" : "2";
  return `${buNum}_${personId}`;
}

export function isStaffAppKey(appKey: string): boolean {
  return appKey.startsWith("s_");
}

/** 명단·표에 쓰는 소속 표기 — 스탭은 학년·반이 없다. */
export function describeApplicant(person: { bu: string; grade: number; class: number }): string {
  if (person.bu === STAFF_BU) return STAFF_BU;
  return `${person.bu} ${person.grade}-${person.class}`;
}

/** 정렬 키 — 스탭을 학생 뒤로 보낸다. */
export function applicantSortKey(person: { bu: string; grade: number; class: number; name: string }): string {
  const buRank = person.bu === STAFF_BU ? "9" : person.bu;
  return `${buRank}_${String(person.grade).padStart(2, "0")}_${String(person.class).padStart(2, "0")}_${person.name}`;
}
