// Firebase 에서 Supabase 로 플랫폼만 바꿨다(docs/SUPABASE_PLATFORM_CONTRACT.md). 이름·인자는 firebase/database 와 같다.
import {
  get,
  onDisconnect,
  onValue,
  push,
  ref,
  remove as sdkRemove,
  runTransaction as sdkRunTransaction,
  set as sdkSet,
  update as sdkUpdate,
} from '@/lib/rtdb';
import { db } from '@/lib/firebase/client';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';

export const set: typeof sdkSet = (...args) => withBrowserWriteLock('shared', () => sdkSet(...args));
export const update: typeof sdkUpdate = (...args) => withBrowserWriteLock('shared', () => sdkUpdate(...args));
export const remove: typeof sdkRemove = (...args) => withBrowserWriteLock('shared', () => sdkRemove(...args));
export const runTransaction: typeof sdkRunTransaction = (...args) => withBrowserWriteLock('shared', async () => {
  // Firebase 때부터 지켜 온 순서: 읽기 권한·첫 값을 구독으로 확인한 뒤 트랜잭션을 시작한다.
  // (Supabase 판은 서버 hash 로 비교하므로 캐시 문제는 없지만, 권한 오류 시 쓰기를 시작하지 않는 계약을 유지한다.)
  let unsubscribe: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => { unsubscribe = onValue(args[0], () => resolve(), reject); });
    return await sdkRunTransaction(...args);
  } finally { unsubscribe?.(); }
});
/** 이미 브라우저 배타 잠금을 보유한 동기화 프로토콜 안에서만 사용한다. */
export const syncProtocolDb = { runTransaction: sdkRunTransaction };

/** 실시간 트리 저장소 접근은 이 모듈을 통해서만 노출한다. */
export { db, get, onDisconnect, onValue, push, ref };
