import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("조별정보 식사순서 모바일 레이아웃", () => {
  it("PC와 동일한 한 줄 흐름을 유지하고 모바일에서만 가로 스크롤·크기를 보강한다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/RoomsView.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("overflow-x-auto overscroll-x-contain");
    expect(source).toContain("text-sm text-slate-600 sm:text-xs");
    expect(source).not.toContain("grid-cols-4");
    expect(source).not.toContain("sm:hidden");
  });

  it("당일참석자와 참석 일차를 표시하고 숙소 미배정 인원에서는 제외한다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/RoomsView.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('label="당일참석"');
    expect(source).toContain('partial[id]?.type !== "당일참석"');
    expect(source).toContain("unassigned: memberSet.size - assigned.size");
  });
});
