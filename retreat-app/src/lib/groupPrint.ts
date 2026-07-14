import type { TeacherAttendance } from "./types";

export function teacherPrintStatus(
  teachers: TeacherAttendance[], name: string, bu: string,
): TeacherAttendance["status"] | undefined {
  const matches = teachers.filter(teacher => teacher.name === name);
  return matches.find(teacher => teacher.bu === bu)?.status
    ?? matches.find(teacher => teacher.bu === "스탭")?.status
    ?? matches[0]?.status;
}

export function teacherPrintStatusSuffix(status?: string): string {
  return status === "부분참" || status === "불참" ? ` (${status})` : "";
}

export function resolvePrintGender(gender: string | undefined, classNumber: number): "남" | "여" {
  const normalized = gender?.trim().charAt(0);
  if (normalized === "남" || normalized === "여") return normalized;
  // 고등부 반 편성의 기존 규칙: 홀수반=남, 짝수반=여
  return classNumber % 2 === 0 ? "여" : "남";
}

export function studentPrintRowClass(
  gender: string | undefined, classNumber: number, cellColor?: string,
): "r-male" | "r-female" | "r-red" {
  if (cellColor === "red") return "r-red";
  return resolvePrintGender(gender, classNumber) === "남" ? "r-male" : "r-female";
}
