import { db, ref, onValue } from '@/lib/db';
import { auth } from '@/lib/firebase/client';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';

export const REMARK_LIMIT = 10000;
export type RemarkLoad = { status: 'loading' | 'ready' | 'error'; value: string | null };

export function remarkPath(key: string) {
  const [workspace, id, extra] = key.split('/');
  if (!/^[0-9]{4}-(1|2|sunday)$/.test(workspace) || !id || extra !== undefined || /[.#$\[\]\u0000-\u001f]/.test(id)) throw new Error('새친구 경로를 확인해 주세요.');
  return `semestersPrivate/${workspace}/newFriendsPrivate/${id}/teamMemo`;
}

/** 비공개 원장 전체가 아니라 승인된 비고 leaf만 구독한다. */
export function subscribeFriendRemark(key: string, receive: (load: RemarkLoad) => void) {
  const path = remarkPath(key);
  let active = true;
  const timer = setTimeout(() => { if (active) receive({ status: 'error', value: null }); }, 12000);
  const stop = onValue(ref(db, path), snapshot => {
    if (!active) return;
    clearTimeout(timer);
    const value: unknown = snapshot.val();
    receive(value === null || typeof value === 'string' ? { status: 'ready', value } : { status: 'error', value: null });
  }, () => { if (active) { clearTimeout(timer); receive({ status: 'error', value: null }); } });
  return () => { active = false; clearTimeout(timer); stop(); };
}

type Connection = { databaseUrl: string; getToken: () => Promise<string>; isCurrent: () => boolean; fetch?: typeof fetch; timeoutMs?: number };

/** ETag 조건부 leaf 저장. 다른 비공개 필드·공개 등록 기록은 쓰지 않는다. */
export async function compareAndSetFriendRemark(key: string, expected: string | null, draft: string, connection: Connection) {
  const path = remarkPath(key);
  if (draft.length > REMARK_LIMIT) throw new Error('비고는 10,000자 이내로 작성해 주세요.');
  const next = draft.trim() || null;
  const controller = new AbortController();
  let sent = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const uncertain = '저장 결과를 확인하지 못했습니다. 작성 내용은 유지됩니다. 최신 비고를 확인한 뒤 다시 저장해 주세요.';
  const check = () => {
    if (!connection.isCurrent()) throw new Error('계정 또는 조회 연도가 변경되어 저장을 중단했습니다.');
    if (controller.signal.aborted) throw new Error('연결 확인이 지연되었습니다. 다시 시도해 주세요.');
  };
  const work = async () => {
    check();
    const token = await connection.getToken();
    check();
    const url = new URL(connection.databaseUrl);
    url.pathname = `/${path.split('/').map(encodeURIComponent).join('/')}.json`;
    url.searchParams.set('auth', token);
    const request = connection.fetch ?? globalThis.fetch;
    const options = { cache: 'no-store' as const, signal: controller.signal };
    const response = await request(url.toString(), { ...options, headers: { 'X-Firebase-ETag': 'true' } });
    if (!response.ok) throw new Error('비고를 확인하지 못했습니다. 로그인과 조회 권한을 확인해 주세요.');
    const current: unknown = await response.json();
    check();
    if (current !== null && typeof current !== 'string') throw new Error('비고 자료 형식을 확인해 주세요.');
    if (current === next) return; // 응답 불명확 후 재시도도 이미 저장된 내용은 다시 쓰지 않는다.
    if (current !== expected) throw new Error('다른 관리자가 비고를 수정했습니다. 작성 내용은 유지됩니다. 최신 비고를 확인해 주세요.');
    const etag = response.headers.get('etag');
    if (!etag) throw new Error('안전한 저장을 확인하지 못했습니다. 다시 시도해 주세요.');
    check();
    sent = true;
    const result = await request(url.toString(), { ...options, method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(next) });
    if (result.status === 412) throw new Error('저장 중 비고가 변경되었습니다. 작성 내용은 유지됩니다. 최신 비고를 확인해 주세요.');
    if (result.status >= 400 && result.status < 500) throw new Error('비고 저장이 거절되었습니다. 학생 등록 상태와 수정 권한을 확인해 주세요.');
    if (!result.ok || controller.signal.aborted) throw new Error(uncertain);
  };
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error(sent ? uncertain : '연결 확인이 지연되어 저장하지 않았습니다. 다시 시도해 주세요.')); }, connection.timeoutMs ?? 15000);
    })]);
  } catch (error) {
    if (controller.signal.aborted || !(error instanceof Error) || error.name === 'TypeError') throw new Error(sent ? uncertain : '인터넷 연결을 확인하지 못해 저장하지 않았습니다. 작성 내용은 유지됩니다.');
    throw error;
  } finally { clearTimeout(timer); }
}

export function saveFriendRemark(key: string, expected: string | null, draft: string, isCurrent: () => boolean) {
  return withBrowserWriteLock('shared', async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('다시 로그인한 뒤 저장해 주세요.');
    await compareAndSetFriendRemark(key, expected, draft, {
      databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '', getToken: () => user.getIdToken(),
      isCurrent: () => auth.currentUser === user && isCurrent(),
    });
  });
}
