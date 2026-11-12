"use client";

// 로그인 버튼. Google 로그인이 켜져 있으면(운영, 2026-11-12 사용자 결정 "구글로 로그인만 남겨줘")
// 이관 전처럼 "Google로 로그인" 단추 하나만 보이고 누르면 바로 Google 로 간다. 꺼져 있을 때만
// 이메일 코드·비밀번호 창(LoginDialog)을 연다. 실패 사유는 쉬운 안내로 보여 "눌러도 아무 일 없음"이
// 되지 않게 한다 (auth/unauthorized-domain 실사고, 2026-07-10).

import { useState } from "react";
import Link from "next/link";
import InAppBrowserNotice from "./InAppBrowserNotice";
import LoginDialog, { friendlyLoginError } from "./LoginDialog";
import { isGoogleLoginEnabled, signInWithGoogle } from "@/lib/supabaseAuth";

export default function LoginButton({ signIn }: { signIn?: () => Promise<void> }) {
  if (isGoogleLoginEnabled()) return <GoogleLoginButton signIn={signIn ?? signInWithGoogle} />;
  return <EmailLoginButton signIn={signIn} />;
}

function GoogleLoginButton({ signIn }: { signIn: () => Promise<void> }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (cause) {
      setError(friendlyLoginError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      {/* 카톡 등 앱 안 브라우저는 Google 이 로그인을 막으므로 바깥 브라우저로 여는 안내가 먼저 뜬다. */}
      <InAppBrowserNotice />
      <button type="button" onClick={() => void handleClick()} disabled={busy} className="btn-primary justify-center px-5">
        {busy ? "로그인 중…" : "Google로 로그인"}
      </button>
      {error && (
        <div className="max-w-sm rounded-lg p-3 text-center text-sm" role="alert">
          <p>{error}</p>
          <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/library/help#connection">로그인 문제 해결 방법</Link>
        </div>
      )}
    </div>
  );
}

/** Google 로그인이 꺼져 있을 때: 이메일 코드·비밀번호 로그인 창을 연다. */
function EmailLoginButton({ signIn }: { signIn?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3">
      <button type="button" onClick={() => setOpen(true)} className="btn-primary justify-center px-5">
        로그인
      </button>
      {open && <LoginDialog onClose={() => setOpen(false)} signInWithGoogle={signIn} />}
    </div>
  );
}
