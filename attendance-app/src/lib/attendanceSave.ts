import { auth } from '@/lib/firebase/client';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';
import { normalizeAttendanceValue } from '@/utils/attendanceValue';
import type { AttEditTarget, AttValue } from '@/types';

export class AttendanceSaveError extends Error {
  constructor(public readonly kind: 'conflict' | 'unavailable' | 'unknown' | 'session', message: string) { super(message); }
}
export type AttendanceWrite = { year: number; target: AttEditTarget; expected: AttValue; value: AttValue };

/** 서버에서 읽은 ETag에 한 번만 조건부 저장한다. SDK 오프라인 큐·자동 덮어쓰기 재시도를 사용하지 않는다. */
export async function compareAndSaveAttendance(input: AttendanceWrite, connection: {
  databaseUrl: string;
  token?: string;
  getToken?: () => Promise<string>;
  isCurrent: () => boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  const { year, target, expected, value } = input;
  if (!Number.isInteger(year) || [target.ck, target.sid, target.k].some(key => !key || /[.#$\[\]/\u0000-\u001f]/.test(key))
    || !['', 'O', 'X'].includes(value) || !['', 'O', 'X'].includes(expected)) throw new Error('출석 저장 대상을 확인해 주세요.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sent = false;
  const assertCurrent = () => {
    if (!connection.isCurrent()) throw new AttendanceSaveError('session', '계정 또는 조회 연도가 변경되었습니다. 현재 화면에서 다시 선택해 주세요.');
    if (controller.signal.aborted) throw new Error('timeout');
  };
  const work = async () => {
    assertCurrent();
    const token = connection.getToken ? await connection.getToken() : connection.token;
    assertCurrent();
    if (!token) throw new AttendanceSaveError('session', '다시 로그인한 뒤 출석을 선택해 주세요.');
    const endpoint = new URL(connection.databaseUrl);
    endpoint.pathname = `/attendance/${year}/${[target.ck, target.sid, target.k].map(encodeURIComponent).join('/')}.json`;
    endpoint.searchParams.set('auth', token);
    const url = endpoint.toString();
    const request = connection.fetch ?? globalThis.fetch;
    const options = { cache: 'no-store' as const, signal: controller.signal };
    const current = await request(url, { ...options, headers: { 'X-Firebase-ETag': 'true' } });
    if (!current.ok) throw new AttendanceSaveError('unavailable', '최신 출석을 확인하지 못했습니다. 연결과 권한을 확인한 뒤 재시도해 주세요.');
    const raw: unknown = await current.json();
    assertCurrent();
    // 이미 같은 값이면 응답을 잃은 요청의 재시도도 추가 쓰기 없이 완료한다.
    if (raw === (value || null)) return;
    if (![null, 'O', 'X', 'T'].includes(raw as string | null) || normalizeAttendanceValue(raw) !== expected) {
      throw new AttendanceSaveError('conflict', '다른 담당자가 출석을 변경했습니다. 최신 기록을 확인하고 다시 선택해 주세요.');
    }
    const etag = current.headers.get('etag');
    if (!etag) throw new AttendanceSaveError('unavailable', '안전한 저장을 확인하지 못했습니다. 잠시 후 재시도해 주세요.');
    assertCurrent();
    sent = true;
    const result = await request(url, { ...options, method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': etag }, body: JSON.stringify(value || null) });
    if (result.status === 412) throw new AttendanceSaveError('conflict', '다른 담당자가 먼저 저장했습니다. 최신 기록을 확인하고 다시 선택해 주세요.');
    if (result.status >= 400 && result.status < 500) throw new AttendanceSaveError('unavailable', '출석 저장이 거절되었습니다. 권한을 확인한 뒤 재시도해 주세요.');
    if (!result.ok || controller.signal.aborted) throw new Error('unknown');
  };
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, connection.timeoutMs ?? 15000);
    })]);
  } catch (error) {
    if (error instanceof AttendanceSaveError) throw error;
    throw new AttendanceSaveError(sent ? 'unknown' : 'unavailable', sent
      ? '저장 결과를 확인하지 못했습니다. 재시도하면 최신 값을 먼저 확인합니다.'
      : '연결을 확인하지 못해 저장하지 않았습니다. 연결 후 재시도해 주세요.');
  } finally { clearTimeout(timer); }
}

export function saveAttendanceCell(input: AttendanceWrite, isCurrent: () => boolean = () => true) {
  return withBrowserWriteLock('shared', async () => {
    const user = auth.currentUser;
    if (!user) throw new AttendanceSaveError('session', '다시 로그인한 뒤 출석을 선택해 주세요.');
    return compareAndSaveAttendance(input, {
      databaseUrl: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? '', getToken: () => user.getIdToken(),
      isCurrent: () => auth.currentUser === user && isCurrent(),
    });
  });
}
