"use client";

import { useCallback, useState } from "react";
import { formatLoadErrors, withError, withoutError, type LoadErrorMap } from "./loadErrors";

/**
 * 구독 실패를 경로별로 모아 배너 문구 하나로 돌려준다.
 *
 * `scope`가 바뀌면(학기 변경·계정 변경) 이전 실패는 **렌더 중 파생으로** 버린다 —
 * effect 안에서 setState하면 `react-hooks/set-state-in-effect`에 걸리고 시계 tick처럼
 * 사용자 상태를 덮는 사고로 이어진다(루트 CLAUDE.md 실수 13).
 *
 * 주의: Firebase RTDB는 **한 번 거부된 리스너를 규칙이 바뀌어도 재시도하지 않는다.**
 * 그래서 권한이 열려도 그 탭은 새로고침(재구독) 전까지 실패 상태가 유지된다 —
 * 이 훅은 재구독·계정 변경 시점에 배너가 확실히 초기화되는 것까지만 보장한다.
 */
export function useLoadErrors(scope: string) {
  const [state, setState] = useState<{ scope: string; errors: LoadErrorMap }>({ scope, errors: {} });
  const errors = state.scope === scope ? state.errors : {};

  const fail = useCallback(
    (key: string) => (error: Error) => {
      setState((prev) =>
        prev.scope === scope
          ? { scope, errors: withError(prev.errors, key, error.message) }
          : { scope, errors: withError({}, key, error.message) },
      );
    },
    [scope],
  );

  const ok = useCallback(
    (key: string) => {
      setState((prev) => {
        if (prev.scope !== scope) return { scope, errors: {} };
        const next = withoutError(prev.errors, key);
        return next === prev.errors ? prev : { scope, errors: next };
      });
    },
    [scope],
  );

  return { fail, ok, errors, message: formatLoadErrors(errors) };
}
