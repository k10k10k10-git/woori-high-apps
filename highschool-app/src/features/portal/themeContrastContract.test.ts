import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("라이트·다크 공통 대비 계약", () => {
  it("헤더 배지는 배경용 primary-light가 아니라 전용 글자 토큰을 쓴다", () => {
    const files = [
      "src/app/semester/[id]/SemesterClient.tsx",
      "src/app/retreat/[id]/RetreatPageClient.tsx",
      "src/app/retreat/[id]/field/IguardClient.tsx",
    ];
    for (const file of files) {
      expect(source(file)).toContain("var(--color-badge-text)");
      expect(source(file)).not.toContain('color: "var(--color-primary-light)"');
    }
  });

  it("다크 모드에서 200단계 상태 배경과 반투명 휴강 배경을 어두운 면으로 재매핑한다", () => {
    const css = source("src/app/globals.css") + source("src/app/theme-compat.css");
    expect(css).toContain(".bg-amber-50\\/60");
    expect(css).toContain(".bg-blue-200");
    expect(css).toContain(".bg-orange-200");
    expect(css).toContain(".bg-red-200");
    expect(css).toContain(".bg-green-200");
    expect(css).toContain(".bg-purple-200");
  });

  it("기본·비활성 버튼은 테마별 대비 글자 토큰을 사용한다", () => {
    const css = source("src/app/globals.css");
    expect(css).toContain("--color-primary-contrast:");
    expect(css).toContain("--color-primary-disabled-text:");
    expect(css).toContain("color: var(--color-primary-contrast)");
    expect(css).toContain("color: var(--color-primary-disabled-text)");
  });
});
