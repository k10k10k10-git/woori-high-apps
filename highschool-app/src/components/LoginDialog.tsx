"use client";

// 이메일 로그인 창 — 6자리 코드(메일함이 있는 계정) 또는 비밀번호(@woorihigh.com 등).
// 실패 사유는 코드별 쉬운 안내로 바꾸고 원문은 보이지 않는다(2026-07-10 "눌러도 무반응" 사고 교훈 유지).

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { X } from "@phosphor-icons/react";
import OverlayShell from "./OverlayShell";
import { isMailboxlessEmail, isValidEmail, MAILBOXLESS_DOMAIN, normalizeEmail } from "@/lib/accountEmail";
import { isGoogleLoginEnabled, sendEmailCode, signInWithEmailPassword, signInWithGoogle, verifyEmailCode } from "@/lib/supabaseAuth";

const FRIENDLY: Record<string, string> = {
  "auth/invalid-credential": "이메일 또는 비밀번호가 맞지 않습니다. 다시 확인해 주세요.",
  "auth/email-not-confirmed": "아직 확인되지 않은 계정입니다. 이메일 코드로 로그인해 주세요.",
  "auth/invalid-code": "코드가 맞지 않거나 시간이 지났습니다. 새 코드를 받아 다시 입력해 주세요.",
  "auth/too-many-requests": "요청이 너무 많습니다. 1분쯤 뒤에 다시 시도해 주세요.",
  "auth/user-disabled": "사용이 중지된 계정입니다. 통합관리자에게 문의해 주세요.",
  "auth/signup-disabled": "이 이메일로는 새 계정을 만들 수 없습니다. 담당자에게 문의해 주세요.",
  "auth/invalid-email": "이메일 주소를 다시 확인해 주세요.",
  "auth/mailboxless-email": `@${MAILBOXLESS_DOMAIN} 계정은 코드를 받을 수 없습니다. 비밀번호로 로그인해 주세요.`,
  "auth/operation-not-allowed": "이 로그인 방법은 지금 쓸 수 없습니다. 다른 방법으로 로그인해 주세요.",
  "auth/network-request-failed": "네트워크 오류입니다. 연결 확인 후 다시 시도해주세요.",
  "auth/not-configured": "로그인 설정이 아직 끝나지 않았습니다. 담당자에게 알려 주세요.",
  // 2026-07-10 실사고: 허용되지 않은 주소에서 Google 로그인이 막히면 사람이 할 일(주소 알리기)을 안내한다.
  "auth/unauthorized-domain": "이 주소에서는 로그인을 시작할 수 없습니다. 사이트 주소를 담당자에게 알려 주세요.",
};
const FALLBACK = "로그인을 완료하지 못했습니다. 다시 시도하고, 계속되면 담당자에게 화면 주소와 발생 시간을 알려 주세요.";

type Mode = "code" | "password";

