import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null } }));
import { compareAndSaveAttendance } from '@/lib/attendanceSave';
import type { Student } from '@/types';
const target = { ck: '1-1-1', sid: 's', k: '8-0' };
const student = { id: 's', name: '합성 학생', personId: 'person-original' };
const input = { year: 2026, target, student, expected: '' as const, value: 'O' as const };
const request = vi.fn<typeof fetch>();
const connection = { databaseUrl: 'https://example.test/?ns=synthetic', uid: 'teacher', token: 'synthetic-token', isCurrent: () => true, fetch: request };
const snapshot = (value: unknown) => new Response(JSON.stringify(value));
const receipt = { revision: 2, studentToken: 'person-original', expected: '', value: 'O', operationId: 'previous', updatedBy: 'teacher', updatedAt: 1700000000000 };
const cellPath = 'attendance/2026/1-1-1/s/8-0';
const receiptPath = 'attendanceCellWrites/2026/1-1-1/s/8-0';
function reads(raw: unknown = null, latest: unknown = student, previous: unknown = null) {
  request.mockResolvedValueOnce(snapshot(latest)).mockResolvedValueOnce(snapshot(raw)).mockResolvedValueOnce(snapshot(previous));
}
beforeEach(() => { request.mockReset(); });

it('최신 학생·셀·영수증을 확인하고 셀과 신원 영수증만 루트 PATCH 한 번으로 저장한다', async () => {
  reads(); request.mockResolvedValueOnce(snapshot({}));
  await compareAndSaveAttendance(input, connection);
  expect(request).toHaveBeenCalledTimes(4);
  expect(request.mock.calls.slice(0, 3).map(([url]) => new URL(String(url)).pathname)).toEqual([
    '/classes/2026/1-1-1/students/s.json', `/${cellPath}.json`, `/${receiptPath}.json`,
  ]);
  const [url, init] = request.mock.calls[3];
  expect(new URL(String(url)).pathname).toBe('/.json');
  expect(new URL(String(url)).searchParams.get('ns')).toBe('synthetic');
  expect(init).toMatchObject({ method: 'PATCH', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  expect(init?.headers).not.toHaveProperty('If-Match');
  expect(JSON.parse(init?.body as string)).toEqual({
    [cellPath]: 'O', [receiptPath]: { revision: 1, studentToken: 'person-original', expected: '', value: 'O',
      operationId: expect.any(String), updatedBy: 'teacher', updatedAt: { '.sv': 'timestamp' } },
  });
});

it('기존 영수증 revision을 증가시키고 기존 출석·다른 학생 경로는 payload에 넣지 않는다', async () => {
  reads('X', student, receipt); request.mockResolvedValueOnce(snapshot({}));
  await compareAndSaveAttendance({ ...input, expected: 'X' }, connection);
  const payload = JSON.parse(request.mock.calls[3][1]?.body as string);
  expect(Object.keys(payload)).toEqual([cellPath, receiptPath]);
  expect(payload[receiptPath]).toMatchObject({ revision: 3, expected: 'X', value: 'O' });
});

it('다른 기기가 이미 값을 바꿨으면 쓰지 않는다', async () => {
  reads('X');
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'conflict' });
  expect(request).toHaveBeenCalledTimes(3);
});

it.each([403, 412])('조회 뒤 학생·사전값·revision이 바뀌어 Rules가 %i 거절하면 재전송하지 않는다', async status => {
  reads(); request.mockResolvedValueOnce(new Response('', { status }));
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'conflict' });
  expect(request).toHaveBeenCalledTimes(4);
});

it('응답 유실 뒤에도 최초 학생 신원을 확인하고 같은 값이면 다시 쓰지 않는다', async () => {
  reads(); request.mockRejectedValueOnce(new Error('synthetic-token'));
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'unknown' });
  reads('O', student, receipt);
  await compareAndSaveAttendance(input, connection);
  expect(request).toHaveBeenCalledTimes(7);
  expect(request.mock.calls.filter(([, init]) => init?.method === 'PATCH')).toHaveLength(1);
});

it.each([null, { ...student, personId: 'replacement' }])('이동·삭제·같은 SID 교체는 기존 셀이 O여도 성공으로 오인하지 않는다: %j', async latest => {
  reads('O', latest);
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'conflict' });
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it('구주일 저장 토큰 대기 중 같은 SID의 인물이 바뀌면 PATCH를 보내지 않는다', async () => {
  let finish!: (value: string) => void;
  const saving = compareAndSaveAttendance(input, { ...connection, getToken: () => new Promise<string>(resolve => { finish = resolve; }) });
  reads(null, { ...student, personId: 'replacement' });
  finish('synthetic-token');
  await expect(saving).rejects.toMatchObject({ kind: 'conflict' });
  expect(request).toHaveBeenCalledTimes(3);
});

