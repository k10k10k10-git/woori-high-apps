"use client";

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

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

  function handleConfirm(result: boolean) {
    if (confirmState) {
      confirmState.resolve(result);
      confirmResolveRef.current = null;
      setConfirmState(null);
    }
  }

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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="card p-6 w-full max-w-sm modal-card">
            <p className="text-sm text-slate-700 mb-5 leading-relaxed">{confirmState.message}</p>
            <div className="flex gap-2">
              <button onClick={() => handleConfirm(false)} className="btn-secondary flex-1 justify-center">
                취소
              </button>
              <button onClick={() => handleConfirm(true)} className="btn-primary flex-1 justify-center">
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
}
