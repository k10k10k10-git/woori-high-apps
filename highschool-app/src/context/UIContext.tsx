"use client";

import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";

// ── Types ──────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info" | "warning";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmState {
  message: string;
  resolve: (result: boolean) => void;
}

interface UIContextValue {
  toast: (message: string, type?: ToastType) => void;
  uiConfirm: (message: string) => Promise<boolean>;
}

// ── Context ────────────────────────────────────────────────────
const UIContext = createContext<UIContextValue | null>(null);

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}

// ── Toast styles ───────────────────────────────────────────────
const TOAST_STYLES: Record<ToastType, string> = {
  success: "bg-green-50 border-green-200 text-green-800",
  error:   "bg-red-50 border-red-200 text-red-800",
  info:    "bg-blue-50 border-blue-200 text-blue-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
};

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  error:   "✕",
  info:    "ℹ",
  warning: "⚠",
};

// ── Provider ───────────────────────────────────────────────────
export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const toastIdRef = useRef(0);
  const confirmResolveRef = useRef<((result: boolean) => void) | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const okBtnRef = useRef<HTMLButtonElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const messageId = "ui-confirm-message";

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const uiConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmResolveRef.current?.(false);
      confirmResolveRef.current = resolve;
      setConfirmState({ message, resolve });
    });
  }, []);

  // StrictMode에서 setState 업데이터는 두 번 호출되므로 resolve는 업데이터 밖에서 처리한다.
  const handleConfirm = useCallback((result: boolean) => {
    const resolve = confirmResolveRef.current;
    if (!resolve) return;
    confirmResolveRef.current = null;
    resolve(result);
    setConfirmState(null);
    // 모달을 열기 전 포커스로 되돌린다 (키보드 사용자가 맥락을 잃지 않도록)
    prevFocusRef.current?.focus();
    prevFocusRef.current = null;
  }, []);

  // 확인창 접근성: 열릴 때 취소 버튼에 포커스, ESC=취소, Tab은 두 버튼 안에서만 순환
  useEffect(() => {
    if (!confirmState) return;

    const active = document.activeElement;
    prevFocusRef.current = active instanceof HTMLElement ? active : null;
    cancelBtnRef.current?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handleConfirm(false);
        return;
      }
      if (e.key !== "Tab") return;
      const cancel = cancelBtnRef.current;
      const ok = okBtnRef.current;
      if (!cancel || !ok) return;
      e.preventDefault();
      e.stopPropagation();
      (document.activeElement === cancel ? ok : cancel).focus();
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [confirmState, handleConfirm]);

  return (
    <UIContext.Provider value={{ toast, uiConfirm }}>
      {children}

      {/* ── Toast 컨테이너 ── */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium pointer-events-auto animate-fadeIn ${TOAST_STYLES[t.type]}`}
            style={{ maxWidth: 360 }}
          >
            <span className="text-base leading-none">{TOAST_ICONS[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* ── Confirm 모달 ── */}
      {confirmState && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[140] p-4">
          <div className="card p-6 w-full max-w-sm modal-card"
            role="dialog" aria-modal="true" aria-labelledby={messageId}>
            <p id={messageId} className="text-sm text-slate-700 mb-5 leading-relaxed">{confirmState.message}</p>
            <div className="flex gap-2">
              <button ref={cancelBtnRef} onClick={() => handleConfirm(false)} className="btn-secondary flex-1 justify-center">
                취소
              </button>
              <button ref={okBtnRef} onClick={() => handleConfirm(true)} className="btn-primary flex-1 justify-center">
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
}
