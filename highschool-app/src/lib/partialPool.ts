import { Participant, Student, PartialAttendance } from "./types";
import { resolveStudentKey } from "./studentMatcher";

export interface PartialPoolRow {
  studentKey: string;
  studentId: string;
  name: string;
  bu: string;
  buNum: number;
  grade: number;
  classNum: number;
  phone?: string | null;
  pPhone?: string | null;
  partial?: PartialAttendance;
}

/**
 * 부분참석 탭의 작업 대상 풀 = 신청자 취합에서 주황(부분참)으로 칠한 학생 ∪ 이미 선복귀/후발대로 지정된 학생.
 *
 * ⚠ 참가자(participants)가 아니라 **주황 셀 키 자체**에서 만든다. 주황은 반 명단(classes/) 셀에
 *   칠해지므로, 시트에 없는 구두 신청자를 수동으로 칠한 경우(예: 김민하)도 참가자 매칭 없이 떠야 한다
 *   — 참가자 순회 방식이면 시트에 없는 학생은 영영 안 뜬다(2026-07-13 확인, 재발 3회).
 *
 * 표시 정보는 반 명단(students, `getStudentsByYear`)에서 가져오고, 참가자가 있으면 연락처로 보강한다.
 * 셀색상/부분참 키는 `${buNum}_${반명단 studentId}` — 신청자 취합·이가드와 동일 규칙(resolveStudentKey).
 */
export function buildPartialPool(
  participants: Record<string, Participant>,
  students: Record<string, Student>,
  cellColors: Record<string, string>,
  records: PartialAttendance[],
): PartialPoolRow[] {
  const recordMap = new Map(records.map(r => [r.id, r]));

  // 참가자를 키로 인덱싱 (연락처·부/학년/반 보조 정보용)
  const participantByKey = new Map<string, Participant>();
  Object.values(participants).forEach(p => {
    const k = resolveStudentKey(p, students);
    if (k) participantByKey.set(k, p);
  });

  const keys = new Set<string>();
  Object.entries(cellColors).forEach(([k, c]) => { if (c === "orange") keys.add(k); });
  records.forEach(r => { if (r.id) keys.add(r.id); });

  return [...keys]
    .flatMap<PartialPoolRow>(studentKey => {
      if (cellColors[studentKey] === "red") return [];
      // studentKey는 이미 "${buNum}_${rawId}" 유니크키 = getStudentsByYear의 키. 접두를 떼면 안 된다.
      const s = students[studentKey];
      const p = participantByKey.get(studentKey);
      const name = s?.name ?? p?.name;
      if (!name) return []; // 반 명단·참가자 어디에도 없으면 표시 불가(이론상 없음)
      const buNum = s?.buNum ?? (studentKey.startsWith("2_") ? 2 : 1);
      return [{
        studentKey,
        studentId: studentKey,
        name,
        bu: buNum === 2 ? "2부" : "1부",
        buNum,
        grade: s?.grade ?? p?.grade ?? 0,
        classNum: s?.class ?? p?.class ?? 0,
        phone: s?.phone || p?.phone, // 로스터 연락처가 비어 있으면 참가자 연락처로 보강
        pPhone: p?.pPhone,
        partial: recordMap.get(studentKey),
      }];
    })
    .sort((a, b) => {
      // 부분참(선복귀/후발대/당일참석)을 맨 위로 — 본대 사이에 묻혀 찾기 어렵다는 피드백 반영
      const priority = (r: PartialPoolRow) =>
        r.partial?.type === "선복귀" ? 0 : r.partial?.type === "후발대" ? 1 : r.partial?.type === "당일참석" ? 2 : 3;
      return (
        priority(a) - priority(b) ||
        a.buNum - b.buNum ||
        a.grade - b.grade ||
        a.classNum - b.classNum ||
        a.name.localeCompare(b.name, "ko")
      );
    });
}
