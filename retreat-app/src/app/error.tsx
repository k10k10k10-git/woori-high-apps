"use client";

import { useEffect } from "react";

/**
 * 런타임 에러 바운더리.
 *
 * 없으면 탭 하나에서 렌더 에러가 나는 순간 화면 전체가 죽고 복구 수단이 없다.
 * 수련회 준비·현장 중에 백지 화면을 만나면 사용자는 새로고침을 떠올리지 못하고
 * 그대로 이탈하거나 문의로 이어진다. 최소한 (1) 무슨 일인지, (2) 다시 시도,
 * (3) 홈으로 가는 길 셋을 항상 제공한다.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 로그(Vercel)에 남겨 사후 추적이 가능하게 한다.
    console.error("[행정] 화면 오류:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--color-bg)" }}>
      <div className="card card-body w-full max-w-md text-center">
        <div className="text-3xl" aria-hidden="true">⚠️</div>
        <h1 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-semi)" }}>
          화면을 불러오지 못했습니다
        </h1>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.6 }}>
          일시적인 문제일 수 있습니다. 다시 시도해도 같은 화면이 나오면
          <br />관리자에게 알려주세요.
        </p>

        {error.digest && (
          <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-faint)" }}>
            오류 코드 <span className="num">{error.digest}</span>
          </p>
        )}

        <div className="flex justify-center gap-2 pt-1">
          <button onClick={reset} className="btn-primary" style={{ minHeight: 44 }}>다시 시도</button>
          {/* 에러 바운더리의 탈출구는 의도적으로 하드 내비게이션을 쓴다.
              next/link는 클라이언트 라우팅이라 깨진 React 트리·구독 상태를 그대로
              들고 갈 수 있다. "다시 시도"(reset)가 소프트 복구를 담당하므로,
              "홈으로"는 완전히 새 문서를 받는 최후 수단으로 남긴다. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/" className="btn-secondary" style={{ minHeight: 44 }}>홈으로</a>
        </div>
      </div>
    </div>
  );
}
