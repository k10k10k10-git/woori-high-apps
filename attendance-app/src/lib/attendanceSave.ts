import { RTDB_REST_URL, rtdbRestFetch } from '@/lib/rtdbRest';
import { auth } from '@/lib/firebase/client';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';
import { normalizeAttendanceValue } from '@/utils/attendanceValue';
import { attendanceStudentToken } from '@/utils/attendanceChecks';
import { mergeStudentEdit } from '@/utils/studentPersistence';
import type { AttEditTarget, AttValue, Student } from '@/types';

export class AttendanceSaveError extends Error {
  constructor(public readonly kind: 'conflict' | 'unavailable' | 'unknown' | 'session', message: string) { super(message); }
}
export type AttendanceWrite = { year: number; target: AttEditTarget; expected: AttValue; value: AttValue; student: Student };
type CellWriteReceipt = { revision: number; studentToken: string; expected: AttValue; value: AttValue; operationId: string; updatedBy: string; updatedAt: number };

function receiptRevision(value: unknown): number {
  if (value === null) return 0;
  const receipt = value as CellWriteReceipt | null;
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)
    || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1 || receipt.revision >= Number.MAX_SAFE_INTEGER
    || typeof receipt.studentToken !== 'string' || !receipt.studentToken || typeof receipt.operationId !== 'string' || !receipt.operationId
    || typeof receipt.updatedBy !== 'string' || !receipt.updatedBy || !Number.isFinite(receipt.updatedAt)
    || !['', 'O', 'X'].includes(receipt.expected) || !['', 'O', 'X'].includes(receipt.value)) {
    throw new AttendanceSaveError('unavailable', '출석 저장 상태를 확인하지 못했습니다. 다시 불러와 주세요.');
  }
  return receipt.revision;
}

/** 셀과 신원·사전값 영수증을 한 번만 PATCH한다. 최종 비교는 Rules가 하며 오프라인 큐·자동 재전송은 없다. */
export async function compareAndSaveAttendance(input: AttendanceWrite, connection: {
  databaseUrl: string;
  uid: string;
  token?: string;
  getToken?: () => Promise<string>;
  isCurrent: () => boolean;
  fetch?: typeof fetch;
  timeoutMs?: number;
}) {
  const { year, target, expected, value, student } = input;
  if (!Number.isInteger(year) || [target.ck, target.sid, target.k].some(key => !key || /[.#$\[\]/\u0000-\u001f]/.test(key))
    || !['', 'O', 'X'].includes(value) || !['', 'O', 'X'].includes(expected)) throw new Error('출석 저장 대상을 확인해 주세요.');
  if (!student || student.id !== target.sid || typeof student.name !== 'string' || !student.name.trim()) {
    throw new AttendanceSaveError('conflict', '출석을 선택한 학생을 확인하지 못했습니다. 최신 명단에서 다시 선택해 주세요.');
  }
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
    if (!token || !connection.uid) throw new AttendanceSaveError('session', '다시 로그인한 뒤 출석을 선택해 주세요.');
    const endpoint = new URL(connection.databaseUrl);
    endpoint.searchParams.set('auth', token);
    const request = connection.fetch ?? rtdbRestFetch;
    const options = { cache: 'no-store' as const, signal: controller.signal };
    const read = async (path: string): Promise<unknown> => {
      const url = new URL(endpoint);
      url.pathname = `/${path.split('/').map(encodeURIComponent).join('/')}.json`;
      const response = await request(url.toString(), options);
      if (!response.ok) throw new AttendanceSaveError('unavailable', '최신 명단·출석·저장 상태를 확인하지 못했습니다. 연결과 권한을 확인한 뒤 재시도해 주세요.');
      return response.json();
    };
    const cellPath = `attendance/${year}/${target.ck}/${target.sid}/${target.k}`;
    const receiptPath = `attendanceCellWrites/${year}/${target.ck}/${target.sid}/${target.k}`;
    const [current, raw, receipt] = await Promise.all([
      read(`classes/${year}/${target.ck}/students/${target.sid}`), read(cellPath), read(receiptPath),
    ]);
    assertCurrent();
    if (!current || typeof current !== 'object' || Array.isArray(current) || typeof (current as Student).name !== 'string'
      || !mergeStudentEdit({ ...current as Student, id: target.sid }, student, student)) {
      throw new AttendanceSaveError('conflict', '학생이 이동·삭제되었거나 명단이 변경되었습니다. 최신 명단에서 다시 선택해 주세요.');
    }
    const revision = receiptRevision(receipt);
    // 학생부터 확인해야 다른 학생의 같은 값을 이전 요청 성공으로 오인하지 않는다.
    if (raw === (value || null)) return;
    if (![null, '', 'O', 'X', 'T'].includes(raw as string | null) || normalizeAttendanceValue(raw) !== expected) {
      throw new AttendanceSaveError('conflict', '다른 담당자가 출석을 변경했습니다. 최신 기록을 확인하고 다시 선택해 주세요.');
    }
    const payload = {
      [cellPath]: value || null,
      [receiptPath]: { revision: revision + 1, studentToken: attendanceStudentToken(student), expected, value,
        operationId: crypto.randomUUID(), updatedBy: connection.uid, updatedAt: { '.sv': 'timestamp' } },
    };
    assertCurrent();
    sent = true;
    endpoint.pathname = '/.json';
    const result = await request(endpoint.toString(), { ...options, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (result.status >= 400 && result.status < 500) throw new AttendanceSaveError('conflict', '다른 담당자가 먼저 저장했거나 학생·권한이 변경되었습니다. 자동 덮어쓰기 없이 중단했습니다. 최신 명단과 기록을 확인해 주세요.');
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
      databaseUrl: RTDB_REST_URL, uid: user.uid, getToken: () => user.getIdToken(),
      isCurrent: () => auth.currentUser === user && isCurrent(),
    });
  });
}
