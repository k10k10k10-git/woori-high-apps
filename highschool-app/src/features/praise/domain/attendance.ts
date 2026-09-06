/** 찬양팀 신규 입력은 출석·결석만 허용하고, 이관된 지각 원본은 별도 타입으로 보존한다. */
export type AttendanceStatus = "PRESENT" | "ABSENT";
export type LegacyAttendanceStatus = AttendanceStatus | "LATE";
export const PRAISE_ATTENDANCE_OPTIONS = [
  { value: "PRESENT", label: "출석" },
  { value: "ABSENT", label: "결석" },
] as const;

export function isAttendanceStatus(value: unknown): value is AttendanceStatus {
  return value === "PRESENT" || value === "ABSENT";
}

export function isLegacyAttendanceStatus(value: unknown): value is LegacyAttendanceStatus {
  return isAttendanceStatus(value) || value === "LATE";
}

/** 지각 인정은 이관 정책을 명시한 경우만 적용하며 미입력은 출석으로 추정하지 않는다. */
export function isStageEligibleAttendance(value: unknown, lateCountsAsPresent = false): boolean {
  return value === "PRESENT" || (value === "LATE" && lateCountsAsPresent);
}

export function attendanceLabel(value: LegacyAttendanceStatus | null | undefined): string {
  return value === "PRESENT" ? "출석" : value === "ABSENT" ? "결석" : value === "LATE" ? "지각 (이관 기록)" : "미입력";
}
