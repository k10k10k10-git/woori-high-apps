import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("375px 모바일 가독성 계약", () => {
  it("주요 내비게이션과 헤더 동작은 최소 40px 이상의 터치 영역을 제공한다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/IguardClient.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("min-h-10 min-w-10");
    expect(source).toContain("min-h-11 rounded-t-lg");
    expect(source).toContain("min-h-11 whitespace-nowrap");
    expect(source).toContain("min-h-14 rounded-lg");
    expect(source).toContain("text-xs font-semibold");
  });

  it("개인 큐카드의 접기·상세 동작은 작은 화면에서도 누르기 쉬운 높이를 유지한다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/ExecutionViews.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("min-h-10 rounded-lg");
    expect(source).toContain("min-h-9 shrink-0");
    expect(source).toContain("text-xs font-semibold opacity-70");
  });

  it("인원체크의 핵심 탭은 40px, 보조 정보는 10px보다 작아지지 않는다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/ChecklistView.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("min-h-10 rounded-md");
    expect(source).toContain("text-[11px] leading-snug");
    expect(source).toContain("text-[10px] leading-snug");
    expect(source).not.toContain('text-[9px] leading-tight text-fuchsia-400');
  });
});
