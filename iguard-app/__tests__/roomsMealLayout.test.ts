import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("조별정보 식사순서 모바일 레이아웃", () => {
  it("모바일은 여러 줄 카드, 태블릿·PC는 한 줄 흐름을 사용한다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/RoomsView.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('className="mt-2 grid grid-cols-4 gap-1.5 sm:hidden"');
    expect(source).toContain('className="hidden min-w-0 overflow-x-auto sm:block"');
  });
});
