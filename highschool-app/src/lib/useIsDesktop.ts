"use client";

import { useSyncExternalStore } from "react";

/**
 * 데스크톱 폭인지 판정한다. CSS `@media`와 같은 경계(768px)를 쓴다.
 *
 * 왜 CSS로 숨기지 않고 이 훅으로 **렌더 자체를 가르는가** —
 * `display: none`은 화면에서만 감출 뿐 마크업은 DOM에 그대로 남는다. 연락처처럼
 * 감춰야 할 값이 들어 있으면 휴대폰에서도 DOM·스크린리더·확장프로그램에 그대로 노출된다.
 * 보이지 않는 것과 없는 것은 다르다.
 *
 * 서버 스냅샷은 **모바일(false)** 이다. 서버 HTML에 데스크톱 표가 실려 나가면
 * 그 안의 값이 첫 응답에 그대로 포함되므로, 확실한 쪽을 기본값으로 둔다.
 */
export const DESKTOP_QUERY = "(min-width: 768px)";

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const media = window.matchMedia(DESKTOP_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function isDesktopNow(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(DESKTOP_QUERY).matches;
}

export function isDesktopOnServer(): boolean {
  return false;
}

export function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribe, isDesktopNow, isDesktopOnServer);
}
