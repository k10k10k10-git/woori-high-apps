import { describe, expect, it } from "vitest";
import { buildRosterContactMap, contactOverrideValue, resolvedContact } from "./rosterContact";

describe("학기 신청 연락처 원장 연동", () => {
  const map = buildRosterContactMap(
    [{ classKey: "1-2-3", students: { student: { name: "학생", phone: "010-1111-2222", pphone: "010-3333-4444" } } }],
    [{ staffId: "staff", name: "스탭", phone: "010-5555-6666" }],
  );

  it("학생과 스탭을 신청 appKey로 연결한다", () => {
    expect(map["1_student"]).toEqual({ phone: "010-1111-2222", parentPhone: "010-3333-4444" });
    expect(map.s_staff).toEqual({ phone: "010-5555-6666" });
  });

  it("신청서 수정값이 원장값보다 우선한다", () => {
    expect(resolvedContact({ phone: "010-9999-0000" }, map["1_student"]).phone).toBe("010-9999-0000");
    expect(resolvedContact(undefined, map["1_student"]).parentPhone).toBe("010-3333-4444");
  });

  it("원장 기본값 그대로면 별도 저장하지 않고 실제 수정값만 남긴다", () => {
    expect(contactOverrideValue("010-1111-2222", "010-1111-2222")).toBe("");
    expect(contactOverrideValue("010-7777-8888", "010-1111-2222")).toBe("010-7777-8888");
  });
});
