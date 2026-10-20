import type { StudentMoveLockTransaction } from '@/utils/studentMoveLock';

export const STUDENT_MOVE_LOCK_TIMEOUT_MS = 15_000;
const MAX_COMPARE_ATTEMPTS = 3;
const REQUEST_ERROR = '학생 이동 잠금 결과를 확인하지 못했습니다. 연결과 학생 상태를 확인한 뒤 다시 시도해 주세요.';

type LockResponse = Pick<Response, 'ok' | 'status' | 'headers' | 'json'>;

type StudentMoveLockConnection = {
  databaseUrl: string | undefined;
  idToken: string;
  path: string;
  isCurrent: () => boolean;
  isActive?: () => boolean;
  fetchOnce?: (url: string, init: RequestInit) => Promise<LockResponse>;
  timeoutMs?: number;
};

/** SDK 재접속 쓰기 큐 없이 최신 연도 잠금에만 조건부 반영한다. */
export function createStudentMoveLockTransaction(input: StudentMoveLockConnection): StudentMoveLockTransaction {
  return async (updateValue) => {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      if (controller.signal.aborted || !input.isCurrent() || input.isActive?.() === false) {
        throw new Error(REQUEST_ERROR);
      }
    };
    const work = async () => {
      check();
      if (!input.databaseUrl || !input.idToken || !input.path) throw new Error(REQUEST_ERROR);
      const url = new URL(input.databaseUrl);
      url.pathname = `/${input.path.split('/').map(encodeURIComponent).join('/')}.json`;
      url.searchParams.set('auth', input.idToken);
      const request = input.fetchOnce ?? globalThis.fetch;
      const options = { cache: 'no-store' as const, signal: controller.signal };

      for (let attempt = 0; attempt < MAX_COMPARE_ATTEMPTS; attempt++) {
        check();
        const response = await request(url.toString(), {
          ...options, method: 'GET', headers: { 'X-Firebase-ETag': 'true' },
        });
        check();
        if (!response.ok) throw new Error(REQUEST_ERROR);
        const value: unknown = await response.json();
        check();
        const nextValue = updateValue(value);
        check();
        if (nextValue === undefined) return { committed: false, value };
        const etag = response.headers.get('etag');
        if (!etag) throw new Error(REQUEST_ERROR);

        check();
        const result = await request(url.toString(), {
          ...options,
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'If-Match': etag },
          body: JSON.stringify(nextValue),
        });
        check();
        if (result.status === 412) continue;
        if (!result.ok) throw new Error(REQUEST_ERROR);
        return { committed: true, value: nextValue };
      }
      throw new Error(REQUEST_ERROR);
    };

    try {
      return await Promise.race([
        work(),
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error(REQUEST_ERROR));
          }, input.timeoutMs ?? STUDENT_MOVE_LOCK_TIMEOUT_MS);
        }),
      ]);
    } catch {
      // abort는 이미 전송된 PUT의 서버 반영을 취소하지 않는다. 호출자는 PATCH를 중단하고
      // 양 phase의 자기 작업 잠금만 다시 대조해 정리한다. 불명확한 PUT은 재전송하지 않는다.
      throw new Error(REQUEST_ERROR);
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
