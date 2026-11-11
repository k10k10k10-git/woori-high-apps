"use client";

// 로그인 버튼 — 누르면 이메일 로그인 창(LoginDialog)을 연다. 실패 사유는 창 안에서
// 쉬운 안내로 보여 "눌러도 아무 일 없음"이 되지 않게 한다 (auth/unauthorized-domain 실사고, 2026-07-10).

import { useState } from "react";
import InAppBrowserNotice from "./InAppBrowserNotice";
import LoginDialog from "./LoginDialog";
import { isGoogleLoginEnabled } from "@/lib/supabaseAuth";

/** `signIn` 은 Google 로그인(켜졌을 때만)이다. 이메일 로그인은 창 안에서 처리한다. */
export default function LoginButton({ signIn }: { signIn?: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-center gap-3">
      {/* 앱 안 브라우저 안내는 그 브라우저가 막는 Google 로그인을 켰을 때만 띄운다.
          이메일 로그인은 카톡 안 브라우저에서도 된다. */}
      {isGoogleLoginEnabled() && <InAppBrowserNotice />}
      <button type="button" onClick={() => setOpen(true)} className="btn-primary justify-center px-5">
        로그인
      </button>
      {open && <LoginDialog onClose={() => setOpen(false)} signInWithGoogle={signIn} />}
    </div>
  );
}
