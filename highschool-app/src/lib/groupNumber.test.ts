import { describe, it, expect } from "vitest";
import { groupDisplayName, sortGroupsByNumber } from "./groupNumber";
import type { Group } from "./types";

function makeGroup(overrides: Partial<Group> & { id: string; name: string; bu: string }): Group {
  return {
    teachers: [],
    leader: "",
    studentIds: [],
    ...overrides,
  };
}

describe("groupDisplayName", () => {
  const bu1Groups: Group[] = [
    makeGroup({ id: "g1", name: "1조", bu: "1부" }),
    makeGroup({ id: "g2", name: "2조", bu: "1부" }),
    makeGroup({ id: "g3", name: "3조", bu: "1부" }),
  ];

  const bu2Groups: Group[] = [
    makeGroup({ id: "g4", name: "1조", bu: "2부" }),
    makeGroup({ id: "g5", name: "2조", bu: "2부" }),
  ];

  const allGroups = [...bu1Groups, ...bu2Groups];

  it("1부 group shows its own number", () => {
    expect(groupDisplayName(bu1Groups[0], allGroups)).toBe("1조");
    expect(groupDisplayName(bu1Groups[2], allGroups)).toBe("3조");
  });

  it("2부 group adds 1부 count as offset", () => {
    // 1부 has 3 groups, so 2부 1조 → 4조, 2부 2조 → 5조
    expect(groupDisplayName(bu2Groups[0], allGroups)).toBe("4조");
    expect(groupDisplayName(bu2Groups[1], allGroups)).toBe("5조");
  });

  it("returns custom name unchanged (non-numeric)", () => {
    const customGroup = makeGroup({ id: "g6", name: "독수리조", bu: "1부" });
    expect(groupDisplayName(customGroup, allGroups)).toBe("독수리조");
  });

  it("handles numeric name without 조 suffix", () => {
    const group = makeGroup({ id: "g7", name: "3", bu: "2부" });
    expect(groupDisplayName(group, allGroups)).toBe("6조");
  });

  it("handles name with spaces around number", () => {
    const group = makeGroup({ id: "g8", name: " 2 조 ", bu: "2부" });
    expect(groupDisplayName(group, allGroups)).toBe("5조");
  });

  it("offsets correctly when 1부 has 12 groups", () => {
    const groups12: Group[] = [
      ...Array.from({ length: 12 }, (_, i) => makeGroup({ id: `a${i}`, name: `${i + 1}조`, bu: "1부" })),
      makeGroup({ id: "b0", name: "1조", bu: "2부" }),
    ];
    expect(groupDisplayName(groups12[12], groups12)).toBe("13조");
  });
});

describe("sortGroupsByNumber", () => {
  it("regression: 저장 순서가 10,11,12,1,2,3이어도 1,2,3,10,11,12로 수치 정렬", () => {
    const groups: Group[] = [
      makeGroup({ id: "a", name: "10조", bu: "1부" }),
      makeGroup({ id: "b", name: "11조", bu: "1부" }),
      makeGroup({ id: "c", name: "12조", bu: "1부" }),
      makeGroup({ id: "d", name: "1조", bu: "1부" }),
      makeGroup({ id: "e", name: "2조", bu: "1부" }),
    ];
    expect(sortGroupsByNumber(groups).map(g => g.name)).toEqual(["1조", "2조", "10조", "11조", "12조"]);
  });

  it("숫자 없는 커스텀 이름은 숫자 조들 뒤에 이름순으로 붙는다", () => {
    const groups: Group[] = [
      makeGroup({ id: "a", name: "독수리조", bu: "1부" }),
      makeGroup({ id: "b", name: "2조", bu: "1부" }),
      makeGroup({ id: "c", name: "1조", bu: "1부" }),
    ];
    expect(sortGroupsByNumber(groups).map(g => g.name)).toEqual(["1조", "2조", "독수리조"]);
  });
});
