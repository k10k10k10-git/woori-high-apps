import { describe, expect, it } from "vitest";
import { chooseCueCardStaffId, findPreferredStaffId, normalizeStaffIdentityName } from "./staffIdentity";

const staff = [
  { id: "a", name: "김성훈" },
  { id: "b", name: "박세원" },
  { id: "c", name: "이지현" },
];

describe("normalizeStaffIdentityName", () => {
  it("sf·스탭 꼬리표와 구분기호를 떼어 같은 사람으로 본다", () => {
    expect(normalizeStaffIdentityName("김성훈sf")).toBe(normalizeStaffIdentityName("김성훈"));
    expect(normalizeStaffIdentityName("김 성 훈")).toBe(normalizeStaffIdentityName("김성훈"));
    expect(normalizeStaffIdentityName("김성훈 스탭")).toBe(normalizeStaffIdentityName("김성훈"));
  });

  it("다른 사람은 여전히 다르다", () => {
    expect(normalizeStaffIdentityName("김성훈")).not.toBe(normalizeStaffIdentityName("김성준"));
  });
});

describe("findPreferredStaffId", () => {
  it("정확히 한 명일 때만 자동 연결한다", () => {
    expect(findPreferredStaffId(staff, ["박세원"])).toBe("b");
  });

  it("동명이인이면 연결하지 않는다 — 남의 큐카드를 열지 않는 것이 우선", () => {
    const duplicated = [...staff, { id: "d", name: "박세원" }];
    expect(findPreferredStaffId(duplicated, ["박세원"])).toBeNull();
  });

  it("앞선 후보가 없으면 다음 후보 이름으로 넘어간다", () => {
    expect(findPreferredStaffId(staff, ["없는사람", "이지현"])).toBe("c");
  });

  it("빈 이름·공백은 건너뛴다", () => {
    expect(findPreferredStaffId(staff, [null, undefined, "  ", "김성훈"])).toBe("a");
  });
});

describe("chooseCueCardStaffId", () => {
  // ★ 루트 CLAUDE.md 실수 13: 자동 선택이 사용자가 고른 스탭을 덮으면 안 된다.
  it("T1: 사용자가 고른 스탭은 지정 이름 자동값보다 우선한다", () => {
    expect(chooseCueCardStaffId(staff, "c", "a", true)).toBe("c");
  });

  it("고른 스탭이 명단에서 사라지면 자동값으로 되돌아간다 (빈 화면 방지)", () => {
    expect(chooseCueCardStaffId(staff, "삭제됨", "a", true)).toBe("a");
  });

  it("아직 고르지 않았으면 지정 이름 후보를 연다", () => {
    expect(chooseCueCardStaffId(staff, "", "b", false)).toBe("b");
  });

  it("지정 이름 후보가 명단에 없으면 첫 스탭으로 폴백한다", () => {
    expect(chooseCueCardStaffId(staff, "", "없는id", false)).toBe("a");
  });

  it("명단이 비어 있으면 빈 문자열", () => {
    expect(chooseCueCardStaffId([], "", "a", false)).toBe("");
  });
});
