import { RTDB_REST_URL, rtdbRestFetch } from '@/lib/rtdbRest';
import { auth } from '@/lib/firebase/client';
import { AttendanceSaveError } from './attendanceSave';
import { withBrowserWriteLock } from '@/utils/browserWriteLock';
import { mergeStudentEdit } from '@/utils/studentPersistence';
import { normalizeAttendanceValue } from '@/utils/attendanceValue';
import { attendanceWeekDate, attendanceChecksPath, attendanceStudentToken, ONE_TAP_START_DATE, type AttendanceCheck } from '@/utils/attendanceChecks';
import { buildEvents, buildHolidayRanges, getSundaysForYear, getWindowYears } from '@/utils/dates';
import type { AttEditTarget, AttValue, Student } from '@/types';

export type CheckWrite = { year: number; target: AttEditTarget; expected: AttValue; value: AttValue; student?: Student; none?: boolean };
type StoredClass = { students?: Record<string, Student> };
type RawAttendance = Record<string, Record<string, unknown>>;

/** 새 체크 주일만, 최신 원장의 빈칸만 채운다. 기존 O/X와 다른 주일은 그대로 둔다. */
export function buildAttendanceCheckPatch(input: CheckWrite, current: StoredClass | null, attendance: RawAttendance | null,
  previous: AttendanceCheck | null, uid: string, operationId: string, nowMs = Date.now()) {
  const { year, target, expected, none } = input;
  if (!['', 'O', 'X'].includes(expected) || !['', 'O', 'X'].includes(input.value)) throw new AttendanceSaveError('unavailable', '출석 값을 확인해 주세요.');
  const value = input.value === '' ? 'X' : input.value;
  const date = attendanceWeekDate(year, getSundaysForYear(year), target.k);
  const today = new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 10);
  if (!date || date < ONE_TAP_START_DATE || date > today) throw new AttendanceSaveError('unavailable', '새 출석 방식은 2026년 10월 25일부터 지난 정상 주일에만 사용할 수 있습니다.');
  const students = current?.students ?? {};
  const active = Object.entries(students).filter(([, student]) => student.jang !== true);
  if (!active.length) throw new AttendanceSaveError('conflict', '출석 대상 학생이 없습니다. 최신 명단을 확인해 주세요.');
  if (!none) {
    const latest = students[target.sid];
    if (!latest || latest.jang === true || !input.student || !mergeStudentEdit({ ...latest, id: target.sid }, input.student, input.student)) {
      throw new AttendanceSaveError('conflict', '학생이 이동·삭제되었거나 명단이 변경되었습니다. 최신 명단에서 다시 선택해 주세요.');
    }
    const raw = attendance?.[target.sid]?.[target.k] ?? null;
    if (![null, '', 'O', 'T', 'X'].includes(raw as string | null)) throw new AttendanceSaveError('conflict', '최신 출석 기록을 확인해 주세요.');
    if (normalizeAttendanceValue(raw) !== expected) {
      if (previous && normalizeAttendanceValue(raw) === value) return null;
      throw new AttendanceSaveError('conflict', '다른 담당자가 출석을 변경했습니다. 최신 기록을 확인하고 다시 선택해 주세요.');
    }
  } else if (active.some(([id]) => normalizeAttendanceValue(attendance?.[id]?.[target.k]) === 'O')) {
    throw new AttendanceSaveError('conflict', '이미 출석한 학생이 있습니다. 출석 기록을 지우지 않았습니다. 최신 명단을 확인해 주세요.');
  }
  const roster = previous?.roster ?? Object.fromEntries(active.map(([id, student]) => [id, attendanceStudentToken(student)]));
  const patch: Record<string, unknown> = {};
  // 전원 결석은 교사가 현재 명단 전체를 직접 확인하는 예외 동작이다.
  const targets = none ? Object.fromEntries(active.map(([id, student]) => [id, attendanceStudentToken(student)])) : roster;
  for (const [id, token] of Object.entries(targets)) {
    const student = students[id], raw = attendance?.[id]?.[target.k];
    if (student && student.jang !== true && token === attendanceStudentToken(student) && (raw == null || raw === '')) {
      patch[`attendance/${year}/${target.ck}/${id}/${target.k}`] = 'X';
    }
  }
  if (!none) patch[`attendance/${year}/${target.ck}/${target.sid}/${target.k}`] = value;
  if (none && previous?.allAbsent && !Object.keys(patch).length) return null;
  const metadata = {
    revision: (previous?.revision ?? 0) + 1,
    startedAt: previous?.startedAt ?? { '.sv': 'timestamp' }, updatedAt: { '.sv': 'timestamp' }, updatedBy: uid, operationId,
    allAbsent: none === true, targetSid: none ? '' : target.sid, targetToken: none ? '' : attendanceStudentToken(input.student!), expected: none ? '' : expected, value: none ? '' : value,
  };
  const path = attendanceChecksPath(year, target.ck, target.k);
  for (const [field, value] of Object.entries(metadata)) patch[`${path}/${field}`] = value;
  if (!previous) for (const [sid, token] of Object.entries(roster)) patch[`${path}/roster/${sid}`] = token;
  return patch;
}

