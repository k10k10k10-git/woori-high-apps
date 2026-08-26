export type SubscriptionReadinessGate = {
  markReady: (key: string) => void;
  pendingKeys: () => string[];
};

/**
 * 여러 실시간 구독의 첫 응답을 한 번에 기다리는 작은 게이트.
 * 성공과 오류 모두 markReady 해야 일부 권한 오류가 전체 화면의 무한 스피너가 되지 않는다.
 */
export function createSubscriptionReadinessGate(
  keys: readonly string[],
  onReady: () => void,
): SubscriptionReadinessGate {
  const pending = new Set(keys);
  let completed = false;

  const completeIfReady = () => {
    if (!completed && pending.size === 0) {
      completed = true;
      onReady();
    }
  };

  completeIfReady();

  return {
    markReady(key) {
      pending.delete(key);
      completeIfReady();
    },
    pendingKeys: () => [...pending],
  };
}
