import { expect, it } from "vitest";
import { attendanceLabel, isAttendanceStatus, isLegacyAttendanceStatus, isStageEligibleAttendance, PRAISE_ATTENDANCE_OPTIONS } from "./attendance";

it("신규 상태에는 지각이 없고 이관 원본에서만 보존한다", () => {
  expect(PRAISE_ATTENDANCE_OPTIONS.map((item) => item.value)).toEqual(["PRESENT", "ABSENT"]);
  expect(isAttendanceStatus("LATE")).toBe(false);
  expect(isLegacyAttendanceStatus("LATE")).toBe(true);
  expect(attendanceLabel("LATE")).toBe("지각 (이관 기록)");
});

it("지각 인정은 명시 정책이며 미입력·결석을 출석으로 만들지 않는다", () => {
  expect(isStageEligibleAttendance("PRESENT")).toBe(true);
  expect(isStageEligibleAttendance("LATE")).toBe(false);
  expect(isStageEligibleAttendance("LATE", true)).toBe(true);
  for (const value of [null, undefined, "", "ABSENT", "unknown", true]) {
    expect(isStageEligibleAttendance(value, true)).toBe(false);
    expect(isAttendanceStatus(value)).toBe(value === "ABSENT");
  }
  expect(attendanceLabel(null)).toBe("미입력");
});
