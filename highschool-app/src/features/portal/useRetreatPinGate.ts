"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeToIguardAccessLock } from "@/features/iguard/lib/db";
import { hasRetreatSessionUnlock } from "@/features/iguard/lib/accessLock";
import type { IguardAccessLock } from "@/features/iguard/lib/types";
import { canManageRolesOf, type MinistryRoles } from "./accessPolicy";

type GateState = {
  scope: string;
  lock: IguardAccessLock | null | undefined;
  unlocked: boolean;
  lockError: string | null;
};

const PENDING: Omit<GateState, "scope"> = { lock: undefined, unlocked: false, lockError: null };

function sessionUnlocked(retreatId: string, lock: IguardAccessLock): boolean {
  try { return hasRetreatSessionUnlock(retreatId, lock, window.sessionStorage); }
  catch { return false; }
}

/**
 * 수련회 PIN 잠금 게이트 — 행정 화면과 이가드 현장 화면이 **같은 판정**을 쓴다.
 *
 * 잠금은 `retreats/{id}/iguard/accessLock` 하나에만 저장되므로, 어느 쪽에서 잠가도
 * 양쪽에 똑같이 걸린다. 이 훅을 거치지 않고 화면마다 구독을 새로 짜면 두 화면의
 * 결론이 갈린다(한쪽만 잠기는 사고).
 *
 * - `lock === undefined` : 아직 확인 전(스피너)
 * - `lock === null`      : 잠금 없음
 * - `unlocked`           : 이번 세션에서 PIN을 통과했거나 잠금이 없음
 *
 * PIN 우회는 역할을 배정할 수 있는 사람 — 통합관리자와 교역자다(`canManageRolesOf`).
 * 남의 역할을 바꿀 수 있는 사람은 자기 역할도 바꿔 어차피 통과할 수 있으므로,
 * 이들에게 PIN을 거는 건 잠금이 아니라 절차만 늘리는 일이다. 이 범위를 더 넓히지 않는다.
 * 상태는 scope 파생으로 초기화한다(effect 안 setState 금지 — 루트 CLAUDE.md 실수 13).
 */
export function useRetreatPinGate(
  retreatId: string,
  options: { enabled: boolean; roles: MinistryRoles },
) {
  const { enabled, roles } = options;
  const bypass = canManageRolesOf(roles);
  const scope = `${retreatId}|${enabled}|${bypass}`;
  const [state, setState] = useState<GateState>({ scope, ...PENDING });

  useEffect(() => {
    if (!enabled || bypass) return;
    return subscribeToIguardAccessLock(retreatId, nextLock => {
      setState({
        scope,
        lock: nextLock,
        unlocked: !nextLock || sessionUnlocked(retreatId, nextLock),
        lockError: null,
      });
    }, error => {
      setState({ scope, ...PENDING, lockError: `PIN 잠금 상태를 확인하지 못했습니다 - ${error.message}` });
    });
  }, [enabled, bypass, retreatId, scope]);

  const markUnlocked = useCallback(() => {
    setState(prev => (prev.scope === scope ? { ...prev, unlocked: true } : prev));
  }, [scope]);

  // 우회 대상(통합관리자·교역자)은 구독 없이 통과. 그 외에는 이번 scope의 구독 결과만 신뢰한다.
  if (bypass) return { lock: null, unlocked: true, lockError: null, markUnlocked };
  const current = state.scope === scope ? state : { scope, ...PENDING };
  return { lock: current.lock, unlocked: current.unlocked, lockError: current.lockError, markUnlocked };
}
