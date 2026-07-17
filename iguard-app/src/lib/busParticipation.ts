import { isPresentOnDay } from "./partialAttendance";
import { normalizeStaffIdentityName } from "./staffIdentity";
import type { PartialAttendanceInfo, TeacherAttendance } from "./types";

export type BusDay = 1 | 3;

/** 행정 참가자 셀의 red는 취소/불참. uniqueKey와 과거 raw studentId 키를 모두 지원한다. */
export function isCancelledStudent(studentId: string, cellColors: Record<string, string>): boolean {
  const rawId = studentId.replace(/^[12]_/, "");
  return cellColors[studentId] === "red" || cellColors[rawId] === "red";
}

/** 행정 부분참 메모의 당일 방문 표기 — 이런 학생은 단체 입·퇴소 버스를 타지 않는다. */
export function isDayVisitOnly(note?: string): boolean {
  return /당일\s*(?:참여|참석)/.test(note ?? "");
}

/** 학생의 일차별 단체 버스 탑승 여부. 기존 선복귀/후발대 공식 위에 당일 방문 제외를 적용한다. */
export function isStudentBusPassengerOnDay(partial: PartialAttendanceInfo | undefined, day: BusDay): boolean {
  if (isDayVisitOnly(partial?.note)) return false;
  return isPresentOnDay(partial?.type, day);
}

/** 행정 교사 참석 탭에서 별도 차량 이동으로 기록한 값인지 판정한다. */
export function isOwnCarTransport(transport?: string): boolean {
  return /(?:자\s*차|자가용|개인\s*차량)/.test(transport ?? "");
}

/**
 * 조에 이름만 저장된 교사를 행정 참석 레코드로 복원한다.
 * 같은 이름이면 현재 부서를 우선하고, 여전히 모호하면 임의 선택하지 않는다.
 */
export function resolveTeacherAttendance(
  teachers: TeacherAttendance[],
  name: string,
  bu: string,
): TeacherAttendance | null {
  const key = normalizeStaffIdentityName(name);
  if (!key) return null;
  const matches = teachers.filter(teacher => normalizeStaffIdentityName(teacher.name) === key);
  const sameBu = matches.filter(teacher => teacher.bu === bu);
  if (sameBu.length === 1) return sameBu[0];
  if (sameBu.length > 1) return null;
  const staff = matches.filter(teacher => teacher.bu === "스탭");
  if (staff.length === 1) return staff[0];
  return matches.length === 1 ? matches[0] : null;
}

/** 행정에 불참 또는 자차로 기록된 교사는 단체 버스 명단에서 제외한다. 미매칭은 기존 명단을 보존한다. */
export function isTeacherBusPassenger(
  teachers: TeacherAttendance[],
  name: string,
  bu: string,
): boolean {
  const teacher = resolveTeacherAttendance(teachers, name, bu);
  if (!teacher) return true;
  return teacher.status !== "불참" && !isOwnCarTransport(teacher.transport);
}
