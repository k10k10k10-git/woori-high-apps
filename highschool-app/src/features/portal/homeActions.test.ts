import { describe, expect, it } from "vitest";
import { buildHomeActions } from "./homeActions";

describe("buildHomeActions", () => {
  it("완료 일정은 제외하고 지난 일정을 연체로 표시한다", () => {
    const actions = buildHomeActions({
      today: "2026-08-11",
      roles: { semester: "adminTeam", retreat: "adminTeam" },
      milestones: [
        { id: "late", title: "늦은 준비", targetDate: "2026-08-10", done: false },
        { id: "done", title: "완료", targetDate: "2026-08-09", done: true },
      ],
      sessions: [],
      periods: [],
      retreats: [],
    });
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ title: "늦은 준비", urgency: "overdue" });
  });

  it("다음 학기 일정과 수련회를 함께 정렬한다", () => {
    const actions = buildHomeActions({
      today: "2026-08-11",
      roles: { semester: "staff", retreat: "fieldStaff" },
      milestones: [],
      sessions: [{ id: "s1", date: "2026-08-12", type: "정규", label: "개강" }],
      semesterHref: "/semester/2026-2",
      periods: [{ id: "p1", retreatId: "winter", startDate: "2026-12-28", endDate: "2026-12-30" }],
      retreats: [{ id: "winter", name: "겨울수련회", year: 2026, sheetId: "", sheetGid: "", createdAt: 1, groupCount: 0 }],
    });
    expect(actions.map((item) => item.title)).toEqual(["개강", "겨울수련회"]);
    expect(actions[1].href).toBe("/retreat/winter/field");
  });

  it("1박 2일 회차의 둘째 날에도 현재 학기 일정으로 남긴다", () => {
    const actions = buildHomeActions({
      today: "2026-10-24",
      roles: { semester: "adminTeam", retreat: "none" },
      milestones: [],
      sessions: [{
        id: "overnight",
        date: "2026-10-23",
        endDate: "2026-10-24",
        type: "정규",
        label: "철야기도회",
      }],
      periods: [],
      retreats: [],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ title: "철야기도회", urgency: "today" });
  });
});
