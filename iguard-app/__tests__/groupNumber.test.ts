import { describe, it, expect } from "vitest";
import { groupDisplayName, sortGroupsByDisplayNumber } from "@/lib/groupNumber";
import type { Group } from "@/lib/types";

function makeGroup(overrides: Partial<Group> & { id: string; bu: string; name: string }): Group {
  return {
    studentIds: [],
    teachers: [],
    leader: "",
    staff: "",
    ...overrides,
  } as Group;
}

describe("groupDisplayName", () => {
  const groups: Group[] = [
    makeGroup({ id: "a", bu: "1부", name: "1조" }),
    makeGroup({ id: "b", bu: "1부", name: "2조" }),
    makeGroup({ id: "c", bu: "1부", name: "3조" }),
    makeGroup({ id: "d", bu: "2부", name: "1조" }),
    makeGroup({ id: "e", bu: "2부", name: "2조" }),
  ];

  it("returns 1부 group name as-is (number format)", () => {
    expect(groupDisplayName(groups[0], groups)).toBe("1조");
    expect(groupDisplayName(groups[2], groups)).toBe("3조");
  });

  it("offsets 2부 group numbers by 1부 count", () => {
    // 1부 has 3 groups, so 2부 1조 → 4조, 2부 2조 → 5조
    expect(groupDisplayName(groups[3], groups)).toBe("4조");
    expect(groupDisplayName(groups[4], groups)).toBe("5조");
  });

  it("returns custom name as-is (non-numeric)", () => {
    const custom = makeGroup({ id: "f", bu: "1부", name: "독수리조" });
    expect(groupDisplayName(custom, groups)).toBe("독수리조");
  });

  it("handles bare number without 조 suffix", () => {
    const bare = makeGroup({ id: "g", bu: "1부", name: "5" });
    expect(groupDisplayName(bare, groups)).toBe("5조");
  });

  it("부 구분을 섞지 않고 전역 표시 번호 1조부터 순서대로 정렬한다", () => {
    expect(sortGroupsByDisplayNumber([groups[3], groups[1], groups[4], groups[0], groups[2]])
      .map(group => groupDisplayName(group, groups))).toEqual(["1조", "2조", "3조", "4조", "5조"]);
  });
});
