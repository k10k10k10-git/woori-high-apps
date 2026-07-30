import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("현장 화면 sticky 레이아웃 계약", () => {
  it("최상위 가로 넘침 처리가 sticky의 스크롤 기준을 가로채지 않는다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/IguardClient.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("min-h-screen overflow-x-clip");
    expect(source).not.toContain("min-h-screen overflow-x-hidden");
  });

  it("개인 큐카드의 고정 일정 영역은 상세를 접고 다시 펼칠 수 있다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/ExecutionViews.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("const [pinnedCardsCollapsed, setPinnedCardsCollapsed] = useState(false)");
    expect(source).toContain('aria-expanded={!pinnedCardsCollapsed}');
    expect(source).toContain('aria-controls="cue-card-current-details cue-card-next-details"');
    expect(source).toContain('{pinnedCardsCollapsed ? "펼치기 ▼" : "접기 ▲"}');
    expect(source).toContain("!pinnedCardsCollapsed && nextBlock");
  });

  it("전체 일정을 한 줄 밀도로 전환하고 고정 카드를 함께 접을 수 있다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/ExecutionViews.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("const [timelineCompact, setTimelineCompact] = useState(false)");
    expect(source).toContain("if (next) setPinnedCardsCollapsed(true)");
    expect(source).toContain("aria-pressed={timelineCompact}");
    expect(source).toContain('{timelineCompact ? "상세 카드로 보기" : "한눈에 보기"}');
    expect(source).toContain('담당 · {dutyLabels.join(" · ")}');
    expect(source).not.toContain("내 담당 · {selectedStaff?.name}");
  });
});
