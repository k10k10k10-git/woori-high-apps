type Listener = { receive: (value: unknown) => void; fail?: (error: Error) => void };
const listeners = new Map<number, Listener>();

// 합성 서비스 호출만 기록한다. 실제 인증·SDK·운영 저장 함수는 연결하지 않는다.
export const qa = {
  writes: [] as unknown[], retries: 0, signInCalls: 0, navigation: [] as string[],
  prefetches: [] as string[], subscriptions: [] as string[], childMounts: 0,
  closeCalls: 0, recordLinkNavigation: false,
  subscriptionEvents: [] as { id: number; name: string; key: string; active: boolean }[],
  emit(name: string, key: string, value: unknown) {
    qa.subscriptionEvents.filter((event) => event.active && event.name === name && event.key === key)
      .forEach((event) => listeners.get(event.id)?.receive(value));
  },
  // 해제 직전에 도착한 응답을 재현해 실제 컴포넌트의 세대·계정 fence를 검사한다.
  deliver(id: number, value: unknown) { listeners.get(id)?.receive(value); },
  fail(name: string, key: string, message = "Synthetic private diagnostic path") {
    const event = qa.subscriptionEvents.findLast((item) => item.active && item.name === name && item.key === key);
    if (event) listeners.get(event.id)?.fail?.(new Error(message));
  },
};

export function connect<T>(name: string, key: string, receive: (value: T) => void, value: T, fail?: (error: Error) => void) {
  qa.subscriptions.push(name);
  const event = { id: qa.subscriptionEvents.length + 1, name, key, active: true };
  qa.subscriptionEvents.push(event);
  listeners.set(event.id, { receive: (next) => receive(next as T), fail });
  receive(value);
  return () => { event.active = false; };
}

export function memoryWrite(name: string) {
  return async (...args: unknown[]) => {
    qa.writes.push({ name, args });
    return `synthetic-${name}-${qa.writes.length}`;
  };
}