export default function LoginDialog({ onClose, signInWithGoogle: google = signInWithGoogle }: {
  onClose: () => void;
  signInWithGoogle?: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pickedMode, setPickedMode] = useState<Mode>("code");
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 메일함이 없는 계정은 사용자가 코드를 골라도 비밀번호 단계로 보인다(렌더 중 파생).
  const mailboxless = isMailboxlessEmail(email);
  const mode: Mode = mailboxless ? "password" : pickedMode;
  const codeSent = codeSentTo !== null && codeSentTo === normalizeEmail(email);
  const locked = busy || done;

  async function run(action: () => Promise<void>, onSuccess: () => void) {
    if (locked) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      onSuccess();
    } catch (cause) {
      const key = (cause as { code?: string })?.code ?? "";
      setError(FRIENDLY[key] ?? FALLBACK);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isValidEmail(email)) {
      setError(FRIENDLY["auth/invalid-email"]);
      return;
    }
    if (mode === "password") {
      if (!password) { setError("비밀번호를 입력해 주세요."); return; }
      void run(() => signInWithEmailPassword(email, password), () => setDone(true));
    } else if (!codeSent) {
      void run(() => sendEmailCode(email), () => { setCodeSentTo(normalizeEmail(email)); setCode(""); });
    } else {
      if (!/^\d{6,10}$/.test(code.trim())) { setError("메일로 받은 숫자 코드를 입력해 주세요."); return; }
      void run(() => verifyEmailCode(email, code), () => setDone(true));
    }
  }

  const pick = (next: Mode) => { setPickedMode(next); setError(null); };
  const submitLabel = mode === "password" ? "로그인" : codeSent ? "확인" : "코드 받기";

  return (
    <OverlayShell label="로그인" onClose={() => { if (!busy) onClose(); }} closeOnBackdrop={!busy} panelClassName="w-full max-w-sm">
      <div className="modal-card w-full rounded-2xl bg-white p-5 text-left shadow-xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold">로그인</h2>
          <button type="button" onClick={onClose} disabled={busy} className="compact-icon-control text-slate-500 hover:bg-slate-100" aria-label="닫기"><X aria-hidden="true" size={17} weight="bold" /></button>
        </div>
        <p className="text-sm text-slate-500">고등부에 등록한 이메일로 로그인합니다.</p>

        <div className="mt-4 grid grid-cols-2 gap-2" role="group" aria-label="로그인 방법">
          <button type="button" aria-pressed={mode === "code"} disabled={locked || mailboxless} onClick={() => pick("code")} className={mode === "code" ? "btn-primary justify-center" : "btn-secondary justify-center"}>이메일 코드</button>
          <button type="button" aria-pressed={mode === "password"} disabled={locked} onClick={() => pick("password")} className={mode === "password" ? "btn-primary justify-center" : "btn-secondary justify-center"}>비밀번호</button>
        </div>

        <form className="mt-4 grid gap-3" onSubmit={submit} noValidate>
          <label className="grid gap-1 text-sm font-medium">
            이메일
            <input className="input" type="email" inputMode="email" autoComplete="email" data-autofocus value={email} disabled={locked}
              onChange={(event) => { setEmail(event.target.value); setError(null); }} placeholder="example@gmail.com" />
          </label>
          {mailboxless && <p className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">@{MAILBOXLESS_DOMAIN} 계정은 메일함이 없어 코드를 받을 수 없습니다. 통합관리자가 정해 준 비밀번호로 로그인해 주세요.</p>}

          {mode === "password" && (
            <label className="grid gap-1 text-sm font-medium">
              비밀번호
              <input className="input" type="password" autoComplete="current-password" value={password} disabled={locked}
                onChange={(event) => { setPassword(event.target.value); setError(null); }} />
            </label>
          )}

          {mode === "code" && !codeSent && <p className="text-sm text-slate-500">이메일로 6자리 코드를 보내 드립니다. 처음이면 계정이 자동으로 만들어집니다.</p>}
          {mode === "code" && codeSent && (
            <>
              <p className="text-sm text-slate-500" role="status"><strong>{codeSentTo}</strong>로 코드를 보냈습니다. 메일함(스팸함 포함)을 확인해 주세요.</p>
              <label className="grid gap-1 text-sm font-medium">
                6자리 코드
                <input className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} disabled={locked}
                  onChange={(event) => { setCode(event.target.value.replace(/\D/g, "")); setError(null); }} />
              </label>
            </>
          )}

          <button type="submit" className="btn-primary justify-center" disabled={locked}>{busy ? "처리 중…" : submitLabel}</button>
          {mode === "code" && codeSent && !done && (
            <button type="button" className="btn-secondary justify-center" disabled={locked}
              onClick={() => void run(() => sendEmailCode(email), () => setCode(""))}>코드 다시 받기</button>
          )}
        </form>

        {done && <p className="mt-3 text-sm text-emerald-700" role="status">로그인했습니다. 화면을 여는 중…</p>}
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">
            <p>{error}</p>
            <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/library/help#connection">로그인 문제 해결 방법</Link>
          </div>
        )}
        {mode === "password" && !done && <p className="mt-3 text-xs text-slate-500">비밀번호를 모르면 통합관리자에게 다시 정해 달라고 요청해 주세요. 메일을 받을 수 있는 계정은 이메일 코드로도 들어올 수 있습니다.</p>}

        {isGoogleLoginEnabled() && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <button type="button" className="btn-secondary w-full justify-center" disabled={locked}
              onClick={() => void run(google, () => setDone(true))}>Google로 로그인</button>
          </div>
        )}
      </div>
    </OverlayShell>
  );
}
