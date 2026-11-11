"use client";

import { useId, useState, type FormEvent } from "react";
import { MAILBOXLESS_DOMAIN } from "@/lib/accountEmail";
import { accountPasswordProblem, ACCOUNT_PASSWORD_MIN } from "./passwordPolicy";
import { requestAccountPassword } from "./passwordClient";

/** 마이페이지 팀원 관리 옆의 작은 도구 — 통합관리자가 메일함 없는 계정의 비밀번호를 정한다. */
export default function AccountPasswordTool() {
  const id = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const problem = accountPasswordProblem(email, password);
    setDone(null);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const { created } = await requestAccountPassword(email, password);
      const target = email.trim().toLowerCase();
      setDone(created ? `${target} 계정을 새로 만들고 비밀번호를 정했습니다.` : `${target} 계정의 비밀번호를 바꿨습니다.`);
      setPassword("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "비밀번호를 정하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="team-first-state workspace-access-state is-embedded" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="page-title">로그인 비밀번호 정하기</h2>
      <p>메일함이 없는 @{MAILBOXLESS_DOMAIN} 계정은 이메일 코드를 받을 수 없어 비밀번호로만 로그인합니다. 계정이 없으면 새로 만듭니다. 정한 비밀번호는 본인에게 직접 전해 주세요.</p>
      <form className="grid w-full max-w-sm gap-3 text-left" onSubmit={(event) => void submit(event)} noValidate>
        <label className="grid gap-1 text-sm font-medium">
          계정 이메일
          <input className="input" type="email" inputMode="email" autoComplete="off" value={email} disabled={busy}
            placeholder={`이름@${MAILBOXLESS_DOMAIN}`} onChange={(event) => { setEmail(event.target.value); setError(null); setDone(null); }} />
        </label>
        <label className="grid gap-1 text-sm font-medium">
          새 비밀번호 ({ACCOUNT_PASSWORD_MIN}자 이상)
          <input className="input" type={show ? "text" : "password"} autoComplete="new-password" value={password} disabled={busy}
            onChange={(event) => { setPassword(event.target.value); setError(null); setDone(null); }} />
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />
          비밀번호 보이기
        </label>
        <button type="submit" className="btn-primary justify-center" disabled={busy}>{busy ? "처리 중…" : "비밀번호 정하기"}</button>
      </form>
      {done && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700" role="status">{done}</p>}
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</p>}
    </section>
  );
}
