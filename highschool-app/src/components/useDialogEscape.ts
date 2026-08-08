"use client";

import { useEffect, useRef } from "react";

/**
 * 모달을 ESC로 닫는다 — 루트 CLAUDE.md 컨벤션("모달은 포커스 트랩+ESC+role=dialog").
 *
 * 23개 화면이 같은 effect를 각자 복제하고 있어 새 모달마다 빠뜨리기 쉬웠다.
 * `onClose`는 ref에 보관해 매 렌더 새 함수가 와도 리스너를 교체하지 않는다
 * (Firebase 실시간 갱신으로 리렌더가 잦은 화면에서 리스너가 계속 붙었다 떨어진다).
 *
 * @param open   모달이 열려 있는지. false면 리스너를 걸지 않는다.
 * @param onClose ESC를 눌렀을 때 실행할 닫기 동작.
 */
export function useDialogEscape(open: boolean, onClose: () => void): void {
  const onCloseRef = useRef(onClose);
  // ref 갱신은 렌더 중이 아니라 effect에서 한다(react-hooks/refs).
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open]);
}
