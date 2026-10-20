import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null } }));
import { buildAttendanceCheckPatch, compareAndSaveAttendanceCheck, type CheckWrite } from '@/lib/attendanceCheckSave';
import { getSundaysForYear } from '@/utils/dates';
import { attendanceChecksPath, normalizeAttendanceChecks, usesOneTap, type AttendanceCheck } from '@/utils/attendanceChecks';

const now = Date.parse('2026-11-01T12:00:00+09:00');
const student = { id: 'a', name: '합성 학생', personId: 'person-a' };
const current = { students: { a: student, b: { id: 'b', name: '다른 학생' }, j: { id: 'j', name: '장결', jang: true }, c: { id: 'c', name: '출석 학생' } } };
const attendance = { a: { '9-2': 'O' }, c: { '10-0': 'O' }, j: { '10-0': 'O' } };
const input: CheckWrite = { year: 2026, target: { ck: '1-1-1', sid: 'a', k: '10-0' }, expected: '', value: 'O', student };
const prefix = 'attendanceChecks/2026/1-1-1/10-0';
const metadata: AttendanceCheck = { revision: 1, startedAt: now, updatedAt: now, updatedBy: 'teacher', operationId: 'first', allAbsent: false,
  targetSid: 'a', targetToken: 'person-a', expected: '', value: 'O', roster: { a: 'person-a', b: 'legacy:다른 학생|', c: 'legacy:출석 학생|' } };
const request = vi.fn<typeof fetch>();
const snapshot = (value: unknown) => new Response(JSON.stringify(value));
const connection = { databaseUrl: 'https://example.test', uid: 'teacher', getToken: async () => 'synthetic', isCurrent: () => true, fetch: request, nowMs: now };
beforeEach(() => request.mockReset());

it('새 주일의 일반 학생 빈칸만 X로 채우고 원장·장결·기존 O·이전 주일을 보존한다', () => {
  const before = structuredClone({ current, attendance });
  const patch = buildAttendanceCheckPatch(input, current, attendance, null, 'teacher', 'first', now)!;
  expect(patch['attendance/2026/1-1-1/a/10-0']).toBe('O');
  expect(patch['attendance/2026/1-1-1/b/10-0']).toBe('X');
  expect(Object.keys(patch).filter(path => path.startsWith('attendance/'))).toHaveLength(2);
  expect(patch[`${prefix}/revision`]).toBe(1);
  expect(patch[`${prefix}/roster/a`]).toBe('person-a');
  expect(patch[`${prefix}/roster/j`]).toBeUndefined();
  expect(patch[`${prefix}/startedAt`]).toEqual({ '.sv': 'timestamp' });
  expect({ current, attendance }).toEqual(before);
});

it('취소는 X로 기록하고 시작 상태·기존 코호트는 유지하며 새 학생 과거 빈칸을 채우지 않는다', () => {
  const patch = buildAttendanceCheckPatch({ ...input, expected: 'O', value: '' }, { students: { ...current.students, later: { id: 'later', name: '뒤에 이동한 학생' } } },
    { ...attendance, a: { '10-0': 'O' } }, metadata, 'teacher', 'next', now)!;
  expect(patch['attendance/2026/1-1-1/a/10-0']).toBe('X');
  expect(patch['attendance/2026/1-1-1/later/10-0']).toBeUndefined();
  expect(patch[`${prefix}/revision`]).toBe(2);
  expect(patch[`${prefix}/startedAt`]).toBe(now);
  expect(Object.keys(patch).some(key => key.includes('/roster/'))).toBe(false);
});

it('전원 결석은 현재 출석을 지우지 않으며 전원 X의 새 반도 시작 기록을 남긴다', () => {
  const none = { ...input, target: { ...input.target, sid: '' }, none: true };
  expect(() => buildAttendanceCheckPatch(none, current, attendance, null, 'teacher', 'none', now)).toThrow('이미 출석');
  const only = { students: { a: student } };
  const patch = buildAttendanceCheckPatch(none, only, { a: { '10-0': 'X' } }, null, 'teacher', 'none', now)!;
  expect(patch[`${prefix}/allAbsent`]).toBe(true);
  expect(patch[`${prefix}/targetSid`]).toBe('');
  expect(Object.keys(patch).some(path => path.startsWith('attendance/'))).toBe(false);
  expect(buildAttendanceCheckPatch(none, only, { a: { '10-0': 'X' } }, { ...metadata, allAbsent: true, roster: { a: 'person-a' } }, 'teacher', 'retry', now)).toBeNull();
  const moved = buildAttendanceCheckPatch(none, { students: { ...only.students, later: { id: 'later', name: '새 학생' } } }, { a: { '10-0': 'X' } },
    { ...metadata, allAbsent: true, roster: { a: 'person-a' } }, 'teacher', 'none-again', now)!;
  expect(moved['attendance/2026/1-1-1/later/10-0']).toBe('X');
  expect(moved[`${prefix}/roster/later`]).toBeUndefined();
});

