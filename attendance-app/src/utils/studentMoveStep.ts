/** SDK 예약·토큰은 취소 API가 없어도 화면을 무한히 붙잡지 않는다. 늦은 쓰기의 정리는 호출자가 맡는다. */
export function awaitStudentMoveStep<T>(work: Promise<T>, input: {
  signal?: AbortSignal;
  timeoutMs?: number;
  onTimeout?: () => void;
} = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let finished = false;
    const finish = (done: () => void) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      input.signal?.removeEventListener('abort', abort);
      done();
    };
    const abort = () => finish(() => reject(new Error('학생 이동이 중단되었습니다.')));
    const timer = setTimeout(() => {
      finish(() => reject(new Error('학생 이동 연결 확인 시간이 지났습니다.')));
      input.onTimeout?.();
    }, input.timeoutMs ?? 15_000);
    input.signal?.addEventListener('abort', abort, { once: true });
    if (input.signal?.aborted) abort();
    // 타임아웃 뒤 늦은 거절도 처리한다. 이것이 SDK 요청 취소를 뜻하지는 않는다.
    work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
  });
}
