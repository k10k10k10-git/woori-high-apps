import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null } }));
import { compareAndSetVisitStatus } from '@/lib/visitRequestStatus';
import { parseTeacherMessages } from '@/utils/teacherMessages';
const payload = { kind: 'visit', studentId: 's1', studentName: '합성 학생', text: '연락 필요', author: '합성 교사', createdAt: 100, status: 'open', extra: '원장 필드 보존' };
const expected = parseTeacherMessages({ test: payload }, 'visit')[0];
const response = (data: unknown, status = 200, etag = '"fixture"') => new Response(JSON.stringify(data), { status, headers: { etag } });
const connection = (fetch: ReturnType<typeof vi.fn>, extra = {}) => ({ databaseUrl: 'https://fixture.invalid', getToken: async () => 'synthetic', isCurrent: () => true, fetch, ...extra });
afterEach(() => vi.useRealTimers());
it('원본 필드를 보존하고 ETag 조건부로 처리 상태만 바꾼다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response(null));
  await compareAndSetVisitStatus(2026, '1-1-1', expected, 'done', connection(fetch));
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"fixture"' } });
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ ...payload, status: 'done', resolvedAt: expect.any(Number) });
});
it.each([null, { ...payload, text: '다른 내용' }, { ...payload, studentId: '다른 학생' }])('삭제되거나 변경된 요청을 복원·덮어쓰지 않는다', async value => {
  const fetch = vi.fn().mockResolvedValue(response(value));
  await expect(compareAndSetVisitStatus(2026, '1-1-1', expected, 'done', connection(fetch))).rejects.toThrow();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('이미 처리한 요청의 재시도는 추가 쓰기 없이 완료한다', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ ...payload, status: 'done', resolvedAt: 150 }));
  await compareAndSetVisitStatus(2026, '1-1-1', expected, 'done', connection(fetch));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('재열기는 처리 시간을 제거하되 다른 관리자의 새 처리 시간을 덮지 않는다', async () => {
  const done = parseTeacherMessages({ test: { ...payload, status: 'done', resolvedAt: 150 } }, 'visit')[0];
  const fetch = vi.fn().mockResolvedValueOnce(response({ ...payload, status: 'done', resolvedAt: 150 })).mockResolvedValueOnce(response(null));
  await compareAndSetVisitStatus(2026, '1-1-1', done, 'open', connection(fetch));
  expect(JSON.parse(fetch.mock.calls[1][1].body)).not.toHaveProperty('resolvedAt');
  fetch.mockReset().mockResolvedValue(response({ ...payload, status: 'done', resolvedAt: 200 }));
  await expect(compareAndSetVisitStatus(2026, '1-1-1', done, 'open', connection(fetch))).rejects.toThrow('다른 사용자');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('412 충돌은 자동 재전송하지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(payload)).mockResolvedValueOnce(response(null, 412));
  await expect(compareAndSetVisitStatus(2026, '1-1-1', expected, 'done', connection(fetch))).rejects.toThrow('처리 중 요청이 변경');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('조회 중 계정·연도가 변경되면 전송을 막는다', async () => {
  let current = true;
  const fetch = vi.fn().mockImplementation(async () => { current = false; return response(payload); });
  await expect(compareAndSetVisitStatus(2026, '1-1-1', expected, 'done', connection(fetch, { isCurrent: () => current }))).rejects.toThrow('변경되어');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('토큰 조회에도 15초 제한을 적용하고 늦은 토큰으로 쓰지 않는다', async () => {
  vi.useFakeTimers();
  let resolve!: (token: string) => void;
  const fetch = vi.fn();
  const result = expect(compareAndSetVisitStatus(2026, '1-1-1', expected, 'done', connection(fetch, { getToken: () => new Promise<string>(done => { resolve = done; }) }))).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(15001); await result;
  resolve('late'); await Promise.resolve(); expect(fetch).not.toHaveBeenCalled();
});
it('전송 후 무응답은 결과 확인 안내로 끝내고 재전송하지 않는다', async () => {
  vi.useFakeTimers();
  const fetch = vi.fn().mockResolvedValueOnce(response(payload)).mockImplementationOnce(() => new Promise(() => {}));
  const result = expect(compareAndSetVisitStatus(2026, '1-1-1', expected, 'done', connection(fetch))).rejects.toThrow('저장 결과');
  await vi.advanceTimersByTimeAsync(15001); await result;
  expect(fetch).toHaveBeenCalledTimes(2); expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
});
