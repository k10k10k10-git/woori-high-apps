"use client";

// 로그인 버튼 + 실패 사유 표시 — signInWithPopup 예외가 조용히 삼켜져
// "눌러도 아무 일 없음"이 되는 것을 방지한다 (auth/unauthorized-domain 실사고, 2026-07-10).

import { useState } from "react";

const FRIENDLY: Record<string, string> = {
  "auth/unauthorized-domain":
    "이 도메인이 Firebase 승인 도메인에 등록되지 않았습니다. 관리자에게 문의하세요 (Authentication → Settings → Authorized domains).",
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
      setError(FRIENDLY[code] ?? `로그인 실패: ${code || (e instanceof Error ? e.message : String(e))}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        onClick={() => void handleClick()}
        disabled={busy}
        className="btn-primary justify-center px-5"
      >
        {busy ? "로그인 중…" : "Google로 로그인"}
      </button>
      {error && (
        <p className="max-w-sm text-center bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          ⚠ {error}
        </p>
      )}
    </div>
  );
}
