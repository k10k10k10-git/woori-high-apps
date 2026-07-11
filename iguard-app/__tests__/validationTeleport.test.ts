import { describe, it, expect } from "vitest";
import { isTeleport, overlaps } from "@/lib/validationRules";
import { IguardScheduleBlock } from "@/lib/types";

const blk = (day: number, start: string, end: string, label = ""): IguardScheduleBlock =>
  ({ id: `${day}_${start}`, day, start, end, label });

// 실측 오탐 사례(2026-07-12 QA): 취침 23:30~26:00과 간식 및 취침 24:30~27:00은 겹치지만,
// 같은 포스트(숙소 층장)면 이동이 없으므로 순간이동이 아니다.
describe("isTeleport — 같은 포스트 겹침은 순간이동이 아님", () => {
  const 취침 = blk(1, "23:30", "26:00", "취침");
  const 간식 = blk(1, "24:30", "27:00", "간식 및 취침");

  it("겹치는 시간 + 같은 포스트 → 정상 (오탐 20건의 원인)", () => {
    expect(isTeleport({ postId: "숙소층장", block: 취침 }, { postId: "숙소층장", block: 간식 })).toBe(false);
  });

  it("겹치는 시간 + 다른 포스트 → 순간이동", () => {
    expect(isTeleport({ postId: "인간가로등", block: 취침 }, { postId: "숙소층장", block: 간식 })).toBe(true);
  });

  it("겹치지 않는 시간은 포스트가 달라도 정상", () => {
    const 아침 = blk(2, "07:30", "08:30", "아침 식사");
    expect(isTeleport({ postId: "배식구", block: 아침 }, { postId: "숙소층장", block: 간식 })).toBe(false);
  });
});

describe("overlaps — 24시+ 표기 포함 겹침 판정 (현재 동작 고정)", () => {
  it("같은 일차의 24시+ 블록끼리 겹침 계산", () => {
    expect(overlaps(blk(1, "23:30", "26:00"), blk(1, "24:30", "27:00"))).toBe(true);
    expect(overlaps(blk(1, "22:30", "23:30"), blk(1, "24:30", "27:00"))).toBe(false);
  });

  it("다른 일차는 겹치지 않음 / 열린 끝(~)은 판정 제외", () => {
    expect(overlaps(blk(1, "23:30", "26:00"), blk(2, "00:30", "03:00"))).toBe(false);
    expect(overlaps(blk(1, "23:30", "~"), blk(1, "24:30", "27:00"))).toBe(false);
  });
});
