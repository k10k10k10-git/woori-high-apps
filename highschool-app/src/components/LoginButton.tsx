"use client";

// 로그인 버튼 + 실패 사유 표시 — signInWithPopup 예외가 조용히 삼켜져
// "눌러도 아무 일 없음"이 되는 것을 방지한다 (auth/unauthorized-domain 실사고, 2026-07-10).

import { useState } from "react";
import InAppBrowserNotice from "./InAppBrowserNotice";
import Link from "next/link";

const FRIENDLY: Record<string, string> = {
  "auth/unauthorized-domain":
    "이 주소에서는 로그인을 시작할 수 없습니다. 사이트 주소를 담당자에게 알려 주세요.",
  "auth/popup-blocked": "팝업이 차단되었습니다. 브라우저의 팝업 허용 후 다시 시도해주세요.",
  "auth/popup-closed-by-user": "로그인 창이 닫혔습니다. 다시 시도해주세요.",
  "auth/network-request-failed": "네트워크 오류입니다. 연결 확인 후 다시 시도해주세요.",
};

export default function LoginButton({ signIn }: { signIn: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      setError(FRIENDLY[code] ?? "로그인을 완료하지 못했습니다. 다시 시도하고, 계속되면 담당자에게 화면 주소와 발생 시간을 알려 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 카톡 등 인앱브라우저면 로그인 버튼 위에 탈출 안내가 먼저 뜬다.
          아니면 아무것도 그리지 않으므로 기존 화면은 그대로다. */}
      <InAppBrowserNotice />
      <button
        onClick={() => void handleClick()}
        disabled={busy}
        className="btn-primary justify-center px-5"
      >
        {busy ? "로그인 중…" : "Google로 로그인"}
      </button>
      {error && (
        <div className="max-w-sm text-center rounded-lg p-3 text-sm" role="alert"><p>{error}</p><Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/library/help#connection">로그인 문제 해결 방법</Link></div>
      )}
    </div>
  );
}
