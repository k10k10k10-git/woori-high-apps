"use client";

import { useCallback, useState } from "react";
import { useUI } from "@/context/UIContext";

/**
 * 행 삭제의 되돌리기.
 *
 * 게임·물품·역할·경기는 확인창 없이 한 번에 지운다 — 확인창을 매번 띄우면 표를 정리하는
 * 일이 느려지기 때문이다. 대신 지운 값을 손에 들고 있다가 같은 키로 되살릴 수 있게 한다.
 * 되살리기는 원래 id 경로에 그대로 쓰므로 순서·연결(postId)이 함께 복구된다.
 */
export function useProgramUndo() {
  const { toast } = useUI();
  const [pending, setPending] = useState<{ label: string; restore: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);

  const remember = useCallback((label: string, restore: () => Promise<void>) => {
    setPending({ label, restore });
  }, []);

  const dismiss = useCallback(() => setPending(null), []);

  const undo = useCallback(async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.restore();
      setPending(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : `${pending.label}을(를) 되살리지 못했습니다.`, "error");
    } finally {
      setBusy(false);
    }
  }, [pending, toast]);

  return { pending, busy, remember, dismiss, undo };
}
