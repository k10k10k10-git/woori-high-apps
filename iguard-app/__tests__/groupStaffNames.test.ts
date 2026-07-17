import { describe, expect, it } from "vitest";
import { resolveGroupStaffNames } from "@/lib/groupStaffNames";

const staff = [
  { id: "staff-a", name: "김민수sf" },
  { id: "staff-b", name: "이예진" },
];

describe("resolveGroupStaffNames", () => {
  it("이가드 조스탭 배정 ID를 이름으로 변환해 조별정보에 포함한다", () => {
    expect(resolveGroupStaffNames(undefined, ["staff-a", "staff-b"], staff))
      .toEqual(["김민수sf", "이예진"]);
  });

  it("행정 조편성 이름과 이가드 배정이 같은 사람이면 중복 표시하지 않는다", () => {
    expect(resolveGroupStaffNames("김민수 스탭", ["staff-a", "staff-b"], staff))
      .toEqual(["김민수 스탭", "이예진"]);
  });

  it("현재 스탭 명단에서 찾을 수 없는 고아 ID는 화면에 노출하지 않는다", () => {
    expect(resolveGroupStaffNames("기존 스탭", ["removed-staff"], staff))
      .toEqual(["기존 스탭"]);
  });
});
