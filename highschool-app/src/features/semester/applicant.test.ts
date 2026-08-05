import { describe, expect, it } from "vitest";
import { applicantSortKey, describeApplicant, isStaffAppKey, makeAppKey, STAFF_BU } from "./applicant";

describe("makeAppKey", () => {
  it("학생은 부 번호 접두어를 쓴다 (기존 키 규칙 유지)", () => {
    expect(makeAppKey("1부", "20301")).toBe("1_20301");
    expect(makeAppKey("2부", "20301")).toBe("2_20301");
  });

  it("스탭은 s_ 접두어로 학생 키와 절대 겹치지 않는다", () => {
    expect(makeAppKey(STAFF_BU, "20301")).toBe("s_20301");
    expect(makeAppKey(STAFF_BU, "20301")).not.toBe(makeAppKey("2부", "20301"));
  });

  it("isStaffAppKey로 스탭 신청을 구분한다", () => {
    expect(isStaffAppKey(makeAppKey(STAFF_BU, "abc"))).toBe(true);
    expect(isStaffAppKey(makeAppKey("1부", "abc"))).toBe(false);
  });
});

describe("describeApplicant", () => {
  it("학생은 부·학년·반을 표기한다", () => {
    expect(describeApplicant({ bu: "1부", grade: 2, class: 3 })).toBe("1부 2-3");
  });

  it("스탭은 학년·반 없이 표기한다", () => {
    expect(describeApplicant({ bu: STAFF_BU, grade: 0, class: 0 })).toBe("스탭");
  });
});

describe("applicantSortKey", () => {
  it("스탭을 학생 뒤로 보낸다", () => {
    const keys = [
      applicantSortKey({ bu: STAFF_BU, grade: 0, class: 0, name: "김스탭" }),
      applicantSortKey({ bu: "1부", grade: 3, class: 9, name: "박학생" }),
      applicantSortKey({ bu: "2부", grade: 1, class: 1, name: "이학생" }),
    ].sort();
    expect(keys[keys.length - 1]).toContain("김스탭");
  });

  it("같은 부에서는 학년·반 숫자 순서를 지킨다", () => {
    const sorted = [
      { bu: "1부", grade: 10, class: 1, name: "가" },
      { bu: "1부", grade: 2, class: 1, name: "나" },
    ].map(applicantSortKey).sort();
    expect(sorted[0]).toContain("나");
  });
});
