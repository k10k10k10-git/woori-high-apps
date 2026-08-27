import { describe, expect, it } from "vitest";
import { computeFairAssignment } from "./fairAssign";
import type { Group, IguardSeating, IguardSeatingZone } from "./types";

// 루트 CLAUDE.md 실수 9(★ 실제 사고) 계열 — 조 이름 매칭을 화면 기준으로 하지 않으면
// 1부·2부의 동명 조가 서로 뒤바뀐다. avoidPairs는 pinnedFront와 같은 groupKeys 매칭을
// 공유하므로(fairAssign.ts parseAvoidPairs), 매칭이 깨지면 "붙이면 안 되는 조"가 엉뚱한
// 조에 적용돼 자리 배치가 조용히 틀어진다. 아래 두 건이 그 재발을 막는다.

function makeGroup(id: string, name: string, bu = "1부"): Group {
  return { id, name, bu, teachers: [], leader: "", studentIds: [] };
}

function zonesOf(names: string[]): IguardSeatingZone[] {
  return names.map(name => ({ name, groupIds: [] }));
}

function seatWith(avoidPairs: string, zoneNames = ["1열", "2열"]): IguardSeating {
  return { id: "s1", label: "s1", day: 1, order: 0, avoidPairs, zones: zonesOf(zoneNames) };
}

function sameZone(zones: IguardSeatingZone[], a: string, b: string): boolean {
  return zones.some(z => z.groupIds.includes(a) && z.groupIds.includes(b));
}

describe("computeFairAssignment — 붙이면 안 되는 조 (avoidPairs)", () => {
  it("같은 구역에 배정된 avoidPairs 조를 서로 다른 구역으로 분리한다", () => {
    // 4개 조가 2구역이면 구역당 2조 — 분리가 없으면 1조·2조가 같은 열에 앉는다.
    const groups = ["1조", "2조", "3조", "4조"].map((n, i) => makeGroup(`g${i + 1}`, n));

    const r = computeFairAssignment(groups, [], [seatWith("1조-2조")], 0);

    expect(sameZone(r.seatings[0].zones, "g1", "g2")).toBe(false);
  });

  // 1부 1조·2조와 2부 1조·2조는 내부 name이 겹치고, 2부는 화면에 3조·4조로 보인다.
  // 화면 번호로 2부를 지목했을 때만 2부가 갈라져야 한다. 매칭이 내부 name으로 회귀하면
  // "3조"·"4조"는 어느 조와도 맞지 않아 분리 자체가 일어나지 않으므로 이 테스트가 잡아낸다.
  // (1부를 지목하는 "1조,2조"로는 잡히지 않는다 — 잘못 지목된 2부를 가르는 과정에서
  //  1부도 우연히 갈라져 통과해버린다.)
  it("1부/2부에 내부 이름이 같은 조가 있어도 avoidPairs가 화면 표시 번호로 매칭된다", () => {
    const groups = [
      makeGroup("bu1_1", "1조"), makeGroup("bu1_2", "2조"),
      makeGroup("bu2_1", "1조", "2부"), makeGroup("bu2_2", "2조", "2부"),
    ];

    const zones = computeFairAssignment(groups, [], [seatWith("3조,4조")], 0).seatings[0].zones;

    expect(sameZone(zones, "bu2_1", "bu2_2")).toBe(false);
    // 분리 과정에서 조가 유실되거나 중복 배정되지 않는다.
    expect(zones.flatMap(z => z.groupIds).sort()).toEqual(["bu1_1", "bu1_2", "bu2_1", "bu2_2"]);
  });
});
