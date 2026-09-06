import { describe, expect, it } from "vitest";
import { formatKoreanDate, saturdayDates, toSeoulDate } from "./terms";

describe("찬양팀 모임 날짜", () => {
  it.each(["UTC", "Asia/Seoul", "America/Los_Angeles"])("%s에서도 같은 한국 달력 토요일을 만든다", (timeZone) => {
    const original = process.env.TZ;
    try {
      process.env.TZ = timeZone;
      expect(saturdayDates("2026-08-29", "2026-09-19")).toEqual(["2026-08-29", "2026-09-05", "2026-09-12", "2026-09-19"]);
      expect(saturdayDates("2026-09-01", "2026-09-12")).toEqual(["2026-09-05", "2026-09-12"]);
      expect(saturdayDates("2026-09-05", "2026-09-05")).toEqual(["2026-09-05"]);
      expect(saturdayDates("2026-09-06", "2026-09-11")).toEqual([]);
      expect(saturdayDates("2026-12-31", "2027-01-09")).toEqual(["2027-01-02", "2027-01-09"]);
      expect(toSeoulDate(new Date("2026-09-04T15:00:00Z"))).toBe("2026-09-05");
      expect(formatKoreanDate("2026-09-05")).toBe("9월 5일");
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it("역전된 기간과 실제 존재하지 않는 날짜를 거부한다", () => {
    for (const [start, end] of [["2026-09-12", "2026-09-01"], ["2026-02-30", "2026-03-15"], ["invalid", "2026-03-15"], ["2026-1-1", "2026-03-15"]]) expect(saturdayDates(start, end)).toEqual([]);
    expect(formatKoreanDate("2026-02-30")).toBe("날짜 미정");
    expect(saturdayDates("2028-02-29", "2028-03-04")).toEqual(["2028-03-04"]);
  });
});