it('적용 전 주일·미래 날짜·알 수 없는 셀·다른 학생·삭제된 학생은 저장하지 않는다', () => {
  for (const k of ['9-2', '11-0', 'bad']) expect(() => buildAttendanceCheckPatch({ ...input, target: { ...input.target, k } }, current, attendance, null, 'teacher', 'x', now)).toThrow();
  expect(() => buildAttendanceCheckPatch(input, current, { a: { '10-0': 'X' } }, null, 'teacher', 'x', now)).toThrow('다른 담당자');
  expect(() => buildAttendanceCheckPatch(input, { students: {} }, attendance, null, 'teacher', 'x', now)).toThrow();
  expect(() => buildAttendanceCheckPatch(input, { students: { a: { ...student, personId: 'another' } } }, {}, null, 'teacher', 'x', now)).toThrow('명단');
  expect(() => buildAttendanceCheckPatch(input, current, { a: { '10-0': { corrupt: true } } }, null, 'teacher', 'x', now)).toThrow();
});

it('이미 반영된 O의 응답 유실 재시도는 추가 쓰기를 만들지 않는다', () => {
  expect(buildAttendanceCheckPatch(input, current, { a: { '10-0': 'O' } }, metadata, 'teacher', 'retry', now)).toBeNull();
});

it('최신 명단·출석·체크·행사 조회 후 변경을 루트 PATCH 한 번으로 원자 반영한다', async () => {
  request.mockResolvedValueOnce(snapshot(current)).mockResolvedValueOnce(snapshot(attendance)).mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(snapshot({}));
  await compareAndSaveAttendanceCheck(input, connection);
  expect(request).toHaveBeenCalledTimes(5);
  const [url, init] = request.mock.calls[4];
  expect(String(url)).toContain('/.json?auth=');
  expect(init?.method).toBe('PATCH');
  expect(JSON.parse(init?.body as string)[`${prefix}/revision`]).toBe(1);
});

it('Rules 충돌 거절은 자동 재전송하지 않고 저장 실패와 응답 불명을 구분한다', async () => {
  for (const last of [new Response('', { status: 403 }), new Response('', { status: 500 })]) {
    request.mockReset();
    request.mockResolvedValueOnce(snapshot(current)).mockResolvedValueOnce(snapshot(attendance)).mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(last);
    await expect(compareAndSaveAttendanceCheck(input, connection)).rejects.toMatchObject({ kind: last.status === 403 ? 'conflict' : 'unknown' });
    expect(request).toHaveBeenCalledTimes(5);
  }
});

it('조회 중 계정이 바뀌거나 토큰이 지연되면 PATCH를 시작하지 않는다', async () => {
  let valid = true;
  request.mockImplementation(async () => { valid = false; return snapshot(null); });
  await expect(compareAndSaveAttendanceCheck(input, { ...connection, isCurrent: () => valid })).rejects.toMatchObject({ kind: 'session' });
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  request.mockReset();
  await expect(compareAndSaveAttendanceCheck(input, { ...connection, getToken: () => new Promise(() => {}), timeoutMs: 5 })).rejects.toMatchObject({ kind: 'unavailable' });
  expect(request).not.toHaveBeenCalled();
});

it('체크 상태의 빈 값은 정상 미시작이고 손상된 값은 미시작으로 숨기지 않는다', () => {
  expect(normalizeAttendanceChecks(null)).toEqual({});
  expect(normalizeAttendanceChecks({ '1-1-1': { '10-0': metadata } })['1-1-1']['10-0']).toEqual(metadata);
  expect(() => normalizeAttendanceChecks({ '1-1-1': { '10-0': {} } })).toThrow();
  expect(usesOneTap(2026, getSundaysForYear(2026), '9-2')).toBe(false);
  expect(usesOneTap(2026, getSundaysForYear(2026), '9-3')).toBe(true);
  expect(attendanceChecksPath(2026, '1-1-1', '9-3')).toBe('attendanceChecks/2026/1-1-1/9-3');
});
