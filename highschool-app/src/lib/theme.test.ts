import { describe, expect, it } from "vitest";
import { isTheme, resolveTheme } from "./theme";

describe("theme", () => {
  it("저장된 명시적 테마를 우선한다", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("저장값이 없거나 잘못되면 기기 설정을 따른다", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("sepia", false)).toBe("light");
  });

  it("지원하는 두 테마만 유효하게 판정한다", () => {
    expect(isTheme("light")).toBe(true);
    expect(isTheme("dark")).toBe(true);
    expect(isTheme("system")).toBe(false);
  });
});
