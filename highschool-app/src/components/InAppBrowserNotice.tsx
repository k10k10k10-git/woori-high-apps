"use client";

// 카카오톡·네이버 등 앱 안의 브라우저에서는 구글 로그인 팝업이 막힌다.
// 교회에서 링크는 대부분 카톡으로 도므로, 이 안내가 없으면 "눌러도 무반응"으로
// 첫 관문에서 사람이 통째로 막힌다.
//
// 감지·탈출 전략은 공용 모듈(features/iguard/lib/inAppBrowser)만 쓴다. 예전에 현장
// 화면이 같은 로직을 복제해 두어 공용 모듈이 고아가 됐고, 그 사이 "이동 주소 != 현재
// 주소" 불변식과 세션 1회 가드가 복제본에만 빠져 있었다. 그래서 배너까지 여기 하나로
// 모아 로그인 화면들이 같은 것을 쓰게 한다.

import { useEffect, useSyncExternalStore } from "react";
import { detectInAppBrowser, escapeStrategyFor, shouldAttemptEscape, type InAppBrowserKind } from "@/features/iguard/lib/inAppBrowser";

/** 바깥 브라우저로 보낸다. 보낼 수단이 없으면 "guide"를 돌려 수동 안내로 넘긴다. */
export function escapeInAppBrowser(): "moved" | "guide" {
  const strategy = escapeStrategyFor(navigator.userAgent || "", window.location.href);
  if (strategy.kind === "guide") return "guide";
  window.location.href = strategy.targetUrl;
  return "moved";
}

/** 자동 탈출 수단이 없을 때의 폴백 — 주소를 복사해 직접 붙여넣게 안내한다. */
export function copyAddressFallback() {
  const url = window.location.href;
  navigator.clipboard?.writeText(url).then(
    () => alert("주소를 복사했어요. Safari나 Chrome에 붙여넣어 열어주세요."),
    () => alert("우측 상단 메뉴(···)에서 'Safari/Chrome으로 열기'를 눌러주세요."),
  );
}

/**
 * 인앱브라우저일 때만 뜨는 안내. 아니면 아무것도 그리지 않는다.
 * 자동 탈출은 세션에 1회만 시도한다(shouldAttemptEscape) — 실패하는 환경에서
 * 무한 리로드가 되면 화면을 아예 못 본다.
 */
const NO_SUBSCRIBE = () => () => {};

export default function InAppBrowserNotice() {
  // UA는 이 화면이 사는 동안 바뀌지 않는다. 그래서 구독 없는 스냅샷으로 읽는다 —
  // 서버는 null을 주므로 히드레이션이 어긋나지 않고, effect 안 setState도 필요 없다.
  const kind = useSyncExternalStore<InAppBrowserKind | null>(
    NO_SUBSCRIBE,
    () => detectInAppBrowser(navigator.userAgent || ""),
    () => null,
  );

  useEffect(() => {
    if (!kind) return;
    if (!shouldAttemptEscape(window.sessionStorage)) return;
    try { escapeInAppBrowser(); } catch { /* 실패해도 아래 배너로 안내한다 */ }
  }, [kind]);

  if (!kind) return null;

  return (
    <div role="alert" className="mx-auto mb-5 max-w-sm rounded-xl border border-amber-300 bg-amber-50 p-4 text-center text-xs text-amber-900">
      <strong>앱 안의 브라우저</strong>에서는 구글 로그인이 막힙니다.
      <button
        type="button"
        onClick={() => { if (escapeInAppBrowser() === "guide") copyAddressFallback(); }}
        className="btn-primary mb-1 mt-3 w-full justify-center"
      >
        크롬/사파리로 열기
      </button>
      <span className="block text-[11px] text-amber-700">
        {kind === "other"
          ? "버튼이 안 되면 우측 상단 ··· → '다른 브라우저로 열기'를 눌러주세요."
          : "자동 전환이 안 되면 위 버튼을 눌러주세요."}
      </span>
    </div>
  );
}
