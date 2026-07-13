import { describe, expect, it } from "vitest";
import { buildStaffMoveUpdates } from "@/lib/staffMove";

describe("스탭 팀 이동 원자적 update", () => {
  it("명단·출석 이동과 기존 경로 삭제를 하나의 payload로 만든다", () => {
    expect(buildStaffMoveUpdates(
      2026,
      "찬양팀",
      "미디어팀",
      "m1",
      { name: " 김우리 ", phone: " 010-1234 ", toTeamMemberCount: 4 },
      { "0-0": "O" },
    )).toEqual({
      "staff_members/2026/미디어팀/m1": { name: "김우리", phone: "010-1234", num: 5 },
      "staff_attendance/2026/미디어팀/m1": { "0-0": "O" },
      "staff_attendance/2026/찬양팀/m1": null,
      "staff_members/2026/찬양팀/m1": null,
    });
  });

  it("출석 기록이 없으면 대상 팀의 잔여 출석도 삭제한다", () => {
    const updates = buildStaffMoveUpdates(
      2026,
      "찬양팀",
      "미디어팀",
      "m1",
      { name: "김우리", phone: "", toTeamMemberCount: 0 },
      null,
    );
    expect(updates["staff_attendance/2026/미디어팀/m1"]).toBeNull();
  });
});
