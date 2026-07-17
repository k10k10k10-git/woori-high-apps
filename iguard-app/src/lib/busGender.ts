import { isCancelledStudent, isStudentBusPassengerOnDay } from "./busParticipation";
import type {
  BusStudentGender,
  Group,
  IguardBusSegment,
  Participant,
  PartialAttendanceMap,
  Student,
} from "./types";

export interface GenderCohort extends IguardBusSegment {
  studentIds: string[];
}

function normalizeGender(value?: string): BusStudentGender | null {
  const text = (value ?? "").trim();
  if (text.startsWith("남")) return "남";
  if (text.startsWith("여")) return "여";
  return null;
}

/** participants의 studentId가 raw/uniqueKey 어느 형태여도 classes 기반 uniqueKey로 찾을 수 있게 한다. */
export function buildStudentGenderMap(participants: Record<string, Participant>, students: Record<string, Student> = {}): Record<string, BusStudentGender> {
  const result: Record<string, BusStudentGender> = {};
  Object.values(participants).forEach(participant => {
    const gender = normalizeGender(participant.gender);
    const sourceId = participant.studentId?.trim();
    if (!gender || !sourceId) return;
    const rawId = sourceId.replace(/^[12]_/, "");
    const buNum = participant.bu?.trim().startsWith("2") ? 2 : 1;
    result[sourceId] = gender;
    result[`${buNum}_${rawId}`] = gender;
  });

  // 수동 참가자는 studentId가 없을 수 있다. 이름·부서·학년·반이 유일하게 일치할 때만 안전하게 보강한다.
  Object.entries(students).forEach(([studentId, student]) => {
    if (result[studentId]) return;
    const matches = Object.values(participants).filter(participant => {
      const gender = normalizeGender(participant.gender);
      const buNum = participant.bu?.trim().startsWith("2") ? 2 : 1;
      return !!gender
        && participant.name?.trim() === student.name?.trim()
        && buNum === (student.buNum ?? Number(studentId.split("_")[0]))
        && Number(participant.grade) === student.grade
        && Number(participant.class) === student.class;
    });
    if (matches.length === 1) {
      const gender = normalizeGender(matches[0].gender);
      if (gender) result[studentId] = gender;
    }
    // 행정 자동 조편성의 기존 단일 원칙(autoAssignUtils): 홀수반=남, 짝수반=여.
    // 시트에 없는 수동 학생(예: cellColors 주황)도 같은 기준으로 성별 묶음에 포함한다.
    if (!result[studentId] && student.class > 0) result[studentId] = student.class % 2 === 0 ? "여" : "남";
  });
  return result;
}

export function activeStudentIdsForGender(
  group: Group,
  gender: BusStudentGender,
  genderMap: Record<string, BusStudentGender>,
  partial: PartialAttendanceMap,
  cellColors: Record<string, string>,
  day: 1 | 3,
): string[] {
  return (group.studentIds || [])
    .filter(studentId => !isCancelledStudent(studentId, cellColors))
    .filter(studentId => isStudentBusPassengerOnDay(partial[studentId], day))
    .filter(studentId => genderMap[studentId] === gender);
}

/** 조를 개인으로 흩뜨리지 않고 `조+성별` 묶음으로 만든다. */
export function buildGenderCohorts(
  groups: Group[],
  participants: Record<string, Participant>,
  students: Record<string, Student>,
  partial: PartialAttendanceMap,
  cellColors: Record<string, string>,
  day: 1 | 3,
): { cohorts: GenderCohort[]; missingStudentIds: string[]; genderMap: Record<string, BusStudentGender> } {
  const genderMap = buildStudentGenderMap(participants, students);
  const cohorts: GenderCohort[] = [];
  const missingStudentIds: string[] = [];

  groups.forEach(group => {
    const activeIds = (group.studentIds || [])
      .filter(studentId => !isCancelledStudent(studentId, cellColors))
      .filter(studentId => isStudentBusPassengerOnDay(partial[studentId], day));

    activeIds.forEach(studentId => {
      if (!genderMap[studentId]) missingStudentIds.push(studentId);
    });

    (["남", "여"] as const).forEach(gender => {
      const studentIds = activeIds.filter(studentId => genderMap[studentId] === gender);
      if (studentIds.length > 0) cohorts.push({ groupId: group.id, gender, studentIds });
    });
  });

  return { cohorts, missingStudentIds: [...new Set(missingStudentIds)], genderMap };
}
