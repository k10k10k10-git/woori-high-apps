import { describe, it, expect } from "vitest";
import { computeFairAssignment } from "@/lib/fairAssign";
import { Group, IguardMeal, IguardSeating } from "@/lib/types";

function makeGroup(id: string, name: string): Group {
  return { id, name, bu: "1부", teachers: [], leader: "", studentIds: [] };
}

const groups: Group[] = [makeGroup("g1", "1조"), makeGroup("g2", "2조"), makeGroup("g3", "3조")];

function makeMeal(id: string, pinnedFront: string | null = null): IguardMeal {
  return { id, label: id, day: 1, slot: 1, pinnedFront, entries: [] };
}

function makeSeating(id: string, pinnedFront: string | null = null): IguardSeating {
  return { id, label: id, day: 1, order: 0, pinnedFront, zones: [{ name: "1열", groupIds: [] }, { name: "2열", groupIds: [] }, { name: "3열", groupIds: [] }] };
}

describe("computeFairAssignment — 맨앞 고정 조 (pinnedFront)", () => {
  it("pinnedFront가 없으면 평소처럼 공정 배분 순서를 따른다", () => {
    const r = computeFairAssignment(groups, [makeMeal("m1")], [], 0);
    expect(r.meals[0].entries).toHaveLength(3);
    // seq는 0,1,2가 정확히 한 번씩만 부여됨
    expect(r.meals[0].entries.map(e => e.seq).sort()).toEqual([0, 1, 2]);
  });

  it("식사 세션에서 pinnedFront로 지정한 조가 seq 0(맨 앞)을 받는다", () => {
    const r = computeFairAssignment(groups, [makeMeal("m1", "2조")], [], 0);
    const front = r.meals[0].entries.find(e => e.seq === 0);
    expect(front?.groupId).toBe("g2");
  });

  it("여러 조를 쉼표로 지정하면 적힌 순서대로 앞순서를 받는다", () => {
    const r = computeFairAssignment(groups, [makeMeal("m1", "3조, 1조")], [], 0);
    const bySeq = [...r.meals[0].entries].sort((a, b) => a.seq - b.seq);
    expect(bySeq[0].groupId).toBe("g3");
    expect(bySeq[1].groupId).toBe("g1");
    expect(bySeq[2].groupId).toBe("g2");
  });

  it("존재하지 않는 조 이름은 무시하고 평소 공정 배분으로 동작한다", () => {
    const r = computeFairAssignment(groups, [makeMeal("m1", "존재안함")], [], 0);
    expect(r.meals[0].entries.map(e => e.seq).sort()).toEqual([0, 1, 2]);
  });

  it("집회 자리배치에서 pinnedFront로 지정한 조가 첫 구역(맨 앞자리)에 들어간다", () => {
    const r = computeFairAssignment(groups, [], [makeSeating("s1", "2조")], 0);
    expect(r.seatings[0].zones[0].groupIds).toContain("g2");
  });

  it("pinnedFront 조도 앞자리 점수를 받아 다음 비고정 세션에서는 뒤로 밀린다", () => {
    // 1번째 식사: 2조를 강제로 맨 앞 고정 → 점수 획득
    // 2번째 식사: 고정 없음 → 손해 본 조(점수 낮은 조)가 우선이므로 2조는 더 이상 맨 앞이 아니어야 함
    const r = computeFairAssignment(groups, [makeMeal("m1", "2조"), makeMeal("m2")], [], 0);
    const secondFront = r.meals[1].entries.find(e => e.seq === 0);
    expect(secondFront?.groupId).not.toBe("g2");
  });
});
