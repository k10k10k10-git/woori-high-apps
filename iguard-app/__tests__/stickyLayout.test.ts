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
});
