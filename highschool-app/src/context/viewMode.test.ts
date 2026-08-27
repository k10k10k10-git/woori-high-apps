import { describe, expect, it } from "vitest";
import {
  isMobileMode,
  resolveInitialViewMode,
  shouldLockDesktopViewport,
  shouldUseMobilePreview,
} from "./viewMode";

describe("화면 보기 모드", () => {
  it("저장된 PC 선택은 좁은 브라우저에서도 유지한다", () => {
    expect(resolveInitialViewMode("desktop", true)).toBe("desktop");
    expect(isMobileMode("desktop")).toBe(false);
    expect(shouldLockDesktopViewport("desktop", true)).toBe(true);
  });

  it("선택 기록이 없는 실제 모바일은 모바일 화면으로 시작한다", () => {
    expect(resolveInitialViewMode(null, true)).toBe("mobile");
    expect(isMobileMode("mobile")).toBe(true);
  });

  it("넓은 PC에서 모바일 선택 시에만 모바일 미리보기를 사용한다", () => {
    expect(shouldUseMobilePreview("mobile", false)).toBe(true);
    expect(shouldUseMobilePreview("desktop", false)).toBe(false);
    expect(shouldLockDesktopViewport("desktop", false)).toBe(false);
  });
});
