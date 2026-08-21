import { describe, expect, it } from "vitest";
import {
  normalizedSessionEndDate,
  sessionDateLabel,
  sessionDateRangeError,
  sessionDayLabel,
  sessionIncludesDate,
} from "./sessionDate";

describe("학기 회차 날짜 범위", () => {
  it("기존 단일 날짜 회차를 그대로 표시한다", () => {
    expect(sessionDateRangeError("2026-10-24")).toBeNull();
    expect(sessionDateLabel({ date: "2026-10-24" })).toBe("2026-10-24");
    expect(sessionDayLabel({ date: "2026-10-24" })).toBe("24");
  });

  it("1박 2일 회차를 하나의 날짜 범위로 표시한다", () => {
    const session = { date: "2026-10-23", endDate: "2026-10-24" };
    expect(sessionDateRangeError(session.date, session.endDate)).toBeNull();
    expect(sessionDateLabel(session)).toBe("2026-10-23 ~ 2026-10-24");
    expect(sessionDayLabel(session)).toBe("23~24");
    expect(sessionIncludesDate(session, "2026-10-24")).toBe(true);
  });

  it("종료일 역전은 막고 같은 날 종료일은 저장하지 않는다", () => {
    expect(sessionDateRangeError("2026-10-24", "2026-10-23")).toBe("종료일은 시작일보다 빠를 수 없습니다");
    expect(normalizedSessionEndDate("2026-10-24", "2026-10-24")).toBeUndefined();
  });
});
