"use client";
import { useEffect, useState } from "react";

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5분

export default function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const current = process.env.NEXT_PUBLIC_BUILD_ID;
    if (!current) return;

    let cancelled = false;
    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        const data = await res.json();
        if (!cancelled && data.buildId && data.buildId !== current) setShow(true);
      } catch {
        // 네트워크 오류는 무시 — 다음 폴링에서 재시도
      }
    }

    check();
    const interval = setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] flex items-center justify-center gap-3 px-4 py-2.5 text-sm text-white shadow-lg"
      style={{ background: "var(--color-header-bg)" }}>
      <span>새 버전이 있습니다. 새로고침하면 최신 버전으로 전환됩니다.</span>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1 rounded-lg font-semibold text-xs transition-colors"
        style={{ background: "var(--color-primary)" }}
      >
        새로고침
      </button>
    </div>
  );
}
