import { describe, expect, it } from "vitest";
import { buildHomeActions } from "./homeActions";

describe("공유 캘린더 기반 홈 할 일", () => {
  it("완료 일정은 제외하고 지난 미완료 준비를 먼저 표시한다", () => {
    const actions = buildHomeActions([
      { id: "late", title: "늦은 준비", date: "2026-08-10", kind: "retreat", editable: true },
      { id: "done", title: "완료", date: "2026-08-09", kind: "retreat", editable: true, done: true },
      { id: "future", title: "다음 모임", date: "2026-08-12", kind: "semester" },
    ], "2026-08-11");
    expect(actions.map((item) => item.title)).toEqual(["늦은 준비", "다음 모임"]);
    expect(actions[0]).toMatchObject({ urgency: "overdue", meta: "수련회 행정 · 기한 지남" });
  });

  it("1박 2일 일정의 둘째 날은 진행 중으로 표시한다", () => {
    const actions = buildHomeActions([
      { id: "overnight", date: "2026-10-23", endDate: "2026-10-24", title: "철야기도회", kind: "semester", href: "/semester/2026-2" },
    ], "2026-10-24");
    expect(actions[0]).toMatchObject({ title: "철야기도회", urgency: "today", href: "/semester/2026-2" });
  });
});
