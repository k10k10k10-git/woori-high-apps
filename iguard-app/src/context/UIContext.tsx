"use client";

import { createContext, useContext, useState, useCallback, useRef, useEffect, ReactNode } from "react";

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
  info:    "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800",
  warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
};

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✓",
  error:   "✕",
  info:    "ℹ",
  warning: "⚠",
};

// ── Accessible Confirm Dialog ──────────────────────────────────
function ConfirmDialog({ message, onConfirm }: { message: string; onConfirm: (result: boolean) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // 포커스를 확인 버튼으로 이동
    confirmBtnRef.current?.focus();

    // ESC 키 핸들러
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onConfirm(false);
        return;
      }
      // 기본 포커스 트랩 — Tab 키가 모달 안에서만 순환
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onConfirm]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4" role="dialog" aria-modal="true" aria-label="확인 대화 상자" ref={dialogRef}>
      <div className="card p-6 w-full max-w-sm modal-card">
        <p className="text-sm text-slate-700 mb-5 leading-relaxed">{message}</p>
        <div className="flex gap-2">
          <button onClick={() => onConfirm(false)} className="btn-secondary flex-1 justify-center">
            취소
          </button>
          <button ref={confirmBtnRef} onClick={() => onConfirm(true)} className="btn-primary flex-1 justify-center">
            확인
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Provider ───────────────────────────────────────────────────
export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const toastIdRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3500);
  }, []);

  const uiConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ message, resolve });
    });
  }, []);

  function handleConfirm(result: boolean) {
    if (confirmState) {
      confirmState.resolve(result);
      setConfirmState(null);
    }
  }

  return (
    <UIContext.Provider value={{ toast, uiConfirm }}>
      {children}

      {/* ── Toast 컨테이너 ── */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none" aria-live="polite" role="status">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium pointer-events-auto animate-fadeIn ${TOAST_STYLES[t.type]}`}
            style={{ maxWidth: 360 }}
          >
            <span className="text-base leading-none" aria-hidden="true">{TOAST_ICONS[t.type]}</span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* ── Confirm 모달 ── */}
      {confirmState && <ConfirmDialog message={confirmState.message} onConfirm={handleConfirm} />}
    </UIContext.Provider>
  );
}
