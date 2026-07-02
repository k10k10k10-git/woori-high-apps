import { describe, it, expect } from "vitest";
import { groupDisplayName } from "./groupNumber";
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
});
