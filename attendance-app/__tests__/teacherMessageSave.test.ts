import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null } }));
import { compareAndCreateTeacherMessage } from '@/lib/teacherMessageSave';
const payload = { kind: 'visit' as const, studentId: 's1', studentName: '합성 학생', text: '합성 심방 요청', status: 'open' as const, createdAt: 100, author: '합성 교사' };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { etag: '"fixture"' } });
const connection = (fetch: ReturnType<typeof vi.fn>, extra = {}) => ({ databaseUrl: 'https://fixture.invalid', getToken: async () => 'fixture-token', isCurrent: () => true, fetch, ...extra });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it('빈 요청 leaf에 ETag 조건부로 한 번만 생성한다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(null)).mockResolvedValueOnce(response(payload));
  await compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toContain('/suggestions/2026/1-1-1/msg_fixture.json');
  expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"fixture"' } });
});
it('응답을 잃은 뒤 같은 키에 등록돼 있으면 처리 완료 상태를 되돌리거나 중복 생성하지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ ...payload, status: 'done', resolvedAt: 200 }));
  await compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch));
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('같은 요청 키의 다른 내용은 덮어쓰지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ ...payload, text: '다른 내용' }));
  await expect(compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch))).rejects.toThrow('다른 기록');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('학생 이동이 서버 확인 중 발생하면 신규 전송을 중단한다', async () => {
  const fetch = vi.fn().mockResolvedValue(response(null));
  await expect(compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch, { canCreate: () => false }))).rejects.toThrow('이동·변경');
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('조회가 무응답이면 15초 뒤 끝나고 저장을 시작하지 않는다', async () => {
  const fetch = vi.fn().mockImplementation(() => new Promise(() => {}));
  const result = expect(compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch))).rejects.toThrow('저장하지 않았습니다');
  await vi.advanceTimersByTimeAsync(15001);
  await result;
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
});
it('인증 토큰 조회도 기한에 포함하고 늦게 돌아온 토큰으로 쓰지 않는다', async () => {
  let finish!: (token: string) => void;
  const fetch = vi.fn();
  const result = expect(compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch, { getToken: () => new Promise<string>(resolve => { finish = resolve; }) }))).rejects.toThrow('저장하지 않았습니다');
  await vi.advanceTimersByTimeAsync(15001);
  await result;
  finish('late-token');
  await Promise.resolve();
  expect(fetch).not.toHaveBeenCalled();
});
it('전송 무응답은 실패 확정이 아니라 결과 확인이 필요한 상태로 안내한다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(null)).mockImplementationOnce(() => new Promise(() => {}));
  const result = expect(compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch))).rejects.toThrow('같은 요청의 결과');
  await vi.advanceTimersByTimeAsync(15001);
  await result;
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('최신 요청과 충돌한 412 응답에는 자동 재전송하지 않는다', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(response(null)).mockResolvedValueOnce(response(null, 412));
  await expect(compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch))).rejects.toThrow('결과를 먼저 확인');
  expect(fetch).toHaveBeenCalledTimes(2);
});
it('계정·연도가 바뀌면 최신 원장 조회 후에도 PUT을 보내지 않는다', async () => {
  let current = true;
  const fetch = vi.fn().mockImplementation(async () => { current = false; return response(null); });
  await expect(compareAndCreateTeacherMessage(2026, '1-1-1', 'msg_fixture', payload, connection(fetch, { isCurrent: () => current }))).rejects.toThrow('변경되었습니다');
  expect(fetch).toHaveBeenCalledTimes(1);
});
