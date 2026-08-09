/**
 * 인앱 브라우저 감지 및 외부 브라우저 탈출 전략 (순수 로직).
 *
 * ⚠ 이 파일이 존재하는 이유 — iOS 무한 로딩 사고(2026-07-29 수정):
 * 예전 InAppBrowserGuard는 iOS에서 `window.location.href = window.location.href`를 실행했다.
 * iOS 카카오톡 인앱 브라우저는 이 대입으로 사파리를 열지 않고 **같은 페이지를 리로드**한다.
 * → 리로드 → effect 재실행 → 또 대입 → 무한 로딩. 안내 UI를 띄우려던 setTimeout은 영원히 도달하지 못했다.
 * (실사용 피드백: "카톡에서 바로 사이트를 들어갈 때 무한 로딩 현상이 있었습니다" — 아이폰 사용자)
 *
 * 그래서 이 모듈의 핵심 불변식은 하나다:
 *   **탈출 전략의 이동 주소는 절대 현재 주소와 같을 수 없다.**
 * 같아질 수밖에 없는 상황이면 이동하지 말고 안내 UI(`guide`)로 떨어진다.
 */

export type InAppBrowserKind = "kakaotalk" | "naver" | "instagram" | "facebook" | "line" | "other";

export type EscapeStrategy =
  /** 안드로이드: intent:// 로 크롬 실행 */
  | { kind: "intent"; targetUrl: string }
  /** iOS 카카오톡: 외부 브라우저 열기 커스텀 스킴 */
  | { kind: "scheme"; targetUrl: string }
  /** 자동 탈출 수단이 없음 — 안내 UI를 즉시 보여준다 (절대 현재 주소로 이동하지 않는다) */
  | { kind: "guide" };

/** 인앱 브라우저 종류 판정. 일반 브라우저면 null. */
export function detectInAppBrowser(ua: string): InAppBrowserKind | null {
  if (!ua) return null;
  if (/KAKAOTALK/i.test(ua)) return "kakaotalk";
  if (/NAVER\(inapp/i.test(ua) || /NAVER/.test(ua)) return "naver";
  if (/Instagram/i.test(ua)) return "instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "facebook";
  if (/Line\//i.test(ua)) return "line";
  // 그 외 인앱 웹뷰 — 자동 탈출 수단은 플랫폼별로만 있고, 최소한 안내 배너는 띄워야 한다.
  if (/DaumApps|; wv\)|Snapchat|kakaostory|Whale/i.test(ua)) return "other";
  return null;
}

export function isAndroidUA(ua: string): boolean {
  return /Android/i.test(ua || "");
}

export function isIOSUA(ua: string): boolean {
  return /iPhone|iPad|iPod/i.test(ua || "");
}

/**
 * 현재 UA에서 쓸 수 있는 외부 브라우저 탈출 전략을 고른다.
 *
 * - 안드로이드: `intent://…#Intent;scheme=https;package=com.android.chrome;end`
 * - iOS 카카오톡: `kakaotalk://web/openExternal?url=…` (실패해도 페이지는 그대로 — 리로드되지 않는다)
 * - 그 외(iOS 인스타/네이버/라인, 판단 불가 플랫폼): 자동 이동 없이 `guide`
 *
 * 어떤 경우에도 `targetUrl`이 `currentUrl`과 같으면 `guide`로 강등한다 — 무한 리로드 방지 최종 방어선.
 */
export function escapeStrategyFor(ua: string, currentUrl: string): EscapeStrategy {
  const kind = detectInAppBrowser(ua);
  if (!kind) return { kind: "guide" };
  if (!currentUrl || !/^https?:\/\//i.test(currentUrl)) return { kind: "guide" };

  const strategy = pickStrategy(kind, ua, currentUrl);
  // 최종 방어선: 이동 주소가 현재 주소와 같으면 이동하지 않는다.
  if (strategy.kind !== "guide" && strategy.targetUrl === currentUrl) return { kind: "guide" };
  return strategy;
}

/** LINE이 공식 지원하는 외부 브라우저 파라미터. 이미 붙어 있으면 다시 붙이지 않는다. */
const LINE_EXTERNAL_PARAM = "openExternalBrowser=1";

function pickStrategy(kind: InAppBrowserKind, ua: string, currentUrl: string): EscapeStrategy {
  // LINE은 플랫폼과 무관하게 쿼리 파라미터로 외부 브라우저를 연다(iOS에도 스킴이 없다).
  // 이미 파라미터가 붙은 주소에 또 붙이면 매번 다른 주소가 되어 이동이 반복된다 → guide로 강등.
  if (kind === "line") {
    if (currentUrl.includes(LINE_EXTERNAL_PARAM)) return { kind: "guide" };
    const separator = currentUrl.includes("?") ? "&" : "?";
    return { kind: "scheme", targetUrl: `${currentUrl}${separator}${LINE_EXTERNAL_PARAM}` };
  }
  if (isAndroidUA(ua)) {
    const bare = currentUrl.replace(/^https?:\/\//i, "");
    return { kind: "intent", targetUrl: `intent://${bare}#Intent;scheme=https;package=com.android.chrome;end` };
  }
  if (isIOSUA(ua) && kind === "kakaotalk") {
    return { kind: "scheme", targetUrl: `kakaotalk://web/openExternal?url=${encodeURIComponent(currentUrl)}` };
  }
  // iOS 인스타/네이버/라인 등은 신뢰할 수 있는 외부 열기 스킴이 없다.
  // 현재 주소로 재이동하면 무한 로딩이 되므로 안내만 한다.
  return { kind: "guide" };
}

/** 인앱 탈출을 이미 한 번 시도했는지 기록하는 세션 키 — 재진입 시 자동 이동을 반복하지 않는다. */
export const ESCAPE_ATTEMPT_KEY = "iguard:inapp-escape-attempted";

/**
 * 세션당 자동 탈출은 1회만 허용한다.
 * 스킴이 실패해 페이지가 그대로 남거나, 외부 브라우저가 다시 이 주소로 돌아오는 경우에도
 * 자동 이동이 반복되지 않게 하는 안전장치다(무한 로딩 재발 방지).
 */
export function shouldAttemptEscape(storage: Pick<Storage, "getItem" | "setItem"> | null | undefined): boolean {
  if (!storage) return true;
  try {
    if (storage.getItem(ESCAPE_ATTEMPT_KEY)) return false;
    storage.setItem(ESCAPE_ATTEMPT_KEY, "1");
    return true;
  } catch {
    // 스토리지 접근이 막힌 인앱 환경 — 시도는 하되 기록은 못 남긴다.
    return true;
  }
}
