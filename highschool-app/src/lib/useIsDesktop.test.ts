import { describe, expect, it, vi, afterEach } from "vitest";
import { DESKTOP_QUERY, isDesktopNow, isDesktopOnServer, useIsDesktop } from "./useIsDesktop";

// 이 훅의 존재 이유는 CSS로 숨긴 개인정보가 DOM에 남는 것을 막는 것이다.
// 그래서 검사하는 것은 "판정 계약"이다 — 경계값과 서버 기본값이 어긋나면
// 서버 HTML에 연락처가 실려 나가거나, CSS와 렌더가 서로 다른 폭에서 갈린다.

afterEach(() => vi.unstubAllGlobals());

function stubMatchMedia(matches: boolean) {
  const asked: string[] = [];
  vi.stubGlobal("window", {
    matchMedia: (query: string) => {
      asked.push(query);
      return { matches, addEventListener() {}, removeEventListener() {} };
    },
  });
  return asked;
}

describe("useIsDesktop - 개인정보가 DOM에 남지 않게 하는 판정", () => {
  it("CSS @media와 같은 768px 경계를 쓴다", () => {
    // operations-tables.css는 max-width 767px에서 데스크톱을 숨긴다. 두 값이 어긋나면
    // 한쪽 폭에서 표가 렌더되는데 CSS는 숨기거나, 그 반대가 된다.
    expect(DESKTOP_QUERY).toBe("(min-width: 768px)");
    const asked = stubMatchMedia(true);
    isDesktopNow();
    expect(asked).toEqual(["(min-width: 768px)"]);
  });

  it("서버에서는 모바일로 본다 - 서버 HTML에 데스크톱 표가 실리면 안 된다", () => {
    expect(isDesktopOnServer()).toBe(false);
  });

  it("window가 없으면 모바일", () => {
    vi.stubGlobal("window", undefined);
    expect(isDesktopNow()).toBe(false);
  });

  it("matchMedia가 없는 환경에서도 모바일로 떨어진다", () => {
    vi.stubGlobal("window", {});
    expect(isDesktopNow()).toBe(false);
  });

  it("데스크톱 폭이면 참, 모바일 폭이면 거짓", () => {
    stubMatchMedia(true);
    expect(isDesktopNow()).toBe(true);
    stubMatchMedia(false);
    expect(isDesktopNow()).toBe(false);
  });

  it("훅이 export 되어 있다", () => {
    expect(typeof useIsDesktop).toBe("function");
  });
});
