import { describe, it, expect } from "vitest";
import { computeFairAssignment } from "@/lib/fairAssign";
import { Group, IguardMeal, IguardSeating, IguardSeatingZone } from "@/lib/types";

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

  it("1부/2부에 내부 이름이 같은 조가 있어도 화면에 보이는 전역 번호로 정확히 매칭된다 (실사용 버그 회귀)", () => {
    // 1부: 1조~6조(내부 name), 2부: 1조~5조(내부 name) — 2부 그룹은 전역 표시 시 6이 더해져 "7조"~"11조"로 보임.
    // 사용자가 화면에 보이는 대로 "1조"를 입력했을 때, 내부 name이 같은 2부의 "1조"(화면상 7조)가 아니라
    // 실제 화면에 "1조"로 보이는 1부 그룹이 고정돼야 한다.
    const bu1 = Array.from({ length: 6 }, (_, i) => makeGroup(`bu1_${i + 1}`, `${i + 1}조`));
    const bu2 = Array.from({ length: 5 }, (_, i) => ({ ...makeGroup(`bu2_${i + 1}`, `${i + 1}조`), bu: "2부" }));
    const mixed = [...bu1, ...bu2];
    const r = computeFairAssignment(mixed, [makeMeal("m1", "1조")], [], 0);
    const front = r.meals[0].entries.find(e => e.seq === 0);
    expect(front?.groupId).toBe("bu1_1"); // 1부의 "1조" — 2부의 내부 "1조"(bu2_1, 화면상 7조)가 아님
  });
});

function zonesOf(names: string[]): IguardSeatingZone[] {
  return names.map(name => ({ name, groupIds: [] }));
}

describe("computeFairAssignment — 붙이면 안 되는 조 (avoidPairs)", () => {
  it("같은 구역에 배정된 avoidPairs 조를 서로 다른 구역으로 분리한다", () => {
    // g1~g4가 2구역(구역당 2명)에 배정되면 g1,g2가 같은 구역(1열)에 들어간다 — avoidPairs로 분리돼야 함
    const fourGroups = [makeGroup("g1", "1조"), makeGroup("g2", "2조"), makeGroup("g3", "3조"), makeGroup("g4", "4조")];
    const seat: IguardSeating = {
      id: "s1", label: "s1", day: 1, order: 0,
      avoidPairs: "1조-2조",
      zones: zonesOf(["1열", "2열"]),
    };
    const r = computeFairAssignment(fourGroups, [], [seat], 0);
    const zone0 = r.seatings[0].zones[0].groupIds;
    const zone1 = r.seatings[0].zones[1].groupIds;
    const sameZone = (zone0.includes("g1") && zone0.includes("g2")) || (zone1.includes("g1") && zone1.includes("g2"));
    expect(sameZone).toBe(false);
  });

  it("1부/2부에 내부 이름이 같은 조가 있어도 avoidPairs가 전역 표시 번호로 정확히 매칭된다 (pinnedFront와 동일한 버그 패턴 회귀)", () => {
    // 1부: 1조·2조(내부 name) / 2부: 1조·2조(내부 name, 화면상 3조·4조) — 이름만 보면 충돌 가능
    const bu1 = [makeGroup("bu1_1", "1조"), makeGroup("bu1_2", "2조")];
    const bu2 = [
      { ...makeGroup("bu2_1", "1조"), bu: "2부" },
      { ...makeGroup("bu2_2", "2조"), bu: "2부" },
    ];
    const mixed = [...bu1, ...bu2];
    const seat: IguardSeating = {
      id: "s1", label: "s1", day: 1, order: 0,
      avoidPairs: "1조,2조", // 화면에 보이는 "1조"/"2조" = 1부 그룹을 가리켜야 함
      zones: zonesOf(["1열", "2열"]),
    };
    const r = computeFairAssignment(mixed, [], [seat], 0);
    const zone0 = r.seatings[0].zones[0].groupIds;
    const zone1 = r.seatings[0].zones[1].groupIds;
    // 1부의 1조·2조는 avoidPairs 대상이므로 같은 구역에 남아있으면 안 된다
    // (매칭이 내부 name으로 잘못됐다면 2부의 동명 그룹과 충돌해 이 분리가 일어나지 않거나 엉뚱한 조가 분리됨)
    const bu1SameZone = (zone0.includes("bu1_1") && zone0.includes("bu1_2")) || (zone1.includes("bu1_1") && zone1.includes("bu1_2"));
    expect(bu1SameZone).toBe(false);
    // 모든 조가 정확히 한 번씩만 배정됨 (분리 과정에서 유실/중복 없음)
    expect([...zone0, ...zone1].sort()).toEqual(["bu1_1", "bu1_2", "bu2_1", "bu2_2"].sort());
  });
});
