export type StudentMovePatchResult =
  | { status: 'committed' }
  | { status: 'rejected'; httpStatus?: number }
  | { status: 'unknown' };

export const STUDENT_MOVE_PATCH_TIMEOUT_MS = 30_000;

type FetchOnce = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status'>>;

/** 안전 판정은 활성 SDK 구독의 오래된 캐시가 아닌 인증된 서버 응답만 사용한다. */
export async function readStudentMoveValue(input: {
  databaseUrl: string | undefined;
  idToken: string;
  path: string;
  isCurrent: () => boolean;
  fetchOnce?: (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'json'>>;
  timeoutMs?: number;
}): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), input.timeoutMs ?? 15_000);
  try {
    if (!input.databaseUrl || !input.idToken || !input.isCurrent()) throw new Error('invalid scope');
    const url = new URL(input.databaseUrl);
    url.pathname = `/${input.path.split('/').map(encodeURIComponent).join('/')}.json`;
    url.searchParams.set('auth', input.idToken);
    const response = await (input.fetchOnce ?? globalThis.fetch)(url.toString(), { method: 'GET', cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('read rejected');
    const value: unknown = await response.json();
    if (controller.signal.aborted || !input.isCurrent()) throw new Error('stale scope');
    return value;
  } catch {
    throw new Error('학생 이동 자료를 서버에서 확인하지 못했습니다. 연결과 권한을 확인한 뒤 다시 시도해 주세요.');
  } finally { globalThis.clearTimeout(timeoutId); }
}

type StudentMoveCommitEvidence = {
  commitMarkerIsTrue: boolean;
  sourceStudentExists: boolean;
  destinationStudentExists: boolean;
};

/**
 * Firebase SDK의 오프라인 쓰기 큐를 사용하지 않고 루트 multipath PATCH를 한 번만 보낸다.
 * 네트워크 예외는 서버 반영 여부를 단정할 수 없으므로 오류 문자열을 전달하지 않는다.
 */
export async function patchStudentMoveOnce(input: {
  databaseUrl: string | undefined;
  idToken: string;
  payload: Record<string, unknown>;
  fetchOnce?: FetchOnce;
  timeoutMs?: number;
}): Promise<StudentMovePatchResult> {
  const databaseUrl = input.databaseUrl?.trim().replace(/\/+$/, '');
  if (!databaseUrl || !input.idToken) return { status: 'rejected' };

  const fetchOnce = input.fetchOnce ?? globalThis.fetch;
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? STUDENT_MOVE_PATCH_TIMEOUT_MS,
  );
  try {
    const url = new URL(databaseUrl);
    url.pathname = '/.json';
    url.searchParams.set('auth', input.idToken);
    const response = await fetchOnce(
      url.toString(),
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input.payload),
        cache: 'no-store',
        signal: controller.signal,
      },
    );
    if (controller.signal.aborted) return { status: 'unknown' };
    if (response.ok) return { status: 'committed' };
    if (response.status >= 400 && response.status < 500) {
      return { status: 'rejected', httpStatus: response.status };
    }
    return { status: 'unknown' };
  } catch {
    return { status: 'unknown' };
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/** 불변 commit marker와 양쪽 학생 상태가 원자 이동 결과와 모두 일치할 때만 성공으로 확정한다. */
export function isStudentMoveCommitted(evidence: StudentMoveCommitEvidence): boolean {
  return evidence.commitMarkerIsTrue
    && !evidence.sourceStudentExists
    && evidence.destinationStudentExists;
}
