import { describe, expect, it } from "vitest";
import {
  chooseCueCardStaffId,
  findPreferredStaffId,
  normalizeStaffIdentityName,
} from "@/lib/staffIdentity";

const staff = [
  { id: "kim", name: "김기영" },
  { id: "park", name: "박세원sf" },
  { id: "lee", name: "이수민" },
];

describe("개인 큐카드 계정-스탭 매칭", () => {
  it("관리자가 지정한 이름으로 본인 스탭 ID를 찾는다", () => {
    expect(findPreferredStaffId(staff, ["이수민", "Google User"])).toBe("lee");
  });

  it("지정 이름이 불일치하면 Google 표시 이름으로 폴백한다", () => {
    expect(findPreferredStaffId(staff, ["등록되지 않은 이름", "김기영"])).toBe("kim");
  });

  it("sf 꼬리표와 공백·문장부호 차이를 무시한다", () => {
    expect(normalizeStaffIdentityName(" 박 세원-SF ")).toBe("박세원");
    expect(findPreferredStaffId(staff, ["박 세원"])).toBe("park");
  });

  it("동명이인이면 임의로 한 명을 선택하지 않는다", () => {
    const duplicates = [...staff, { id: "lee2", name: "이수민 스탭" }];
    expect(findPreferredStaffId(duplicates, ["이수민"])).toBeNull();
  });

  it("사용 가능한 이름이 없으면 자동 연결하지 않는다", () => {
    expect(findPreferredStaffId(staff, [null, "", "없는 사람"])).toBeNull();
  });

  it("사용자가 다른 스탭을 직접 고른 뒤에는 본인 자동값으로 덮지 않는다", () => {
    expect(chooseCueCardStaffId(staff, "kim", "lee", true)).toBe("kim");
    expect(chooseCueCardStaffId(staff, "", "lee", false)).toBe("lee");
  });
});
