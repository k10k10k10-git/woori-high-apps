import type { PartialAttendance } from "./types";

export const PARTIAL_ATTENDANCE_TYPES = ["선복귀", "후발대", "당일참석"] as const satisfies readonly PartialAttendance["type"][];

/** DB에서 읽은 부분참 유형이 현재 앱에서 지원되는 값인지 확인한다. */
export function isPartialAttendanceType(value: unknown): value is PartialAttendance["type"] {
  return typeof value === "string" && PARTIAL_ATTENDANCE_TYPES.some(type => type === value);
}
