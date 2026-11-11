import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ user: null as { uid: string; getIdToken: () => Promise<string> } | null }));
vi.mock('@/lib/firebase/client', () => ({ auth: { get currentUser() { return m.user; } } }));
// Firebase REST 를 흉내 내는 fetch 는 그대로 두고, 앱의 REST 출구(rtdbRest → Supabase)만 그 fetch 로 잇는다.
vi.mock('@/lib/rtdbRest', () => ({ RTDB_REST_URL: 'https://synthetic.firebaseio.test', rtdbRestFetch: (input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init) }));
import { compareManagementSave, runManagementSave } from '@/lib/managementSave';

const request = vi.fn<typeof fetch>();
const connection = () => ({ databaseUrl: 'https://synthetic.firebaseio.test/?ns=synthetic', getToken: async () => 'synthetic-token', isCurrent: () => true, fetch: request });
const snapshot = (value: unknown) => new Response(JSON.stringify(value), { headers: { etag: '"fresh"' } });
beforeEach(() => { vi.clearAllMocks(); m.user = { uid: 'synthetic-admin', getIdToken: async () => 'synthetic-token' }; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('인증된 최신 ETag만 사용해 단일 노드를 한 번 저장하고 namespace를 보존한다', async () => {
  request.mockResolvedValueOnce(snapshot({ existing: '보존' })).mockResolvedValueOnce(snapshot({}));
  await compareManagementSave(connection(), async session => {
    const current = await session.read<{ existing: string }>('classes/2026/1-1-1');
    await session.write('classes/2026/1-1-1', current.etag, { ...current.value, added: '변경' });
  });
  expect(request).toHaveBeenCalledTimes(2);
  const [url, options] = request.mock.calls[1];
  expect(String(url)).toContain('/classes/2026/1-1-1.json');
  expect(new URL(String(url)).searchParams.get('ns')).toBe('synthetic');
  expect(options).toMatchObject({ method: 'PUT', cache: 'no-store', headers: { 'If-Match': '"fresh"' }, body: JSON.stringify({ existing: '보존', added: '변경' }) });
});
it.each([403, 412])('명시 거절 %s는 결과 불명으로 표시하거나 자동 재전송하지 않는다', async status => {
  request.mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(new Response('null', { status }));
  await expect(compareManagementSave(connection(), async session => {
    const read = await session.read('classes/2026/1-1-1'); await session.write('classes/2026/1-1-1', read.etag, {});
  })).rejects.toMatchObject({ kind: status === 412 ? 'conflict' : 'unavailable' });
  expect(request).toHaveBeenCalledTimes(2);
});
it('사본 PUT 성공 뒤 명단 GET 실패는 새 삭제 전송의 결과 불명으로 취급하지 않는다', async () => {
  request.mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(snapshot({})).mockRejectedValueOnce(new TypeError('offline'));
  await expect(compareManagementSave(connection(), async session => {
    const copy = await session.read('trash/2026/students/copy'); await session.write('trash/2026/students/copy', copy.etag, { name: '합성' });
    await session.read('classes/2026/1-1-1');
  })).rejects.toMatchObject({ kind: 'unavailable' });
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
});
it('사본 확정 뒤 최종 삭제 전송이 끊기면 unknown을 구분하고 재전송하지 않는다', async () => {
  request.mockResolvedValueOnce(snapshot(null)).mockResolvedValueOnce(snapshot({})).mockResolvedValueOnce(snapshot({ teacher: '합성' })).mockRejectedValueOnce(new TypeError('offline'));
  await expect(compareManagementSave(connection(), async session => {
    const copy = await session.read('trash/2026/classes/copy'); await session.write('trash/2026/classes/copy', copy.etag, { teacher: '합성' });
    const current = await session.read('classes/2026/1-1-1'); await session.write('classes/2026/1-1-1', current.etag, null);
  })).rejects.toMatchObject({ kind: 'unknown' });
  expect(request).toHaveBeenCalledTimes(4);
});
it('ETag가 없으면 쓰지 않는다', async () => {
  request.mockResolvedValueOnce(new Response('null'));
  await expect(compareManagementSave(connection(), async session => {
    const current = await session.read('classes/2026/1-1-1'); await session.write('classes/2026/1-1-1', current.etag, {});
  })).rejects.toMatchObject({ kind: 'unavailable' });
  expect(request).toHaveBeenCalledOnce();
});
it('조회 뒤 화면·역할 범위가 바뀌면 PUT을 보내지 않는다', async () => {
  let current = true;
  request.mockResolvedValueOnce(snapshot({}));
  await expect(compareManagementSave({ ...connection(), isCurrent: () => current }, async session => {
    const read = await session.read('classes/2026/1-1-1'); current = false; await session.write('classes/2026/1-1-1', read.etag, {});
  })).rejects.toMatchObject({ kind: 'session' });
  expect(request).toHaveBeenCalledOnce();
});
it('멈춘 토큰은 시간 제한 뒤 복구하고 늦은 완료가 저장을 시작하지 않는다', async () => {
  vi.useFakeTimers(); let deliver!: (token: string) => void;
  const result = compareManagementSave({ ...connection(), getToken: () => new Promise<string>(resolve => { deliver = resolve; }) }, session => session.write('classes/2026/1-1-1', 'etag', {}));
  const rejected = expect(result).rejects.toMatchObject({ kind: 'unavailable' });
  await vi.advanceTimersByTimeAsync(15_000); await rejected;
  deliver('synthetic-token'); await vi.advanceTimersByTimeAsync(0);
  expect(request).not.toHaveBeenCalled();
});
it('멈춘 PUT은 unknown으로 풀고 늦은 응답 뒤 다음 쓰기를 시작하지 않는다', async () => {
  vi.useFakeTimers(); let deliver!: (response: Response) => void;
  request.mockReturnValueOnce(new Promise<Response>(resolve => { deliver = resolve; }));
  const result = compareManagementSave(connection(), async session => {
    await session.write('classes/2026/1-1-1', 'etag', {}); await session.write('classes/2026/1-1-2', 'etag', {});
  });
  const rejected = expect(result).rejects.toMatchObject({ kind: 'unknown' });
  await vi.advanceTimersByTimeAsync(15_000); await rejected;
  deliver(snapshot({})); await vi.advanceTimersByTimeAsync(0);
  expect(request).toHaveBeenCalledOnce();
});
it('토큰 대기 중 계정이 바뀌면 현재 UI가 유지되어도 요청을 시작하지 않는다', async () => {
  let deliver!: (token: string) => void;
  m.user = { uid: 'first-admin', getIdToken: () => new Promise<string>(resolve => { deliver = resolve; }) };
  vi.stubGlobal('fetch', request);
  const result = runManagementSave(() => true, session => session.write('classes/2026/1-1-1', 'etag', {}));
  m.user = { uid: 'second-admin', getIdToken: async () => 'another-token' }; deliver('old-token');
  await expect(result).rejects.toMatchObject({ kind: 'session' }); expect(request).not.toHaveBeenCalled();
});
it('관리자 화면 범위가 아니면 인증 토큰과 서버 요청을 시작하지 않는다', async () => {
  const token = vi.fn(async () => 'synthetic-token'); m.user = { uid: 'admin', getIdToken: token };
  await expect(runManagementSave(() => false, async session => { await session.read('classes'); })).rejects.toMatchObject({ kind: 'session' });
  expect(token).not.toHaveBeenCalled(); expect(request).not.toHaveBeenCalled();
});
