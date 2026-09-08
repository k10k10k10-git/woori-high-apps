const NAME = 'woori-attendance-writes';
export class BrowserWriteLockError extends Error {}

/** 같은 출처의 탭 사이에서 동기화와 일반 쓰기가 겹치지 않게 한다. 서버 권한을 대체하지 않는다. */
export async function withBrowserWriteLock<T>(mode: 'shared' | 'exclusive', task: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks) {
    if (mode === 'exclusive' && typeof window !== 'undefined') throw new BrowserWriteLockError('이 브라우저는 안전한 동기화를 지원하지 않습니다. 최신 Chrome 또는 Safari에서 실행해 주세요.');
    return task();
  }
  return locks.request(NAME, { mode, ifAvailable: true }, lock => {
    if (!lock) throw new BrowserWriteLockError('다른 탭에서 저장 또는 동기화 중입니다. 완료 후 다시 시도해 주세요.');
    return task();
  });
}
