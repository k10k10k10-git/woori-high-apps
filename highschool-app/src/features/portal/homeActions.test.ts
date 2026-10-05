import { describe, expect, it } from "vitest";
import { buildHomeActions, homeActionDayLabel } from "./homeActions";

describe("공유 캘린더 기반 홈 할 일", () => {
  it("완료 일정은 제외하고 지난 미완료 준비를 먼저 표시한다", () => {
    const actions = buildHomeActions([
      { id: "late", title: "늦은 준비", date: "2026-08-10", kind: "retreat", editable: true },
      { id: "done", title: "완료", date: "2026-08-09", kind: "retreat", editable: true, done: true },
      { id: "future", title: "다음 모임", date: "2026-08-12", kind: "semester" },
    ], "2026-08-11");
    expect(actions.map((item) => item.title)).toEqual(["늦은 준비", "다음 모임"]);
    expect(actions[0]).toMatchObject({ urgency: "overdue", meta: "수련회 행정 · 기한 지남" });
    expect(actions.map((item) => item.dayLabel)).toEqual(["D+1", "D-1"]);
  });

  it("1박 2일 일정의 둘째 날은 진행 중으로 표시한다", () => {
    const actions = buildHomeActions([
      { id: "overnight", date: "2026-10-23", endDate: "2026-10-24", title: "철야기도회", kind: "semester", href: "/semester/2026-2" },
    ], "2026-10-24");
    expect(actions[0]).toMatchObject({ title: "철야기도회", urgency: "today", dayLabel: "D-Day", href: "/semester/2026-2" });
  });

  it("예정·당일·지난 일정을 D-숫자, D-Day, D+숫자로 표시한다", () => {
    expect(homeActionDayLabel({ date: "2026-08-29" }, "2026-08-21")).toBe("D-8");
    expect(homeActionDayLabel({ date: "2026-08-21" }, "2026-08-21")).toBe("D-Day");
    expect(homeActionDayLabel({ date: "2026-08-18" }, "2026-08-21")).toBe("D+3");
  });
});

it("휴강 공지는 달력에 남아 있어도 해야 할 업무로 표시하지 않는다", () => {
  expect(buildHomeActions([{ id: "holiday", title: "휴강", date: "2026-10-10", kind: "semester", noticeOnly: true }], "2026-10-05")).toEqual([]);
});