type Connection = { databaseUrl: string; uid: string; getToken: () => Promise<string>; isCurrent: () => boolean; fetch?: typeof fetch; timeoutMs?: number; nowMs?: number };

/** Rules가 체크 revision·사전 셀·다른 학생 O 보존을 함께 검사하는 원자 PATCH. 실패를 자동 재전송하지 않는다. */
export async function compareAndSaveAttendanceCheck(input: CheckWrite, connection: Connection) {
  const { year, target } = input;
  if (!Number.isInteger(year) || [target.ck, target.k, ...(input.none ? [] : [target.sid])].some(key => !key || /[.#$\[\]/\u0000-\u001f]/.test(key))) throw new Error('출석 저장 경로를 확인해 주세요.');
  const controller = new AbortController(); let sent = false; let timer: ReturnType<typeof setTimeout> | undefined;
  const check = () => {
    if (!connection.isCurrent()) throw new AttendanceSaveError('session', '계정 또는 조회 상태가 변경되었습니다. 다시 선택해 주세요.');
    if (controller.signal.aborted) throw new Error('timeout');
  };
  const work = async () => {
    check(); const token = await connection.getToken(); check();
    if (!token) throw new AttendanceSaveError('session', '다시 로그인해 주세요.');
    const url = new URL(connection.databaseUrl); url.searchParams.set('auth', token);
    const request = connection.fetch ?? rtdbRestFetch;
    const options = { cache: 'no-store' as const, signal: controller.signal };
    const read = async (path: string) => {
      const endpoint = new URL(url); endpoint.pathname = `/${path}.json`;
      const response = await request(endpoint, options);
      if (!response.ok) throw new AttendanceSaveError('unavailable', '최신 명단·출석·체크 상태를 확인하지 못했습니다. 연결과 권한을 확인해 주세요.');
      return response.json();
    };
    const [current, attendance, previous, customEvents] = await Promise.all([
      read(`classes/${year}/${target.ck}`), read(`attendance/${year}/${target.ck}`), read(attendanceChecksPath(year, target.ck, target.k)),
      read(`events/${year}`),
    ]);
    check();
    const events = buildEvents(year, getSundaysForYear(year), buildHolidayRanges(getWindowYears(year)), customEvents ?? {});
    if (events[target.k]) throw new AttendanceSaveError('unavailable', '행사 주일은 출석을 입력하지 않습니다. 다른 주일을 선택해 주세요.');
    const patch = buildAttendanceCheckPatch(input, current, attendance, previous, connection.uid, crypto.randomUUID(), connection.nowMs);
    if (!patch) return;
    check(); sent = true; url.pathname = '/.json';
    const response = await request(url, { ...options, method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
    if (response.status >= 400 && response.status < 500) throw new AttendanceSaveError('conflict', '다른 담당자가 먼저 저장했거나 명단·권한이 변경되었습니다. 자동 덮어쓰기 없이 중단했습니다. 최신 기록을 확인해 주세요.');
    if (!response.ok || controller.signal.aborted) throw new Error('unknown');
  };
  try {
    await Promise.race([work(), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('timeout')); }, connection.timeoutMs ?? 15000); })]);
  } catch (error) {
    if (error instanceof AttendanceSaveError) throw error;
    throw new AttendanceSaveError(sent ? 'unknown' : 'unavailable', sent ? '저장 결과를 확인하지 못했습니다. 재시도하면 최신 기록을 먼저 확인합니다.' : '연결을 확인하지 못해 저장하지 않았습니다. 연결 후 재시도해 주세요.');
  } finally { clearTimeout(timer); }
}

export function saveAttendanceCheck(input: CheckWrite, isCurrent: () => boolean) {
  return withBrowserWriteLock('shared', async () => {
    const user = auth.currentUser;
    if (!user) throw new AttendanceSaveError('session', '다시 로그인해 주세요.');
    return compareAndSaveAttendanceCheck(input, { databaseUrl: RTDB_REST_URL, uid: user.uid,
      getToken: () => user.getIdToken(), isCurrent: () => auth.currentUser === user && isCurrent() });
  });
}
