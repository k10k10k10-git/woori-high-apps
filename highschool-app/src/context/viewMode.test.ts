import { describe, expect, it } from "vitest";
import {
  buildDesktopFrameSrc,
  isMobileMode,
  resolveInitialViewMode,
  shouldUseDesktopFrame,
  shouldUseMobilePreview,
  stripAuthCallbackSearch,
  stripDesktopFrameSearch,
} from "./viewMode";

describe("화면 보기 모드", () => {
  it("저장된 PC 선택은 좁은 브라우저에서도 유지한다", () => {
    expect(resolveInitialViewMode("desktop", true)).toBe("desktop");
    expect(isMobileMode("desktop")).toBe(false);
    expect(shouldUseDesktopFrame("desktop", false)).toBe(true);
  });

  it("선택 기록이 없는 실제 모바일은 모바일 화면으로 시작한다", () => {
    expect(resolveInitialViewMode(null, true)).toBe("mobile");
    expect(isMobileMode("mobile")).toBe(true);
  });

  it("넓은 PC에서 모바일 선택 시에만 모바일 미리보기를 사용한다", () => {
    expect(shouldUseMobilePreview("mobile", false)).toBe(true);
    expect(shouldUseMobilePreview("desktop", false)).toBe(false);
    expect(shouldUseDesktopFrame("mobile", false)).toBe(false);
  });

  it("PC 프레임 표식은 내부 URL에만 붙이고 바깥 URL에서는 제거한다", () => {
    expect(buildDesktopFrameSrc("/semester/2026-2", "tab=attendance")).toBe(
      "/semester/2026-2?tab=attendance&__portalFrame=desktop",
    );
    expect(stripDesktopFrameSearch("?tab=attendance&__portalFrame=desktop")).toBe("?tab=attendance");
    expect(stripDesktopFrameSearch("?__portalFrame=desktop")).toBe("");
  });
});

describe("로그인 콜백 값은 틀 주소로 넘기지 않는다(바깥 창만 교환)", () => {
  it("code·error 값을 빼고 나머지는 그대로 둔다", () => {
    expect(stripAuthCallbackSearch("?tab=a&code=abc&error=x&error_code=y&error_description=z")).toBe("?tab=a");
    expect(stripAuthCallbackSearch("?code=abc")).toBe("");
    expect(buildDesktopFrameSrc("/", "code=abc&tab=a")).toBe("/?tab=a&__portalFrame=desktop");
    expect(stripAuthCallbackSearch("?q=%ED%95%9C+a")).toBe("?q=%ED%95%9C+a");
  });
});