it('영구 ID가 없는 옛 명단은 이름·생년·연락처 등의 변경도 확인한다', async () => {
  const original = { id: 's', name: '옛 학생', birth: '2010-01-01', phone: 'synthetic-original' };
  reads(null, { ...original, phone: 'synthetic-replacement' });
  await expect(compareAndSaveAttendance({ ...input, student: original }, connection)).rejects.toMatchObject({ kind: 'conflict' });
  expect(request).toHaveBeenCalledTimes(3);
});

it('필수 학생 snapshot 누락·다른 SID는 서버 요청 전에 거절한다', async () => {
  for (const original of [undefined, { ...student, id: 'other' }]) {
    await expect(compareAndSaveAttendance({ ...input, student: original as Student }, connection)).rejects.toMatchObject({ kind: 'conflict' });
  }
  expect(request).not.toHaveBeenCalled();
});

it('사전 조회 권한 실패는 PATCH 전에 중단하고 인증값을 노출하지 않는다', async () => {
  request.mockResolvedValue(new Response('', { status: 403 }));
  const saving = compareAndSaveAttendance(input, connection);
  await expect(saving).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(saving).rejects.not.toThrow('synthetic-token');
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});

it.each([{}, [], { ...receipt, revision: 1.5 }, { ...receipt, revision: Number.MAX_SAFE_INTEGER }, { ...receipt, value: 'bad' }])('손상된 영수증은 없음으로 취급하거나 덮어쓰지 않는다: %j', async previous => {
  reads('O', student, previous);
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'unavailable' });
  expect(request).toHaveBeenCalledTimes(3);
});

it('조회 중 계정 또는 연도가 바뀌면 저장하지 않는다', async () => {
  let current = true;
  request.mockImplementation(async url => { current = false; return snapshot(String(url).includes('/classes/') ? student : null); });
  await expect(compareAndSaveAttendance(input, { ...connection, isCurrent: () => current })).rejects.toMatchObject({ kind: 'session' });
  expect(request).toHaveBeenCalledTimes(3);
});

it('레거시 출석 T는 O와 비교하되 알 수 없는 값은 덮지 않는다', async () => {
  reads('T'); request.mockResolvedValueOnce(snapshot({}));
  await compareAndSaveAttendance({ ...input, expected: 'O', value: 'X' }, connection);
  expect(JSON.parse(request.mock.calls[3][1]?.body as string)[receiptPath]).toMatchObject({ expected: 'O', value: 'X' });
  reads({ corrupted: true });
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'conflict' });
});

it.each([null, ''])('이전 미입력 값 %j를 정상 빈칸으로 읽어 선택한 셀만 저장한다', async raw => {
  reads(raw); request.mockResolvedValueOnce(snapshot({}));
  await compareAndSaveAttendance(input, connection);
  expect(JSON.parse(request.mock.calls[3][1]?.body as string)[cellPath]).toBe('O');
});

it('장결자의 과거 출석 취소도 셀 null·삭제 검증용 non-null 영수증을 함께 저장한다', async () => {
  const longAbsent = { ...student, jang: true };
  reads('O', longAbsent); request.mockResolvedValueOnce(snapshot({}));
  await compareAndSaveAttendance({ ...input, student: longAbsent, expected: 'O', value: '' }, connection);
  expect(JSON.parse(request.mock.calls[3][1]?.body as string)).toMatchObject({
    [cellPath]: null, [receiptPath]: { expected: 'O', value: '', studentToken: 'person-original' },
  });
});

it('네트워크 단절은 제한 시간 후 중단하고 큐에 남기지 않는다', async () => {
  request.mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('offline')))));
  await expect(compareAndSaveAttendance(input, { ...connection, timeoutMs: 10 })).rejects.toMatchObject({ kind: 'unavailable' });
  expect(request).toHaveBeenCalledTimes(3);
});

it('PATCH 무응답은 결과 불명이며 제한 시간 후 자동 재전송하지 않는다', async () => {
  reads(); request.mockImplementationOnce((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('offline')))));
  await expect(compareAndSaveAttendance(input, { ...connection, timeoutMs: 10 })).rejects.toMatchObject({ kind: 'unknown' });
  expect(request).toHaveBeenCalledTimes(4);
});

it('토큰 갱신도 전체 시간 제한에 포함하고 늦은 토큰은 요청을 시작하지 않는다', async () => {
  let finish!: (value: string) => void;
  const getToken = () => new Promise<string>(resolve => { finish = resolve; });
  await expect(compareAndSaveAttendance(input, { ...connection, getToken, timeoutMs: 10 })).rejects.toMatchObject({ kind: 'unavailable' });
  finish('late-token');
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(request).not.toHaveBeenCalled();
});
