import { describe, expect, it } from "vitest";
import { cueTimelineListBlocks, cueTimelineScrollTop, cueTimelineWindow } from "@/lib/cueCardTimeline";
import { type IguardScheduleBlock } from "@/lib/types";

function block(id: string, day: number, start: string, end: string, label = id): IguardScheduleBlock {
  return { id, day, start, end, label };
}

const schedule = [
  block("prepare", 1, "13:30", "14:00", "기도회 및 등록 준비"),
  block("register", 1, "14:00", "15:00", "등록"),
  block("travel", 1, "15:00", "16:00", "출발 및 도착"),
  block("opening", 1, "16:00", "17:00", "개회집회 및 OT"),
  block("morning", 2, "07:00", "08:00", "기상"),
];

describe("cueTimelineWindow — 개인 큐카드 고정 일정", () => {
  it("현재 일정 다음 하나를 고정하고 일반 목록은 그 다음부터 시작한다", () => {
    const result = cueTimelineWindow(schedule, "register", 1, "14:30", "active");
    expect(result.nextBlock?.id).toBe("travel");
    expect(result.remainingBlocks.map(item => item.id)).toEqual(["opening", "morning"]);
  });

  it("일정 사이 공백에서도 가장 가까운 미래 일정을 다음 고정 카드로 사용한다", () => {
    const result = cueTimelineWindow(schedule, null, 1, "14:30", "active");
    expect(result.nextBlock?.id).toBe("travel");
    expect(result.remainingBlocks[0]?.id).toBe("opening");
  });

  it("수련회 시작 전에는 첫 일정을 다음 고정 카드로 사용한다", () => {
    const result = cueTimelineWindow(schedule, null, null, "12:00", "before");
    expect(result.nextBlock?.id).toBe("prepare");
    expect(result.remainingBlocks[0]?.id).toBe("register");
  });

  it("수련회 종료 후에는 지난 일정을 일반 목록에 다시 노출하지 않는다", () => {
    expect(cueTimelineWindow(schedule, null, null, "12:00", "after")).toEqual({
      nextBlock: null,
      remainingBlocks: [],
    });
  });

  it("기간 설정이 없으면 기존처럼 전체 목록을 보존한다", () => {
    const result = cueTimelineWindow(schedule, null, null, "12:00", "unknown");
    expect(result.nextBlock).toBeNull();
    expect(result.remainingBlocks.map(item => item.id)).toEqual(schedule.map(item => item.id));
  });

  it("24시 이후 일정도 현재 블록 다음 순서로 정확히 이어진다", () => {
    const overnight = [
      block("night", 2, "24:30", "25:30"),
      block("day3", 3, "08:00", "09:00"),
    ];
    const result = cueTimelineWindow(overnight, "night", 3, "00:40", "active");
    expect(result.nextBlock?.id).toBe("day3");
    expect(result.remainingBlocks).toEqual([]);
  });

  it("진행 중에는 전체 일정을 남겨 위로 스크롤하면 지난 일정을 볼 수 있다", () => {
    const remaining = schedule.slice(3);
    expect(cueTimelineListBlocks(schedule, remaining, "active").map(item => item.id)).toEqual(
      schedule.map(item => item.id),
    );
    expect(cueTimelineListBlocks(schedule, remaining, "before").map(item => item.id)).toEqual(
      remaining.map(item => item.id),
    );
  });

  it("최초 위치는 헤더와 고정 카드 높이를 제외해 계산한다", () => {
    expect(cueTimelineScrollTop(1200, 100, 300)).toBe(792);
    expect(cueTimelineScrollTop(200, 100, 300)).toBe(0);
  });
});
