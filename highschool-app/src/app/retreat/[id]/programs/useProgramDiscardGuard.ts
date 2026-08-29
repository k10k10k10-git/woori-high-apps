"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PendingAction = {
  label: string;
  run: () => void | Promise<void>;
};

export function useProgramDiscardGuard() {
  const [dirty, setDirty] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);
  const pendingRef = useRef<PendingAction | null>(null);

  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  const requestAction = useCallback((label: string, run: PendingAction["run"]) => {
    if (!dirty) {
      void run();
      return;
    }
    pendingRef.current = { label, run };
    setPendingLabel(label);
  }, [dirty]);

  const cancelDiscard = useCallback(() => {
    pendingRef.current = null;
    setPendingLabel(null);
  }, []);

  const confirmDiscard = useCallback(() => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    setPendingLabel(null);
    setDirty(false);
    setResetVersion((version) => version + 1);
    if (pending) void pending.run();
  }, []);

  return {
    dirty,
    setDirty,
    resetVersion,
    pendingLabel,
    requestAction,
    cancelDiscard,
    confirmDiscard,
  };
}
