import { describe, expect, it } from "vitest";
import {
  toMinutes,
  isNowOn,
  currentBlockFor,
  nextBlockFor,
  isOpenEndedBlock,
  compareBlocks,
  timeRangeLabel,
} from "./scheduleTime";
import type { IguardScheduleBlock } from "./types";

// 루트 CLAUDE.md 실수 규칙 7(★ 실제 사고): 큐싯의 자정 넘김 표기(24:30~25:30)를
// 단순 시:분 비교로 처리해 새벽에 모든 화면이 "일정 없음"이 됐다. scheduleTime.ts의
// 주석과 CLAUDE.md가 이 테스트를 필수 통과 조건으로 지목하지만 실제로는 없었다(2026-08-09 신설).

function block(partial: Partial<IguardScheduleBlock> & { day: number; start: string }): IguardScheduleBlock {
  return { id: `${partial.day}-${partial.start}`, label: "블록", ...partial };
}

describe("toMinutes — 24시 이상 표기", () => {
  it("일반 시각을 분으로 바꾼다", () => {
    expect(toMinutes("00:00")).toBe(0);
    expect(toMinutes("09:30")).toBe(570);
    expect(toMinutes("23:59")).toBe(1439);
  });

  it("자정을 넘긴 24~35시 표기를 그대로 받는다 — 큐싯이 쓰는 표기", () => {
    expect(toMinutes("24:30")).toBe(24 * 60 + 30);
    expect(toMinutes("25:30")).toBe(25 * 60 + 30);
    expect(toMinutes("35:59")).toBe(35 * 60 + 59);
  });

  it("열린 끝(~)과 잘못된 값은 null", () => {
    expect(toMinutes("~")).toBeNull();
    expect(toMinutes("")).toBeNull();
    expect(toMinutes(undefined)).toBeNull();
    expect(toMinutes("36:00")).toBeNull();
    expect(toMinutes("9:5")).toBeNull();
  });
});

describe("isNowOn", () => {
  const lunch = block({ day: 2, start: "12:00", end: "13:00" });

  it("같은 일차의 닫힌 블록은 시작 이상 끝 미만일 때만 '지금'", () => {
    expect(isNowOn(lunch, 2, "12:00")).toBe(true);
    expect(isNowOn(lunch, 2, "12:59")).toBe(true);
    expect(isNowOn(lunch, 2, "13:00")).toBe(false); // 끝은 배타
    expect(isNowOn(lunch, 2, "11:59")).toBe(false);
  });

  it("다른 일차면 '지금'이 아니다", () => {
    expect(isNowOn(lunch, 1, "12:30")).toBe(false);
    expect(isNowOn(lunch, 3, "12:30")).toBe(false);
  });

  it("일차를 모르면(null) 언제나 false", () => {
    expect(isNowOn(lunch, null, "12:30")).toBe(false);
  });

  it("열린 끝(~) 블록은 시작 이후 계속 '지금'", () => {
    const open = block({ day: 2, start: "22:00", end: "~" });
    expect(isOpenEndedBlock(open)).toBe(true);
    expect(isNowOn(open, 2, "23:59")).toBe(true);
    expect(isNowOn(open, 2, "21:59")).toBe(false);
  });

  // ★ 사고 재현 방지: 2일차 24:30~25:30은 달력상 3일차 새벽 00:30~01:30이다.
  it("전날의 24시+ 블록은 다음날 새벽에 '지금'으로 잡힌다", () => {
    const midnight = block({ day: 2, start: "24:30", end: "25:30" });
    expect(isNowOn(midnight, 3, "00:30")).toBe(true);
    expect(isNowOn(midnight, 3, "01:29")).toBe(true);
    expect(isNowOn(midnight, 3, "01:30")).toBe(false);
    expect(isNowOn(midnight, 3, "00:29")).toBe(false);
  });

  it("전날 블록이라도 자정을 넘기지 않으면 다음날로 넘어오지 않는다", () => {
    const evening = block({ day: 2, start: "20:00", end: "21:00" });
    expect(isNowOn(evening, 3, "20:30")).toBe(false);
  });
});

describe("currentBlockFor", () => {
  const schedule = [
    block({ day: 2, start: "20:00", end: "22:00", label: "저녁집회" }),
    block({ day: 2, start: "24:30", end: "25:30", label: "샐브" }),
    block({ day: 3, start: "07:00", end: "08:00", label: "기상" }),
  ];

  it("새벽에는 전날의 24시+ 블록을 고른다 — 새벽에 '일정 없음'이 되던 버그", () => {
    expect(currentBlockFor(schedule, 3, "00:45")?.label).toBe("샐브");
  });

  it("당일 블록 시간대에는 당일 블록을 고른다", () => {
    expect(currentBlockFor(schedule, 3, "07:30")?.label).toBe("기상");
    expect(currentBlockFor(schedule, 2, "20:30")?.label).toBe("저녁집회");
  });

  it("어디에도 걸리지 않으면 null", () => {
    expect(currentBlockFor(schedule, 3, "05:00")).toBeNull();
  });

  it("일차를 모르면 null", () => {
    expect(currentBlockFor(schedule, null, "07:30")).toBeNull();
  });

  it("전날 열린 블록은 당일 첫 블록 시작 전까지 이어진다", () => {
    const withOpen = [
      block({ day: 2, start: "23:00", end: "~", label: "취침" }),
      block({ day: 3, start: "07:00", end: "08:00", label: "기상" }),
    ];
    expect(currentBlockFor(withOpen, 3, "03:00")?.label).toBe("취침");
    expect(currentBlockFor(withOpen, 3, "07:30")?.label).toBe("기상");
  });
});

describe("정렬·표시", () => {
  it("일차 우선, 같은 일차면 시작 시각 순", () => {
    const sorted = [
      block({ day: 3, start: "07:00" }),
      block({ day: 2, start: "24:30" }),
      block({ day: 2, start: "20:00" }),
    ].sort(compareBlocks);
    expect(sorted.map(b => `${b.day} ${b.start}`)).toEqual(["2 20:00", "2 24:30", "3 07:00"]);
  });

  it("다음 블록은 현재 시각보다 늦게 시작하는 첫 블록", () => {
    const blocks = [block({ day: 1, start: "09:00" }), block({ day: 1, start: "13:00" })];
    expect(nextBlockFor(blocks, "10:00")?.start).toBe("13:00");
    expect(nextBlockFor(blocks, "14:00")).toBeNull();
  });

  it("열린 끝은 '시작~'으로 표시한다", () => {
    expect(timeRangeLabel(block({ day: 1, start: "22:00", end: "~" }))).toBe("22:00~");
    expect(timeRangeLabel(block({ day: 1, start: "12:00", end: "13:00" }))).toBe("12:00~13:00");
    expect(timeRangeLabel(block({ day: 1, start: "12:00" }))).toBe("12:00");
  });
});
