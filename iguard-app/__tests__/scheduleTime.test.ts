import { describe, it, expect } from "vitest";
import {
  isNowOn, currentBlockFor, nextBlockFor, activePeriod, currentRetreatDay,
  toMinutes, compareBlocks, addDays, diffDays, timeRangeLabel, isOpenEndedBlock,
} from "@/lib/scheduleTime";
import { IguardScheduleBlock, Retreat, RetreatPeriod } from "@/lib/types";

function block(over: Partial<IguardScheduleBlock>): IguardScheduleBlock {
  return { id: "b1", day: 1, start: "09:00", end: "10:00", label: "일정", ...over };
}

describe("isNowOn — 사양 C (24시+ 새벽 블록 포함)", () => {
  it("C1: 전날 24시+ 닫힌 블록은 다음날 새벽 시각에 '지금'", () => {
    const b = block({ day: 2, start: "24:30", end: "25:30" });
    expect(isNowOn(b, 3, "00:30")).toBe(true);
    expect(isNowOn(b, 3, "01:40")).toBe(false); // 25:30 지난 뒤
    expect(isNowOn(b, 2, "00:30")).toBe(false); // 같은 날 취급이면 아님
  });

  it("C3: curDay가 null이면 항상 false", () => {
    expect(isNowOn(block({}), null, "09:30")).toBe(false);
  });

  it("C4: 같은 날 블록은 start<=now<end 반개구간", () => {
    const b = block({ start: "09:00", end: "10:00" });
    expect(isNowOn(b, 1, "09:00")).toBe(true);
    expect(isNowOn(b, 1, "09:59")).toBe(true);
    expect(isNowOn(b, 1, "10:00")).toBe(false);
  });

  it("열린 끝(~) 블록은 같은 날 start 이후 계속 '지금'", () => {
    const b = block({ start: "20:00", end: "~" });
    expect(isNowOn(b, 1, "23:50")).toBe(true);
    expect(isNowOn(b, 1, "19:59")).toBe(false);
  });

  it("end가 없는 블록은 false", () => {
    expect(isNowOn(block({ end: undefined }), 1, "09:30")).toBe(false);
  });
});

describe("currentBlockFor — 사양 C2", () => {
  it("C2: 전날 열린 끝 블록은 오늘 첫 블록 시작 전 새벽에 현재 블록으로 잡힌다", () => {
    const prevOpen = block({ id: "open", day: 2, start: "20:00", end: "~" });
    const today = block({ id: "morning", day: 3, start: "08:00", end: "09:00" });
    expect(currentBlockFor([prevOpen, today], 3, "00:30")?.id).toBe("open");
    // 오늘 블록 시간엔 오늘 블록이 이긴다
    expect(currentBlockFor([prevOpen, today], 3, "08:30")?.id).toBe("morning");
  });

  it("전날 24시+ 닫힌 블록이 새벽에 현재 블록으로 잡힌다", () => {
    const dawn = block({ id: "dawn", day: 2, start: "24:30", end: "25:30" });
    const today = block({ id: "morning", day: 3, start: "08:00", end: "09:00" });
    expect(currentBlockFor([dawn, today], 3, "00:40")?.id).toBe("dawn");
  });

  it("C3: curDay null이면 null", () => {
    expect(currentBlockFor([block({})], null, "09:30")).toBeNull();
  });
});

describe("activePeriod — 이름 매칭 / 오늘 포함 / retreat 폴백", () => {
  const retreat = { id: "r1", name: "여름수련회", year: 2026 } as Retreat;

  it("theme/label이 수련회 이름과 겹치면 그 기간을 우선한다", () => {
    const periods: RetreatPeriod[] = [
      { id: "p1", startDate: "2026-01-23", endDate: "2026-01-25", theme: "겨울수련회" },
      { id: "p2", startDate: "2026-07-24", endDate: "2026-07-26", theme: "여름수련회 1부" },
    ];
    expect(activePeriod(periods, retreat)?.id).toBe("p2");
  });

  it("매칭 기간이 없고 retreat에 날짜가 있으면 __retreat_period 폴백", () => {
    const r = { ...retreat, name: "다른행사", startDate: "2026-08-01", endDate: "2026-08-03" } as Retreat;
    expect(activePeriod([], r)?.id).toBe("__retreat_period");
  });

  it("기간도 retreat 날짜도 없으면 null", () => {
    expect(activePeriod([], { id: "r", name: "x" } as Retreat)).toBeNull();
  });
});

describe("보조 헬퍼 (현재 동작 고정)", () => {
  it("toMinutes: 정상/열린끝/이상값", () => {
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("24:30")).toBe(1470);
    expect(toMinutes("~")).toBeNull();
    expect(toMinutes(undefined)).toBeNull();
  });

  it("compareBlocks: day 우선, start 다음", () => {
    const a = block({ day: 1, start: "10:00" });
    const b = block({ day: 2, start: "08:00" });
    expect(compareBlocks(a, b)).toBeLessThan(0);
  });

  it("addDays/diffDays: 월 경계 UTC 계산", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(diffDays("2026-07-24", "2026-07-26")).toBe(2);
    expect(Number.isNaN(diffDays("bad", "2026-07-26"))).toBe(true);
  });

  it("currentRetreatDay: 기간 밖이면 null", () => {
    const periods: RetreatPeriod[] = [{ id: "p", startDate: "2000-01-01", endDate: "2000-01-03" }];
    expect(currentRetreatDay(periods, { id: "r", name: "x" } as Retreat)).toBeNull();
  });

  it("timeRangeLabel/isOpenEndedBlock", () => {
    expect(timeRangeLabel(block({ start: "09:00", end: "~" }))).toBe("09:00~");
    expect(timeRangeLabel(block({ start: "09:00", end: undefined }))).toBe("09:00");
    expect(isOpenEndedBlock(block({ end: "~" }))).toBe(true);
  });
});
