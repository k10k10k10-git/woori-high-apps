import { describe, expect, it } from "vitest";
import { praiseFixture } from "../components/praiseTestFixtures";
import { canPlaceOnStage, placeStagePerson } from "./stageBoard";
describe("무대 직접 배치", () => {
  it("같은 사람을 중복 생성하지 않고 역할과 위치를 이동한다", () => {
    const p = praiseFixture().people[0];
    const a = placeStagePerson([], p, "SINGER", "LEFT", 0);
    const b = placeStagePerson(a, p, "CHOIR", "RIGHT", 0);
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({
      role: "CHOIR",
      side: "RIGHT",
      positionOrder: 0,
      isManual: true,
    });
    expect(a[0].role).toBe("SINGER");
  });
  it("결석·다른 부서·제외 학생을 무대에 새로 올리지 않는다", () => {
    const v = praiseFixture(),
      p = v.people[0],
      m = v.meetings[0],
      c = {
        ...v.policy!.stage,
        leaderType: "STAFF" as const,
        leaderId: "staff-1",
        staffOnly: false,
      };
    expect(canPlaceOnStage(p, "FIRST", v, m, c, [])).toBe(false);
    v.attendance[m.id] = {
      [p.id]: {
        status: "PRESENT",
        groupVersionId: "groups-1",
        revision: 1,
        updatedAt: 1,
        updatedBy: "test",
      },
    };
    expect(canPlaceOnStage(p, "FIRST", v, m, c, [])).toBe(true);
    expect(canPlaceOnStage(p, "SECOND", v, m, c, [])).toBe(false);
    expect(
      canPlaceOnStage(p, "FIRST", v, m, c, [
        { termStudentId: p.id, kind: "EXCLUDE_STAGE", department: "FIRST" },
      ]),
    ).toBe(false);
    expect(
      canPlaceOnStage(p, "FIRST", v, m, { ...c, staffOnly: true }, []),
    ).toBe(false);
  });
});
it("이동한 원래 줄의 빈 순번을 닫아 다음 수동 이동이 정상 동작한다", () => {
  const [a, b] = praiseFixture().people;
  let rows = placeStagePerson([], a, "SINGER", "LEFT", 0);
  rows = placeStagePerson(rows, b, "SINGER", "LEFT", 1);
  rows = placeStagePerson(rows, a, "CHOIR", "RIGHT", 0);
  expect(rows.find((p) => p.personId === b.id)?.positionOrder).toBe(0);
});
