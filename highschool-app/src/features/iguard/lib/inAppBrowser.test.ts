import { describe, expect, it } from "vitest";
import {
  detectInAppBrowser,
  escapeStrategyFor,
  shouldAttemptEscape,
  ESCAPE_ATTEMPT_KEY,
} from "./inAppBrowser";

// 2026-07-29 실제 사고: iOS 카카오톡에서 `location.href = location.href`를 실행해
// 사파리가 열리는 대신 같은 페이지가 리로드 → effect 재실행 → 무한 로딩.
// 이 모듈의 불변식은 하나다 — **이동 주소는 절대 현재 주소와 같을 수 없다.**

const URL_PLAIN = "https://woorihigh-app.vercel.app/field";
const UA = {
  iosKakao: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) KAKAOTALK/10.0.0",
  androidKakao: "Mozilla/5.0 (Linux; Android 14) KAKAOTALK/10.0.0",
  iosLine: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Line/13.0.0",
  androidLine: "Mozilla/5.0 (Linux; Android 14) Line/13.0.0",
  iosInstagram: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Instagram 300.0",
  androidNaver: "Mozilla/5.0 (Linux; Android 14) NAVER(inapp; search; 1000; 12.0)",
  daum: "Mozilla/5.0 (Linux; Android 14) DaumApps/1.0",
  safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Safari/605.1.15",
};

describe("detectInAppBrowser", () => {
  it.each([
    ["iosKakao", "kakaotalk"],
    ["androidLine", "line"],
    ["iosInstagram", "instagram"],
    ["androidNaver", "naver"],
    ["daum", "other"],
  ] as const)("%s → %s", (key, expected) => {
    expect(detectInAppBrowser(UA[key])).toBe(expected);
  });

  it("일반 브라우저와 빈 UA는 null", () => {
    expect(detectInAppBrowser(UA.safari)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
  });
});

describe("escapeStrategyFor — 무한 리로드 방지", () => {
  it("iOS 카카오톡은 외부 열기 스킴으로 나간다 (현재 주소로 재이동하지 않는다)", () => {
    const strategy = escapeStrategyFor(UA.iosKakao, URL_PLAIN);
    expect(strategy.kind).toBe("scheme");
    if (strategy.kind !== "guide") {
      expect(strategy.targetUrl).toContain("kakaotalk://web/openExternal");
      expect(strategy.targetUrl).not.toBe(URL_PLAIN);
    }
  });

  it("안드로이드는 intent://로 크롬을 연다", () => {
    const strategy = escapeStrategyFor(UA.androidKakao, URL_PLAIN);
    expect(strategy.kind).toBe("intent");
    if (strategy.kind !== "guide") {
      expect(strategy.targetUrl).toMatch(/^intent:\/\/.*package=com\.android\.chrome;end$/);
      expect(strategy.targetUrl).not.toBe(URL_PLAIN);
    }
  });

  it("LINE은 플랫폼과 무관하게 openExternalBrowser=1을 붙인다", () => {
    for (const ua of [UA.iosLine, UA.androidLine]) {
      const strategy = escapeStrategyFor(ua, URL_PLAIN);
      expect(strategy.kind).toBe("scheme");
      if (strategy.kind !== "guide") {
        expect(strategy.targetUrl).toBe(`${URL_PLAIN}?openExternalBrowser=1`);
      }
    }
  });

  it("LINE 파라미터가 이미 붙어 있으면 또 붙이지 않고 안내로 떨어진다", () => {
    // 계속 붙이면 매번 다른 주소가 되어 이동이 무한 반복된다
    expect(escapeStrategyFor(UA.iosLine, `${URL_PLAIN}?openExternalBrowser=1`).kind).toBe("guide");
  });

  it("기존 쿼리가 있으면 &로 이어 붙인다", () => {
    const strategy = escapeStrategyFor(UA.iosLine, `${URL_PLAIN}?a=1`);
    if (strategy.kind !== "guide") expect(strategy.targetUrl).toBe(`${URL_PLAIN}?a=1&openExternalBrowser=1`);
  });

  it("iOS 인스타/네이버처럼 믿을 만한 스킴이 없으면 이동하지 않고 안내한다", () => {
    expect(escapeStrategyFor(UA.iosInstagram, URL_PLAIN).kind).toBe("guide");
  });

  it("일반 브라우저는 안내조차 필요 없다(guide)", () => {
    expect(escapeStrategyFor(UA.safari, URL_PLAIN).kind).toBe("guide");
  });

  it("http(s)가 아닌 주소면 이동하지 않는다", () => {
    expect(escapeStrategyFor(UA.iosKakao, "about:blank").kind).toBe("guide");
    expect(escapeStrategyFor(UA.iosKakao, "").kind).toBe("guide");
  });

  it("어떤 조합에서도 이동 주소가 현재 주소와 같아지지 않는다", () => {
    for (const ua of Object.values(UA)) {
      for (const url of [URL_PLAIN, `${URL_PLAIN}?a=1`, `${URL_PLAIN}?openExternalBrowser=1`]) {
        const strategy = escapeStrategyFor(ua, url);
        if (strategy.kind !== "guide") expect(strategy.targetUrl).not.toBe(url);
      }
    }
  });
});

describe("shouldAttemptEscape — 세션당 1회", () => {
  function memoryStorage(seed: Record<string, string> = {}) {
    const store = { ...seed };
    return {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
    };
  }

  it("처음 한 번만 true", () => {
    const storage = memoryStorage();
    expect(shouldAttemptEscape(storage)).toBe(true);
    expect(shouldAttemptEscape(storage)).toBe(false);
  });

  it("이미 시도 기록이 있으면 false", () => {
    expect(shouldAttemptEscape(memoryStorage({ [ESCAPE_ATTEMPT_KEY]: "1" }))).toBe(false);
  });

  it("스토리지가 없거나 막혀 있으면 시도는 허용한다", () => {
    expect(shouldAttemptEscape(null)).toBe(true);
    expect(shouldAttemptEscape({
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    })).toBe(true);
  });
});
