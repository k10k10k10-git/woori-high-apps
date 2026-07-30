import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGbsPlaceSummaries, effectiveGbsPlace, gbsPlacesForStaff } from "@/lib/gbsPlaces";
import { paths } from "@/lib/paths";
import type { Group, IguardGbsPlace } from "@/lib/types";

const groups: Group[] = [
  {
    id: "g1", name: "1조", bu: "1부", teachers: [], leader: "",
    studentIds: [], gbs: "행정 기존 장소", staff: "김민수sf",
  },
  {
    id: "g2", name: "2조", bu: "1부", teachers: [], leader: "",
    studentIds: [],
  },
  {
    id: "g3", name: "3조", bu: "2부", teachers: [], leader: "",
    studentIds: [],
  },
];

const gbs: Record<string, IguardGbsPlace> = {
  g1: { groupId: "g1", place: "숙소동 131호" },
  g2: { groupId: "g2", place: "숙소동 131호" },
  g3: { groupId: "g3", place: "대강당" },
};

describe("GBS 장소 파생", () => {
  it("이가드 값을 행정 레거시 gbs보다 우선하고, 없을 때만 폴백한다", () => {
    expect(effectiveGbsPlace(groups[0], gbs)).toBe("숙소동 131호");
    expect(effectiveGbsPlace(groups[0], {})).toBe("행정 기존 장소");
  });

  it("장소별 조 목록을 저장하지 않고 조별 값에서 역방향으로 묶는다", () => {
    expect(buildGbsPlaceSummaries(groups, gbs)).toEqual([
      {
        place: "대강당",
        groups: [{ id: "g3", label: "5조", bu: "2부" }],
      },
      {
        place: "숙소동 131호",
        groups: [
          { id: "g1", label: "1조", bu: "1부" },
          { id: "g2", label: "2조", bu: "1부" },
        ],
      },
    ]);
  });

  it("개인 큐카드는 ID 배정과 레거시 이름 배정 모두에서 담당 조 장소를 찾는다", () => {
    expect(gbsPlacesForStaff("staff-2", "다른사람", groups, { g2: ["staff-2"] }, gbs))
      .toEqual([{ place: "숙소동 131호", groups: [{ id: "g2", label: "2조", bu: "1부" }] }]);
    expect(gbsPlacesForStaff("legacy", "김민수", groups, {}, gbs))
      .toEqual([{ place: "숙소동 131호", groups: [{ id: "g1", label: "1조", bu: "1부" }] }]);
  });
});

describe("GBS 장소 인프라 계약", () => {
  it("이가드 소유 경로 아래 조 단위 경로만 사용한다", () => {
    expect(paths.iguardGbs("retreat-1")).toBe("retreats/retreat-1/iguard/gbs");
    expect(paths.iguardGbsGroup("retreat-1", "group-1"))
      .toBe("retreats/retreat-1/iguard/gbs/group-1");
  });

  it("구독 오류를 중앙 훅에 전달하고 조 한 건만 저장한다", () => {
    const dbSource = readFileSync(new URL("../src/lib/db.ts", import.meta.url), "utf8");
    const hookSource = readFileSync(new URL("../src/hooks/useRetreatData.ts", import.meta.url), "utf8");

    expect(dbSource).toContain("export function subscribeToIguardGbs(");
    expect(dbSource).toContain('console.warn("subscribeToIguardGbs error:", error); onError?.(error);');
    expect(dbSource).toContain("paths.iguardGbsGroup(retreatId, groupId)");
    expect(hookSource).toContain('ready("gbs")');
    expect(hookSource).toContain('fail("gbs")');
  });
});
