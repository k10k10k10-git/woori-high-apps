"use client";

import { FormEvent, useState } from "react";
import { ArrowLeft } from "@phosphor-icons/react";
import {
  PIN_MAX_LENGTH,
  PIN_MIN_LENGTH,
  rememberRetreatSessionUnlock,
  verifyRetreatPin,
} from "@/features/iguard/lib/accessLock";
import type { IguardAccessLock } from "@/features/iguard/lib/types";

interface RetreatPinGateProps {
  retreatId: string;
  lock: IguardAccessLock;
  onUnlocked: () => void;
  onBack: () => void;
}

export default function RetreatPinGate({ retreatId, lock, onUnlocked, onBack }: RetreatPinGateProps) {
  const [pin, setPin] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    try {
      if (!await verifyRetreatPin(pin, lock)) {
        setError("PIN이 맞지 않습니다.");
        setPin("");
        return;
      }
      rememberRetreatSessionUnlock(retreatId, lock, window.sessionStorage);
      onUnlocked();
    } catch {
      setError("PIN을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
      <form onSubmit={submit} className="card w-full max-w-sm p-6 text-center">
        <div className="mb-3 text-4xl" aria-hidden="true">🔒</div>
        <h1 className="text-xl font-bold text-slate-800">잠긴 수련회입니다</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">관리자가 설정한 PIN을 입력하면 이 브라우저 탭에서 입장할 수 있습니다.</p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          minLength={PIN_MIN_LENGTH}
          maxLength={PIN_MAX_LENGTH}
          className="input mt-5 h-12 w-full text-center text-lg tracking-[0.35em]"
          placeholder="PIN"
          aria-label="수련회 PIN"
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH)); setError(null); }}
        />
        {error && <div className="mt-2 text-sm text-red-600" role="alert">{error}</div>}
        <button type="submit" disabled={checking || pin.length < PIN_MIN_LENGTH}
          className="btn-primary mt-4 w-full justify-center py-3 disabled:opacity-40">
          {checking ? "확인 중..." : "입장"}
        </button>
        <button type="button" onClick={onBack} className="mt-3 inline-flex min-h-10 items-center gap-1 text-sm text-slate-400 hover:text-slate-600"><ArrowLeft aria-hidden="true" size={15} />수련회 목록으로</button>
      </form>
    </div>
  );
}
