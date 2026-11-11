import { RTDB_REST_URL, rtdbRestFetch } from '@/lib/rtdbRest';
import { auth } from '@/lib/firebase/client';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';
import { parseTeacherMessages, type TeacherMessage, type VisitRequestStatus } from '@/utils/teacherMessages';

type Connection = { databaseUrl: string; getToken: () => Promise<string>; isCurrent: () => boolean; fetch?: typeof fetch; timeoutMs?: number };

/** 최신 leaf를 확인한 뒤 ETag 조건부 PUT. 삭제된 요청 복원·다른 관리자 변경 덮어쓰기·SDK 지연 재생을 막는다. */
export async function compareAndSetVisitStatus(year: number, classKey: string, expected: TeacherMessage, status: VisitRequestStatus, connection: Connection) {
  if (!Number.isInteger(year) || [classKey, expected.id].some(key => !key || /[.#$\[\]/\u0000-\u001f]/.test(key))) throw new Error('심방 요청 경로를 확인해 주세요.');
  const controller = new AbortController();
  let sent = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!connection.isCurrent()) throw new Error('계정 또는 조회 연도가 변경되어 저장을 중단했습니다.');
    if (controller.signal.aborted) throw new Error('연결 확인이 지연되었습니다. 다시 불러온 뒤 처리해 주세요.');
  };
  const work = async () => {
    check();
    const token = await connection.getToken();
    check();
    const url = new URL(connection.databaseUrl);
    url.pathname = `/suggestions/${year}/${encodeURIComponent(classKey)}/${encodeURIComponent(expected.id)}.json`;
    url.searchParams.set('auth', token);
    const request = connection.fetch ?? rtdbRestFetch;
    const options = { cache: 'no-store' as const, signal: controller.signal };
    const response = await request(url.toString(), { ...options, headers: { 'X-Firebase-ETag': 'true' } });
    if (!response.ok) throw new Error('심방 요청을 확인하지 못했습니다. 연결과 권한을 확인한 뒤 다시 불러와 주세요.');
    const raw: unknown = await response.json();
    check();
    const current = parseTeacherMessages({ [expected.id]: raw }, 'visit')[0];
    if (!current) throw new Error('삭제되었거나 유효하지 않은 요청입니다. 목록을 다시 불러와 주세요.');
    const fields = ['text', 'createdAt', 'author', 'studentId', 'studentName', 'studentPersonId'] as const;
    if (fields.some(field => current[field] !== expected[field])) throw new Error('다른 사용자가 요청 내용을 변경했습니다. 다시 불러온 뒤 확인해 주세요.');
    if (current.status === status) return; // 응답 불명확 뒤 재확인도 이미 처리한 시간을 바꾸지 않는다.
    if (current.status !== expected.status || current.resolvedAt !== expected.resolvedAt) throw new Error('다른 사용자가 처리 상태를 변경했습니다. 다시 불러온 뒤 확인해 주세요.');
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('안전한 저장을 확인하지 못했습니다. 다시 불러와 주세요.');
    const next: Record<string, unknown> = { ...(raw as Record<string, unknown>), status };
    if (status === 'done') Object.assign(next, { resolvedAt: Date.now() });
    else delete next.resolvedAt;
    check();
    sent = true;
    const result = await request(url.toString(), { ...options, method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(next) });
    if (result.status === 412) throw new Error('처리 중 요청이 변경되었습니다. 다시 불러온 뒤 확인해 주세요.');
    if (result.status >= 400 && result.status < 500) throw new Error('상태 변경이 거절되었습니다. 권한을 확인해 주세요.');
    if (!result.ok || controller.signal.aborted) throw new Error('저장 결과를 확인하지 못했습니다. 목록을 다시 불러와 처리 상태를 확인해 주세요.');
  };
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(sent ? '저장 결과를 확인하지 못했습니다. 목록을 다시 불러와 처리 상태를 확인해 주세요.' : '연결 확인이 지연되어 저장하지 않았습니다. 다시 불러온 뒤 처리해 주세요.'));
      }, connection.timeoutMs ?? 15000);
    })]);
  } catch (error) {
    if (controller.signal.aborted || !(error instanceof Error) || error.name === 'TypeError') throw new Error(sent ? '저장 결과를 확인하지 못했습니다. 목록을 다시 불러와 처리 상태를 확인해 주세요.' : '연결을 확인하지 못해 저장하지 않았습니다. 인터넷 연결 후 다시 불러와 주세요.');
    throw error;
  } finally { clearTimeout(timer); }
}

export function saveVisitRequestStatus(year: number, classKey: string, expected: TeacherMessage, status: VisitRequestStatus, isCurrent: () => boolean) {
  return withBrowserWriteLock('shared', async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('다시 로그인한 뒤 처리해 주세요.');
    return compareAndSetVisitStatus(year, classKey, expected, status, {
      databaseUrl: RTDB_REST_URL, getToken: () => user.getIdToken(),
      isCurrent: () => auth.currentUser === user && isCurrent(),
    });
  });
}
