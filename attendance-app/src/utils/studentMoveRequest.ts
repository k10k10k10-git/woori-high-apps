export type StudentMovePatchResult =
  | { status: 'committed' }
  | { status: 'rejected'; httpStatus?: number }
  | { status: 'unknown' };

export const STUDENT_MOVE_PATCH_TIMEOUT_MS = 30_000;

type FetchOnce = (
  input: string,
  init: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status'>>;

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
