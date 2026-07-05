"use client";

import { useEffect, useState } from "react";

function isInAppBrowser(): boolean {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";
  // 카카오톡, 네이버, 인스타, 페이스북, 라인 등 주요 인앱 브라우저
  return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(ua);
}

function isAndroid(): boolean {
  if (typeof window === "undefined") return false;
  return /Android/i.test(navigator.userAgent || "");
}

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

export default function InAppBrowserGuard({ children }: { children: React.ReactNode }) {
  const [inApp, setInApp] = useState(false);

  useEffect(() => {
    if (!isInAppBrowser()) return;
    const url = window.location.href;

    // 삼성/안드로이드: intent:// 로 크롬 열기
    if (isAndroid()) {
      const intentUrl = `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end`;
      window.location.href = intentUrl;
      // intent가 안 먹힐 경우 대비 안내 표시
      setTimeout(() => setInApp(true), 1500);
      return;
    }

    // iOS: Safari로 열기 (location.href 방식)
    if (isIOS()) {
      // iOS 카카오톡은 이 방식으로 사파리가 열림
      window.location.href = url;
      setTimeout(() => setInApp(true), 1500);
      return;
    }

    setInApp(true);
  }, []);

  if (inApp) {
    const url = typeof window !== "undefined" ? window.location.href : "";
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-lg">
          <div className="mb-4 text-4xl">🌐</div>
          <h2 className="mb-2 text-lg font-bold text-slate-800">외부 브라우저에서 열어주세요</h2>
          <p className="mb-4 text-sm leading-relaxed text-slate-500">
            카카오톡 등 인앱 브라우저에서는 Google 로그인이 차단됩니다.
            <br />아래 버튼을 눌러 <strong>Chrome / Safari</strong>로 열어주세요.
          </p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mb-3 block rounded-lg bg-fuchsia-600 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-fuchsia-700"
          >
            외부 브라우저로 열기
          </a>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-400 leading-relaxed">
            <div className="font-semibold text-slate-500 mb-1">그래도 안 열리면:</div>
            <div>우측 상단 ⋮ → <strong>&quot;다른 브라우저로 열기&quot;</strong></div>
            <div>또는 링크를 복사해서 Chrome/Safari에 직접 붙여넣기</div>
          </div>
          <button
            onClick={() => { navigator.clipboard?.writeText(url); }}
            className="mt-2 text-xs text-fuchsia-600 underline"
          >
            링크 복사하기
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
