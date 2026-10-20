import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: { currentUser: null as null | { email: string; getIdToken: () => Promise<string> } } }));
vi.mock('@/lib/firebase/client', () => ({ auth: m.auth }));
vi.mock('@/lib/demo', () => ({ isDemoAccount: (email?: string) => email === 'demo@example.test' }));
import { buildLongAbsentReturn, compareAndReturnLongAbsent, returnLongAbsentStudent } from '@/lib/longAbsentReturn';
const student = { id: 'long', name: '합성 장결 학생', personId: 'person-long', jang: true, phone: 'old', num: 2 };
const current = { teacher: '합성 교사', extra: '반 보존', students: { long: { ...student, id: 'legacy', phone: 'remote', addr: '주소', photo: '사진' }, other: { id: 'other', name: '다른 학생' } }, adminChanges: { old: { extra: '이력 보존' } } };
const input = { year: 2026, classKey: '1-1-1', student, actor: '합성 관리자' };
const response = (data: unknown, status = 200, etag = '"class-current"') => new Response(JSON.stringify(data), { status, headers: etag ? { etag } : {} });
const connection = (fetch: ReturnType<typeof vi.fn>, extra = {}) => ({ databaseUrl: 'https://fixture.invalid', getToken: async () => 'synthetic', isCurrent: () => true, fetch, ...extra });
beforeEach(() => { m.auth.currentUser = null; });
afterEach(() => vi.useRealTimers());
it('장결 상태만 바꾸고 최신 정보·반·다른 학생·이력을 보존한다', () => {
  const next = buildLongAbsentReturn(current, student, '1-1-1', 'change', '관리자', new Date(0))!;
  expect(next.students!.long).toEqual({ ...current.students.long, jang: false });
  expect(next.students!.other).toEqual(current.students.other);
  expect(next).toMatchObject({ teacher: current.teacher, extra: '반 보존', adminChanges: { old: current.adminChanges.old, change: { classKey: '1-1-1', studentId: 'long', personId: 'person-long', action: '학생 정보 수정', changeSummary: expect.stringContaining('일반 명단 복귀') } } });
  expect(JSON.stringify(next.adminChanges)).not.toContain('remote');
  expect(current.students.long.jang).toBe(true);
});
it.each([null, { ...current, students: {} }, { ...current, students: { long: { ...student, personId: 'another-person' } } }] as Array<Parameters<typeof buildLongAbsentReturn>[0]>)('삭제·이동·다른 인물 대체는 복원하지 않는다', value => {
  expect(buildLongAbsentReturn(value, student, '1-1-1', 'change', '관리자', new Date())).toBeUndefined();
});
it('영구 ID 없는 학생은 변경된 개인정보로 동일인이라 추정하지 않는다', () => {
  const legacy = { ...student, personId: undefined };
  expect(buildLongAbsentReturn({ students: { long: { ...legacy, name: '다른 학생' } } }, legacy, '1-1-1', 'change', '관리자', new Date())).toBeUndefined();
});
it('이미 일반 명단이면 추가 감사 기록 없이 멱등 완료한다', async () => {
  const active = { ...current, students: { ...current.students, long: { ...current.students.long, jang: false } } };
  expect(buildLongAbsentReturn(active, student, '1-1-1', 'change', '관리자', new Date())).toBe(active);
  const fetch = vi.fn().mockResolvedValue(response(active));
  await compareAndReturnLongAbsent(input, connection(fetch));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('일반 학생도 최신 원본의 장결 상태만 지정하고 ID·번호·정보·기존 이력을 보존한다', async () => {
  const opened = { ...student, jang: false };
  const active = { ...current, students: { ...current.students, long: { ...current.students.long, jang: false } } };
  const before = structuredClone(active);
  const next = buildLongAbsentReturn(active, opened, '1-1-1', 'change', '관리자', new Date(0), true)!;
  expect(next.students!.long).toEqual({ ...active.students.long, jang: true });
  expect(next.students!.other).toEqual(active.students.other);
  expect(next).toMatchObject({ teacher: active.teacher, extra: active.extra, adminChanges: { old: active.adminChanges.old, change: { studentId: student.id, personId: student.personId, changeSummary: '일반 학생 → 장결자로 지정 · 기존 출석 이력 유지' } } });
  expect(active).toEqual(before);
  const fetch = vi.fn().mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(null));
  await compareAndReturnLongAbsent({ ...input, student: opened, nextJang: true }, connection(fetch));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(new URL(fetch.mock.calls[1][0]).pathname).toBe('/classes/2026/1-1-1.json');
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"class-current"' } });
  expect(JSON.parse(fetch.mock.calls[1][1].body).students.long).toEqual({ ...active.students.long, jang: true });
});
it('이미 장결로 지정되었으면 추가 쓰기·이력 없이 완료한다', async () => {
  const fetch = vi.fn().mockResolvedValue(response(current));
  await compareAndReturnLongAbsent({ ...input, student: { ...student, jang: false }, nextJang: true }, connection(fetch));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([null, { ...current, students: {} }, { ...current, students: { long: { ...student, personId: 'another-person' } } }] as Array<Parameters<typeof buildLongAbsentReturn>[0]>)('장결 지정도 삭제·이동·다른 인물 대체를 거절한다', value => {
  expect(buildLongAbsentReturn(value, { ...student, jang: false }, '1-1-1', 'change', '관리자', new Date(), true)).toBeUndefined();
});
it('영구 ID 없는 일반 학생의 정보가 바뀌면 장결 지정도 중단한다', () => {
  const legacy = { ...student, personId: undefined, jang: false };
  expect(buildLongAbsentReturn({ students: { long: { ...legacy, phone: '다른 값' } } }, legacy, '1-1-1', 'change', '관리자', new Date(), true)).toBeUndefined();
});
it.each([412, 403, 500])('장결 지정의 충돌·권한·서버 실패(%s)는 자동 재전송하지 않는다', async status => {
  const active = { ...current, students: { ...current.students, long: { ...current.students.long, jang: false } } };
  const fetch = vi.fn().mockResolvedValueOnce(response(active)).mockResolvedValueOnce(response(null, status));
  await expect(compareAndReturnLongAbsent({ ...input, student: { ...student, jang: false }, nextJang: true }, connection(fetch))).rejects.toThrow(/장결 지정/);
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('최신 반의 ETag로 상태와 이력을 한 번만 원자 저장하며 출석 경로는 쓰지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(null));
  await compareAndReturnLongAbsent(input, connection(fetch));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(new URL(fetch.mock.calls[1][0]).pathname).toBe('/classes/2026/1-1-1.json');
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"class-current"' } });
  const next = JSON.parse(fetch.mock.calls[1][1].body);
  expect(next.students.long).toEqual({ ...current.students.long, jang: false });
  expect(Object.keys(next.adminChanges)).toHaveLength(2);
});
it.each([412, 403, 500])('충돌·권한 거절·서버 실패(%s)는 자동 재전송하지 않는다', async status => {
  const fetch = vi.fn().mockResolvedValueOnce(response(current)).mockResolvedValueOnce(response(null, status));
  await expect(compareAndReturnLongAbsent(input, connection(fetch))).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('계정·연도·권한이 조회 중 바뀌면 쓰지 않는다', async () => {
  let valid = true;
  const fetch = vi.fn().mockImplementation(async () => { valid = false; return response(current); });
  await expect(compareAndReturnLongAbsent(input, connection(fetch, { isCurrent: () => valid }))).rejects.toThrow('조회 상태');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('ETag가 없으면 저장하지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValue(response(current, 200, ''));
  await expect(compareAndReturnLongAbsent(input, connection(fetch))).rejects.toThrow('안전한 저장');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('지연된 토큰은 시간 제한 후 쓰기를 시작하지 않는다', async () => {
  vi.useFakeTimers(); let resolve!: (value: string) => void;
  const fetch = vi.fn();
  const pending = expect(compareAndReturnLongAbsent(input, connection(fetch, { getToken: () => new Promise<string>(done => { resolve = done; }) }))).rejects.toThrow('복귀하지 않았습니다');
  await vi.advanceTimersByTimeAsync(15001); await pending;
  resolve('late'); await Promise.resolve(); expect(fetch).not.toHaveBeenCalled();
});
it('전송 후 응답 유실은 결과 확인으로 안내하고 멱등 재확인한다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(current)).mockRejectedValueOnce(new TypeError('network'));
  await expect(compareAndReturnLongAbsent(input, connection(fetch))).rejects.toThrow('복귀 결과');
  expect(fetch).toHaveBeenCalledTimes(2);
  fetch.mockReset().mockResolvedValue(response({ ...current, students: { ...current.students, long: { ...current.students.long, jang: false } } }));
  await compareAndReturnLongAbsent(input, connection(fetch)); expect(fetch).toHaveBeenCalledTimes(1);
});
it.each([null, { email: 'demo@example.test', getIdToken: async () => 'synthetic' }])('미인증·데모 계정은 시작하지 않는다', async user => {
  m.auth.currentUser = user;
  await expect(returnLongAbsentStudent(input, () => true)).rejects.toThrow('관리자 계정');
});
