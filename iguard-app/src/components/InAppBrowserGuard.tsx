"use client";

import { useCallback, useEffect, useState } from "react";
import { detectInAppBrowser, escapeStrategyFor, shouldAttemptEscape } from "@/lib/inAppBrowser";

export default function InAppBrowserGuard({ children }: { children: React.ReactNode }) {
  const [inApp, setInApp] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ua = navigator.userAgent || "";
    if (!detectInAppBrowser(ua)) return;

    const current = window.location.href;
    setUrl(current);

    const strategy = escapeStrategyFor(ua, current);
    // 자동 이동 수단이 없거나(guide), 이미 한 번 시도한 세션이면 바로 안내 UI.
    // ⚠ 여기서 현재 주소로 재이동하면 iOS 카톡에서 무한 로딩이 된다(inAppBrowser.ts 주석 참조).
    if (strategy.kind === "guide" || !shouldAttemptEscape(safeSessionStorage())) {
      setInApp(true);
      return;
    }

    window.location.href = strategy.targetUrl;
    // 스킴/intent가 안 먹히면 페이지는 그대로 남는다 — 잠시 뒤 안내 UI로 전환.
    const timer = setTimeout(() => setInApp(true), 1500);
    return () => clearTimeout(timer);
  }, []);

  const openExternal = useCallback(() => {
    if (typeof window === "undefined") return;
    const strategy = escapeStrategyFor(navigator.userAgent || "", window.location.href);
    if (strategy.kind === "guide") return;
    window.location.href = strategy.targetUrl;
  }, []);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [url]);

  if (!inApp) return <>{children}</>;

  const canAutoOpen =
    typeof window !== "undefined" &&
    escapeStrategyFor(navigator.userAgent || "", url).kind !== "guide";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
        <div className="mb-4 text-4xl" aria-hidden="true">🌐</div>
        <h2 className="mb-2 text-lg font-bold text-slate-800">외부 브라우저에서 열어주세요</h2>
        <p className="mb-4 text-sm leading-relaxed text-slate-500">
          카카오톡 등 인앱 브라우저에서는 Google 로그인이 차단됩니다.
          <br />아래 방법으로 <strong>Chrome / Safari</strong>에서 열어주세요.
        </p>

        {canAutoOpen && (
          <button
            type="button"
            onClick={openExternal}
            className="mb-3 block w-full rounded-lg bg-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-fuchsia-700"
          >
            외부 브라우저로 열기
          </button>
        )}

        <button
          type="button"
          onClick={copyLink}
          className="block w-full rounded-lg border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm font-semibold text-fuchsia-700 hover:bg-fuchsia-100"
        >
          {copied ? "✓ 링크를 복사했어요" : "링크 복사하기"}
        </button>
        <p className="mt-2 text-xs text-slate-400" role="status" aria-live="polite">
          {copied ? "Chrome / Safari 주소창에 붙여넣어 주세요." : " "}
        </p>

        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-left text-xs leading-relaxed text-slate-400">
          <div className="mb-1 font-semibold text-slate-500">그래도 안 열리면:</div>
          <div>우측 하단(또는 상단) <strong>⋮ / 공유</strong> → <strong>&quot;다른 브라우저로 열기&quot;</strong></div>
          <div>또는 위 <strong>링크 복사하기</strong> 후 Chrome/Safari에 붙여넣기</div>
        </div>
      </div>
    </div>
  );
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
