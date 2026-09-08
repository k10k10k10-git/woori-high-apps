import {
  get,
  off,
  onDisconnect,
  onValue,
  push,
  ref,
  remove as sdkRemove,
  runTransaction as sdkRunTransaction,
  set as sdkSet,
  update as sdkUpdate,
} from 'firebase/database';
import { db } from '@/lib/firebase/client';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';

export const set: typeof sdkSet = (...args) => withBrowserWriteLock('shared', () => sdkSet(...args));
export const update: typeof sdkUpdate = (...args) => withBrowserWriteLock('shared', () => sdkUpdate(...args));
export const remove: typeof sdkRemove = (...args) => withBrowserWriteLock('shared', () => sdkRemove(...args));
export const runTransaction: typeof sdkRunTransaction = (...args) => withBrowserWriteLock('shared', async () => {
  // get()만으로는 구독 없는 SDK 캐시가 유지되지 않는다. 첫 null 콜백의 조기 중단을 방지한다.
  let unsubscribe: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => { unsubscribe = onValue(args[0], () => resolve(), reject); });
    return await sdkRunTransaction(...args);
  } finally { unsubscribe?.(); }
});
/** 이미 브라우저 배타 잠금을 보유한 동기화 프로토콜 안에서만 사용한다. */
export const syncProtocolDb = { runTransaction: sdkRunTransaction };

/** Firebase Realtime Database 접근은 이 모듈을 통해서만 노출한다. */
export { db, get, off, onDisconnect, onValue, push, ref };
