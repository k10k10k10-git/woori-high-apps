import { Participant, Student } from "./types";

// 이름 정규화: 앞 숫자(학번) 제거, 공백 제거
// 예) "217이예준" → "이예준", "전 진" → "전진", "232김희서C" → "김희서C"
export function normalizeName(n: string) {
  return n.replace(/^\d+/, "").replace(/\s+/g, "").trim();
}

// 동명이인 구분용 접미사(예: "김철수A")만 제거 — 한글로 끝나는 이름 + 대문자 알파벳 1글자일 때만
// (앞 글자 한글 조건이 없으면 "JOHN" → "JOH" 처럼 영문 이름이 손상됨)
export function stripSuffix(n: string) {
  const m = n.match(/^(.+[가-힣])([A-Z])$/); // 남는 이름 2글자 이상 + 한글로 끝남
  return m ? m[1].trim() : n;
}

/**
 * 구글폼 참가자 → 출석부 DB 학생 매칭 (9단계 우선순위)
 * 원본 이름 → 정규화 이름 → 접미사 제거 순으로, 학년+반 → 학년 → 이름만 순으로 좁혀가며 탐색.
 * 이름만으로 매칭할 때는 전체 부서 기준 동명이인이 없어야 함.
 */
export function findStudent(p: Participant, students: Record<string, Student>): Student | undefined {
  const pName = p.name.trim();
  const pNorm = normalizeName(pName);
  const g = p.grade, c = p.class;
  // 참가자의 부에 해당하는 학생만 검색 (1부↔2부 혼용 방지)
  const buNum = p.bu?.includes("1") ? 1 : p.bu?.includes("2") ? 2 : 0;
  const allVals = Object.values(students);
  const vals = buNum > 0 ? allVals.filter(s => s.buNum === buNum) : allVals;

  // 1순위: 원본 이름 + 학년 + 반
  let m = vals.find(s => s.name === pName && s.grade === g && s.class === c);
  if (m) return m;
  // 2순위: 원본 이름 + 학년
  if (g > 0) { m = vals.find(s => s.name === pName && s.grade === g); if (m) return m; }
  // 3순위: 정규화 이름 + 학년 + 반
  if (g > 0 && c > 0 && pNorm.length >= 2) { m = vals.find(s => normalizeName(s.name) === pNorm && s.grade === g && s.class === c); if (m) return m; }
  // 4순위: 정규화 이름 + 학년
  if (g > 0 && pNorm.length >= 2) { m = vals.find(s => normalizeName(s.name) === pNorm && s.grade === g); if (m) return m; }
  // 5순위: 접미사 제거 이름 + 학년 + 반 — 후보 2명 이상이면 매칭 거부 (DB 순서에 따라 다른 사람이 잡히는 것 방지)
  if (g > 0 && c > 0) { const ms = vals.filter(s => stripSuffix(s.name) === pName && s.grade === g && s.class === c); if (ms.length === 1) return ms[0]; }
  // 6순위: 접미사 제거 이름 + 학년 — 후보 2명 이상이면 매칭 거부 → 수동 확인으로 분류
  if (g > 0) { const ms = vals.filter(s => stripSuffix(s.name) === pName && s.grade === g); if (ms.length === 1) return ms[0]; }
  // 전체 부서 기준 동명이인 여부 — 접미사(A/B) 제거 후 정규화 이름으로 비교
  const hasDuplInAll = allVals.filter(s => stripSuffix(normalizeName(s.name)) === stripSuffix(pNorm)).length >= 2;
  // 7순위: 원본 이름만 (유일한 경우) — 전체 부서 기준 동명이인 없어야 함
  const exact = vals.filter(s => s.name === pName);
  if (exact.length === 1 && !hasDuplInAll) return exact[0];
  // 8순위: 정규화 이름만 (유일한 경우)
  if (pNorm.length >= 2) {
    const normed = vals.filter(s => normalizeName(s.name) === pNorm);
    if (normed.length === 1 && !hasDuplInAll) return normed[0];
  }
  // 9순위: 접미사 제거 이름만 (유일한 경우)
  const stripped = vals.filter(s => stripSuffix(s.name) === pName);
  if (stripped.length === 1 && !hasDuplInAll) return stripped[0];
  return undefined;
}

/**
 * 참가자 → 셀색상/부분참 식별 키(`${buNum}_${studentId}`) 해석.
 * 신청자 취합(ClassRosterTab)이 셀 색상을 이 키로 저장하고, 부분참석 탭도 같은 키로
 * 학생을 식별해야 두 화면이 한 사람을 같은 키로 본다.
 *
 * 저장된 studentId가 있으면 그대로 쓰고(동기화 때 findStudent로 채워진 값이라 반 명단 id와 동일),
 * 없으면(자동 매칭 실패로 studentId=null) findStudent로 반 명단에서 다시 찾아 보강한다.
 * 이 보강이 없으면 studentId 없이 신청자 취합에서 주황(부분참)으로만 칠한 학생이
 * 부분참석 탭에 영영 안 뜬다(2026-07-13 버그).
 *
 * ⚠ studentId가 이미 "${buNum}_..." 형식으로 저장된 데이터가 있다 — 접두를 또 붙이면
 *   "2_2_..." 이중접두가 되어 셀색상 키와 어긋난다. 반드시 정규식으로 방어한다.
 */
export function resolveStudentKey(p: Participant, students: Record<string, Student>): string | null {
  const buNum = p.bu?.includes("1") ? 1 : p.bu?.includes("2") ? 2 : 0;
  if (p.studentId) {
    const sid = String(p.studentId);
    return /^[12]_/.test(sid) ? sid : buNum > 0 ? `${buNum}_${sid}` : sid;
  }
  const s = findStudent(p, students);
  if (!s) return null;
  // getStudentsByYear의 Student.id는 이미 "${buNum}_${rawId}" 유니크키 — 접두를 또 붙이지 않는다.
  return String(s.id);
}
