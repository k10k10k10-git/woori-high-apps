import { describe, it, expect } from "vitest";
import {
  detectInAppBrowser,
  escapeStrategyFor,
  shouldAttemptEscape,
  ESCAPE_ATTEMPT_KEY,
} from "@/lib/inAppBrowser";

const URL_NOW = "https://iguard.example.com/retreat/abc123";

const UA = {
  iosKakao:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.5.0",
  androidKakao:
    "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 KAKAOTALK/10.5.0",
  iosInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0",
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; SM-S928N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  androidLine:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36 Line/14.0.0",
};

describe("detectInAppBrowser", () => {
  it("일반 브라우저는 인앱으로 판정하지 않는다", () => {
    expect(detectInAppBrowser(UA.iosSafari)).toBeNull();
    expect(detectInAppBrowser(UA.androidChrome)).toBeNull();
    expect(detectInAppBrowser("")).toBeNull();
  });

  it("카카오톡/인스타/라인 인앱을 판정한다", () => {
    expect(detectInAppBrowser(UA.iosKakao)).toBe("kakaotalk");
    expect(detectInAppBrowser(UA.androidKakao)).toBe("kakaotalk");
    expect(detectInAppBrowser(UA.iosInstagram)).toBe("instagram");
    expect(detectInAppBrowser(UA.androidLine)).toBe("line");
  });
});

describe("escapeStrategyFor — 무한 로딩 회귀 방지", () => {
  // 🔴 이 테스트가 이 파일의 존재 이유다.
  // 예전 코드는 iOS에서 `location.href = location.href`를 실행해 같은 페이지를 계속 리로드했고,
  // 사용자에게는 "카톡에서 열면 무한 로딩"으로 나타났다(2026-07 실사용 피드백).
  it("어떤 인앱 브라우저에서도 현재 주소로 다시 이동하지 않는다", () => {
    const uas = Object.values(UA);
    for (const ua of uas) {
      const strategy = escapeStrategyFor(ua, URL_NOW);
      if (strategy.kind !== "guide") {
        expect(strategy.targetUrl).not.toBe(URL_NOW);
      }
    }
  });

  it("iOS 카카오톡은 외부 열기 스킴을 쓴다 (현재 주소 재이동 금지)", () => {
    const strategy = escapeStrategyFor(UA.iosKakao, URL_NOW);
    expect(strategy.kind).toBe("scheme");
    if (strategy.kind !== "guide") {
      expect(strategy.targetUrl).toBe(
        `kakaotalk://web/openExternal?url=${encodeURIComponent(URL_NOW)}`
      );
      expect(strategy.targetUrl.startsWith("http")).toBe(false);
    }
  });

  it("안드로이드 인앱은 intent:// 로 크롬을 연다", () => {
    const strategy = escapeStrategyFor(UA.androidKakao, URL_NOW);
    expect(strategy.kind).toBe("intent");
    if (strategy.kind !== "guide") {
      expect(strategy.targetUrl).toBe(
        "intent://iguard.example.com/retreat/abc123#Intent;scheme=https;package=com.android.chrome;end"
      );
    }
  });

  it("자동 탈출 수단이 없는 iOS 인스타는 이동하지 않고 안내만 한다", () => {
    expect(escapeStrategyFor(UA.iosInstagram, URL_NOW)).toEqual({ kind: "guide" });
  });

  it("일반 브라우저는 안내 대상이 아니다", () => {
    expect(escapeStrategyFor(UA.iosSafari, URL_NOW)).toEqual({ kind: "guide" });
  });

  it("주소가 http(s)가 아니면 이동하지 않는다", () => {
    expect(escapeStrategyFor(UA.iosKakao, "")).toEqual({ kind: "guide" });
    expect(escapeStrategyFor(UA.iosKakao, "about:blank")).toEqual({ kind: "guide" });
  });
});

describe("shouldAttemptEscape — 세션당 1회 제한", () => {
  function memoryStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => { map.set(k, v); },
    };
  }

  it("첫 시도는 허용하고 두 번째부터는 막는다", () => {
    const storage = memoryStorage();
    expect(shouldAttemptEscape(storage)).toBe(true);
    expect(shouldAttemptEscape(storage)).toBe(false);
    expect(shouldAttemptEscape(storage)).toBe(false);
    expect(storage.getItem(ESCAPE_ATTEMPT_KEY)).toBe("1");
  });

  it("스토리지가 없거나 접근이 막혀도 시도 자체는 막지 않는다", () => {
    expect(shouldAttemptEscape(null)).toBe(true);
    const blocked = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(shouldAttemptEscape(blocked)).toBe(true);
  });
});
