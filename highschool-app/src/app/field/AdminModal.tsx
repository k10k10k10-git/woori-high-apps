"use client";

import { useEffect, useRef, useState } from "react";
import { createRetreatAccessLock, PIN_MAX_LENGTH, PIN_MIN_LENGTH } from "@/features/iguard/lib/accessLock";
import { deleteIguardAccessLock, saveIguardAccessLock } from "@/features/iguard/lib/db";
import type { IguardAccessLock, Retreat } from "@/features/iguard/lib/types";
import { useUI } from "@/context/UIContext";

interface AdminModalProps {
  onClose: () => void;
  retreats: Retreat[];
  locks: Record<string, IguardAccessLock>;
  adminId: string;
}

export default function AdminModal({ onClose, retreats, locks, adminId }: AdminModalProps) {
  const { toast, uiConfirm } = useUI();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [pins, setPins] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); prev?.focus(); };
  }, [onClose]);

  async function savePin(retreat: Retreat) {
    const pin = pins[retreat.id] || "";
    setSavingId(retreat.id);
    try {
      const lock = await createRetreatAccessLock(pin, adminId);
      await saveIguardAccessLock(retreat.id, lock);
      setPins(prev => ({ ...prev, [retreat.id]: "" }));
      toast(`${retreat.name} PIN 잠금을 ${locks[retreat.id] ? "변경" : "설정"}했습니다.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSavingId(null);
    }
  }

  async function disableLock(retreat: Retreat) {
    if (!await uiConfirm(`${retreat.name}의 PIN 잠금을 해제할까요? 승인된 모든 팀원이 바로 입장할 수 있습니다.`)) return;
    setSavingId(retreat.id);
    try {
      await deleteIguardAccessLock(retreat.id);
      setPins(prev => ({ ...prev, [retreat.id]: "" }));
      toast(`${retreat.name} PIN 잠금을 해제했습니다.`, "success");
    } catch (e) {
      toast(`잠금 해제 오류: ${e instanceof Error ? e.message : String(e)}`, "error");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div ref={dialogRef} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 modal-backdrop"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="수련회 접근 관리자" tabIndex={-1}>
      <div className="card max-h-[88vh] w-full max-w-xl overflow-y-auto p-5 sm:p-6 modal-card" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-800">🔐 관리자</h3>
            <p className="mt-0.5 text-xs text-slate-400">수련회별 PIN 잠금</p>
          </div>
          <button onClick={onClose} className="text-xl leading-none text-slate-400 hover:text-slate-600" aria-label="닫기">×</button>
        </div>

        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          Google 로그인과 팀원 승인 뒤에 적용되는 추가 잠금입니다. 관리자는 PIN 없이 입장합니다.
          PIN은 평문으로 저장하지 않으며, <strong>6자리 이상</strong> 사용을 권장합니다.
        </div>

        {retreats.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">설정할 수련회가 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {retreats.map(retreat => {
              const locked = !!locks[retreat.id];
              const pin = pins[retreat.id] || "";
              const saving = savingId === retreat.id;
              return (
                <section key={retreat.id} className={`rounded-xl border p-3.5 ${locked ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50"}`}>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-400">{retreat.year}년</div>
                      <div className="truncate text-sm font-bold text-slate-800">{retreat.name}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${locked ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      {locked ? "🔒 잠금 중" : "공개"}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      autoComplete="new-password"
                      minLength={PIN_MIN_LENGTH}
                      maxLength={PIN_MAX_LENGTH}
                      className="input flex-1 text-sm"
                      placeholder={locked ? "새 PIN으로 변경" : `${PIN_MIN_LENGTH}~${PIN_MAX_LENGTH}자리 숫자 PIN`}
                      value={pin}
                      onChange={e => setPins(prev => ({ ...prev, [retreat.id]: e.target.value.replace(/\D/g, "").slice(0, PIN_MAX_LENGTH) }))}
                      aria-label={`${retreat.name} PIN`}
                    />
                    <button type="button" onClick={() => savePin(retreat)} disabled={saving || pin.length < PIN_MIN_LENGTH}
                      className="btn-primary justify-center whitespace-nowrap disabled:opacity-40">
                      {saving ? "저장 중..." : locked ? "PIN 변경" : "잠금 설정"}
                    </button>
                    {locked && (
                      <button type="button" onClick={() => disableLock(retreat)} disabled={saving}
                        className="btn-secondary justify-center whitespace-nowrap text-red-500 disabled:opacity-40">
                        잠금 해제
                      </button>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
