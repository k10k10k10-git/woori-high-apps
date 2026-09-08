import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null } }));
import { compareAndSaveAttendance } from '@/lib/attendanceSave';
const target = { ck: '1-1-1', sid: 's', k: '8-0' };
const input = { year: 2026, target, expected: '' as const, value: 'O' as const };
const request = vi.fn<typeof fetch>();
const connection = { databaseUrl: 'https://example.test', token: 'synthetic', isCurrent: () => true, fetch: request };
const snapshot = (value: unknown, etag = '"v1"') => new Response(JSON.stringify(value), { headers: etag ? { ETag: etag } : {} });
beforeEach(() => { request.mockReset(); });
it('읽었던 값에 해당하는 ETag로 해당 셀만 한 번 저장한다', async () => {
  request.mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(new Response('"O"'));
  await compareAndSaveAttendance(input, connection);
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"v1"' }, body: '"O"' });
});
it('다른 기기가 이미 값을 바꿨으면 쓰지 않는다', async () => {
  request.mockResolvedValue(snapshot('X'));
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'conflict' });
  expect(request).toHaveBeenCalledTimes(1);
});
it('조회와 저장 사이에 다른 요청이 먼저 반영되면 자동 재시도하지 않는다', async () => {
  request.mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(new Response('', { status: 412 }));
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'conflict' });
  expect(request).toHaveBeenCalledTimes(2);
});
it('응답 유실 후 같은 값이 보이면 다시 쓰지 않는다', async () => {
  request.mockResolvedValueOnce(snapshot(null)).mockRejectedValueOnce(new Error('network'));
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'unknown' });
  request.mockResolvedValueOnce(snapshot('O'));
  await compareAndSaveAttendance(input, connection);
  expect(request).toHaveBeenCalledTimes(3);
});
it('사전 조회 권한 실패와 ETag 누락은 PUT 전에 중단한다', async () => {
  request.mockResolvedValueOnce(new Response('', { status: 403 })).mockResolvedValueOnce(snapshot(null, ''));
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'unavailable' });
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'unavailable' });
  expect(request.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it('조회 중 계정 또는 연도가 바뀌면 저장하지 않는다', async () => {
  let current = true;
  request.mockImplementation(async () => { current = false; return snapshot(null); });
  await expect(compareAndSaveAttendance(input, { ...connection, isCurrent: () => current })).rejects.toMatchObject({ kind: 'session' });
  expect(request).toHaveBeenCalledTimes(1);
});
it('레거시 출석 T는 화면의 O와 비교하되 알 수 없는 값은 덮지 않는다', async () => {
  request.mockResolvedValueOnce(snapshot('T')).mockResolvedValueOnce(new Response('"X"'));
  await compareAndSaveAttendance({ ...input, expected: 'O', value: 'X' }, connection);
  request.mockResolvedValueOnce(snapshot({ corrupted: true }));
  await expect(compareAndSaveAttendance(input, connection)).rejects.toMatchObject({ kind: 'conflict' });
});
it('네트워크 단절은 제한 시간 후 중단하고 큐에 남기지 않는다', async () => {
  request.mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('offline')))));
  await expect(compareAndSaveAttendance(input, { ...connection, timeoutMs: 10 })).rejects.toMatchObject({ kind: 'unavailable' });
  expect(request).toHaveBeenCalledTimes(1);
});
