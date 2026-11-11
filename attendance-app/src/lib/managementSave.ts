import { RTDB_REST_URL, rtdbRestFetch } from '@/lib/rtdbRest';
import { auth } from '@/lib/firebase/client';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';

export class ManagementSaveError extends Error {
  constructor(public readonly kind: 'conflict' | 'unavailable' | 'unknown' | 'session', message: string) { super(message); }
}
export type ManagementSnapshot<T = unknown> = { value: T; etag: string };
export type ManagementSaveSession = {
  read: <T = unknown>(path: string) => Promise<ManagementSnapshot<T>>;
  write: (path: string, etag: string, value: unknown) => Promise<void>;
  check: () => void;
};
type Connection = { databaseUrl: string; getToken: () => Promise<string>; isCurrent: () => boolean; fetch?: typeof fetch; timeoutMs?: number };

/** 최신 원장에 한 번만 조건부 저장한다. SDK 지연 쓰기·충돌 자동 재전송을 사용하지 않는다. */
export async function compareManagementSave<T>(connection: Connection, task: (session: ManagementSaveSession) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sent = false;
  const check = () => {
    if (!connection.isCurrent()) throw new ManagementSaveError('session', '로그인 또는 조회 상태가 변경되었습니다. 현재 화면에서 다시 열어 주세요.');
    if (controller.signal.aborted) throw new Error('timeout');
  };
  const work = async () => {
    check();
    const token = await connection.getToken();
    check();
    if (!token || !connection.databaseUrl) throw new ManagementSaveError('unavailable', '서버 연결을 확인하지 못했습니다. 연결 후 다시 시도해 주세요.');
    const request = connection.fetch ?? rtdbRestFetch;
    const endpoint = (path: string) => {
      if (!path || path.split('/').some(key => !key || /[.#$\[\]\u0000-\u001f\u007f]/.test(key))) throw new ManagementSaveError('unavailable', '저장 경로를 확인해 주세요.');
      const url = new URL(connection.databaseUrl);
      url.pathname = `/${path.split('/').map(encodeURIComponent).join('/')}.json`;
      url.searchParams.set('auth', token);
      return url.toString();
    };
    const options = { cache: 'no-store' as const, signal: controller.signal };
    return task({ check,
      read: async <V = unknown>(path: string) => {
        check();
        const response = await request(endpoint(path), { ...options, headers: { 'X-Firebase-ETag': 'true' } });
        check();
        if (!response.ok) throw new ManagementSaveError('unavailable', '최신 자료를 확인하지 못했습니다. 연결과 권한을 확인해 주세요.');
        const value = await response.json() as V;
        check();
        return { value, etag: response.headers.get('etag') ?? '' };
      },
      write: async (path, etag, value) => {
        check();
        if (!etag || value === undefined) throw new ManagementSaveError('unavailable', '안전한 저장을 확인하지 못했습니다. 자료를 다시 불러와 주세요.');
        const address = endpoint(path), body = JSON.stringify(value);
        sent = true;
        const response = await request(address, { ...options, method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body });
        if (response.status >= 400 && response.status < 500) {
          sent = false;
          throw new ManagementSaveError(response.status === 412 ? 'conflict' : 'unavailable', response.status === 412
            ? '다른 작업에서 자료를 변경했습니다. 자동 덮어쓰기 없이 중단했으니 최신 자료를 확인해 주세요.'
            : '서버가 요청을 거절했습니다. 연결·권한 또는 진행 중인 학생 이동을 확인해 주세요.');
        }
        if (!response.ok || controller.signal.aborted) throw new Error('unknown');
        sent = false;
        check();
      },
    });
  };
  try {
    return await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, connection.timeoutMs ?? 15_000);
    })]);
  } catch (cause) {
    if (cause instanceof ManagementSaveError) throw cause;
    throw new ManagementSaveError(sent ? 'unknown' : 'unavailable', sent
      ? '저장 결과를 확인하지 못했습니다. 입력은 유지됩니다. 최신 자료를 확인한 뒤 다시 진행해 주세요.'
      : '연결을 확인하지 못해 저장을 진행하지 않았습니다. 입력은 유지됩니다. 연결 후 다시 시도해 주세요.');
  } finally { clearTimeout(timer); }
}

export function runManagementSave<T>(isCurrent: () => boolean, task: (session: ManagementSaveSession) => Promise<T>): Promise<T> {
  return withBrowserWriteLock('shared', () => {
    const user = auth.currentUser;
    if (!user) throw new ManagementSaveError('session', '관리자 계정으로 다시 로그인해 주세요.');
    return compareManagementSave({ databaseUrl: RTDB_REST_URL, getToken: () => user.getIdToken(),
      isCurrent: () => auth.currentUser === user && isCurrent() }, task);
  });
}
