"use client";

import { useCallback, useRef, useState } from "react";

/**
 * 저장 버튼 중복 클릭(이중 제출) 방지.
 *
 * 왜 필요한가 — 느린 네트워크에서 "저장"을 두 번 누르면 `push` 계열 저장이 두 번 돌아
 * **같은 레코드가 두 개 만들어진다.** 취소명단(환불계좌 포함)·카풀·교사처럼 새 레코드를
 * 만드는 화면에서 실제로 발생 가능하며, 사용자는 중복을 지우기 전까지 명단이 어긋난 채로
 * 운영하게 된다.
 *
 * `disabled` 상태만으로는 부족하다 — 리렌더 전에 두 번째 클릭이 들어오면 그대로 통과한다.
 * 그래서 리렌더와 무관하게 즉시 막는 `ref` 잠금과, 버튼 비활성화를 위한 `state`를 함께 둔다.
 *
 * ```tsx
 * const { busy, run } = useSubmitLock();
 * <button onClick={() => run(handleSave)} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
 * ```
 */
export function useSubmitLock() {
  const lockRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (task: () => void | Promise<void>) => {
    // ref 검사가 먼저다. state는 다음 렌더에야 반영돼 연타를 못 막는다.
    if (lockRef.current) return;
    lockRef.current = true;
    setBusy(true);
    try {
      await task();
    } finally {
      lockRef.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run };
}
