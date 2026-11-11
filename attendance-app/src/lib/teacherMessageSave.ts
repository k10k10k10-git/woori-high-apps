import { RTDB_REST_URL, rtdbRestFetch } from '@/lib/rtdbRest';
import { auth } from '@/lib/firebase/client';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';
import type { TeacherMessage } from '@/utils/teacherMessages';

export type TeacherMessageWrite = Omit<TeacherMessage, 'id' | 'resolvedAt'>;
export class TeacherMessageSaveError extends Error {
  constructor(message: string, public readonly kind: 'unavailable' | 'unknown' = 'unavailable') { super(message); }
}

/** 고정 요청 키 + 빈 leaf ETag로 한 번만 생성한다. SDK 오프라인 큐와 자동 재전송은 사용하지 않는다. */
export async function compareAndCreateTeacherMessage(
  year: number, classKey: string, id: string, payload: TeacherMessageWrite,
  connection: { databaseUrl: string; getToken: () => Promise<string>; isCurrent: () => boolean; canCreate?: () => boolean; fetch?: typeof fetch; timeoutMs?: number },
) {
  if (!Number.isInteger(year) || [classKey, id].some(key => !key || /[.#$\[\]/\u0000-\u001f]/.test(key))
    || !payload.text.trim()) throw new TeacherMessageSaveError('등록 내용을 확인해 주세요.');
  const controller = new AbortController();
  let sent = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!connection.isCurrent()) throw new TeacherMessageSaveError('계정 또는 조회 연도가 변경되었습니다. 현재 화면에서 다시 확인해 주세요.');
    if (controller.signal.aborted) throw new Error('timeout');
  };
  const work = async () => {
    check();
    const token = await connection.getToken();
    check();
    const url = new URL(connection.databaseUrl);
    url.pathname = `/suggestions/${year}/${encodeURIComponent(classKey)}/${encodeURIComponent(id)}.json`;
    url.searchParams.set('auth', token);
    const request = connection.fetch ?? rtdbRestFetch;
    const options = { cache: 'no-store' as const, signal: controller.signal };
    const current = await request(url.toString(), { ...options, headers: { 'X-Firebase-ETag': 'true' } });
    if (!current.ok) throw new TeacherMessageSaveError('저장 결과를 확인하지 못했습니다. 연결과 권한을 확인한 뒤 다시 시도해 주세요.');
    const raw: unknown = await current.json();
    check();
    if (raw !== null) {
      // 관리자가 처리 완료로 바꿨더라도 최초 등록 내용이 같으면 재등록·상태 되돌리기를 하지 않는다.
      if (raw && typeof raw === 'object' && Object.entries(payload).every(([key, value]) => key === 'status' || (raw as Record<string, unknown>)[key] === value)) return;
      throw new TeacherMessageSaveError('같은 요청 번호의 다른 기록이 있어 저장하지 않았습니다. 관리자에게 확인해 주세요.');
    }
    const etag = current.headers.get('etag');
    if (!etag) throw new TeacherMessageSaveError('안전한 저장을 확인하지 못했습니다. 다시 시도해 주세요.');
    check();
    if (connection.canCreate && !connection.canCreate()) throw new TeacherMessageSaveError('선택한 학생이 이동·변경되어 등록하지 않았습니다. 관리자에게 확인해 주세요.');
    sent = true;
    const saved = await request(url.toString(), { ...options, method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(payload) });
    if (saved.status === 412) throw new TeacherMessageSaveError('동일 요청의 저장 상태가 바뀌었습니다. 다시 누르면 결과를 먼저 확인합니다.', 'unknown');
    if (saved.status >= 400 && saved.status < 500) throw new TeacherMessageSaveError('저장이 거절되었습니다. 권한을 확인한 뒤 다시 시도해 주세요.');
    if (!saved.ok || controller.signal.aborted) throw new Error('unknown');
  };
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, connection.timeoutMs ?? 15000);
    })]);
  } catch (error) {
    if (error instanceof TeacherMessageSaveError) throw error;
    throw new TeacherMessageSaveError(sent
      ? '저장 결과를 확인하지 못했습니다. 내용을 보존했습니다. 다시 누르면 같은 요청의 결과부터 확인합니다.'
      : '연결 확인이 지연되어 저장하지 않았습니다. 내용을 보존했으니 연결 후 다시 시도해 주세요.', sent ? 'unknown' : 'unavailable');
  } finally { clearTimeout(timer); }
}

export function saveTeacherMessage(year: number, classKey: string, id: string, payload: TeacherMessageWrite, isCurrent: () => boolean, canCreate: () => boolean) {
  return withBrowserWriteLock('shared', async () => {
    const user = auth.currentUser;
    if (!user) throw new TeacherMessageSaveError('다시 로그인한 뒤 등록해 주세요.');
    return compareAndCreateTeacherMessage(year, classKey, id, payload, {
      databaseUrl: RTDB_REST_URL, getToken: () => user.getIdToken(),
      isCurrent: () => auth.currentUser === user && isCurrent(), canCreate,
    });
  });
}
