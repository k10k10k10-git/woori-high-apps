import { afterEach, describe, expect, it, vi } from 'vitest';
const dbMocks = vi.hoisted(() => ({ ref: vi.fn((_: unknown, path: string) => path), onValue: vi.fn(), stop: vi.fn() }));
vi.mock('@/lib/db', () => ({ db: {}, ref: dbMocks.ref, onValue: dbMocks.onValue }));
vi.mock('@/lib/firebase/client', () => ({ auth: { currentUser: null } }));
import { compareAndSetFriendRemark, remarkPath, subscribeFriendRemark } from '@/lib/newFriendRemarks';

const key = '2026-sunday/f';
const connection = (request: typeof fetch, isCurrent = () => true) => ({ databaseUrl: 'https://synthetic.example.test', getToken: async () => 'synthetic', isCurrent, fetch: request, timeoutMs: 50 });
const response = (value: unknown, status = 200, etag = '"v1"') => new Response(JSON.stringify(value), { status, headers: etag ? { etag } : undefined });
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.useRealTimers(); });
describe('공유 비고 leaf 계약', () => {
  it('학기·주일 경로만 허용한다', () => {
    expect(remarkPath(key)).toBe('semestersPrivate/2026-sunday/newFriendsPrivate/f/teamMemo');
    for (const bad of ['2026-x/f', '2026-1/../f', '2026-1/f/phone', '2026-1/a.b', '2026-1/']) expect(() => remarkPath(bad)).toThrow();
  });
  it('leaf만 구독하고 빈 비고·조회 실패를 구분하며 해제 뒤 콜백을 무시한다', () => {
    dbMocks.onValue.mockReturnValue(dbMocks.stop);
    const receive = vi.fn(); const stop = subscribeFriendRemark(key, receive);
    const [, success, fail] = dbMocks.onValue.mock.calls.at(-1)!;
    expect(dbMocks.ref).toHaveBeenCalledWith({}, remarkPath(key));
    success({ val: () => null }); expect(receive).toHaveBeenLastCalledWith({ status: 'ready', value: null });
    fail(); expect(receive).toHaveBeenLastCalledWith({ status: 'error', value: null });
    stop(); success({ val: () => '늦은 내용' }); expect(receive).toHaveBeenCalledTimes(2); expect(dbMocks.stop).toHaveBeenCalledOnce();
  });
  it('ETag PUT은 비고만 저장하며 공백 비고는 leaf만 제거한다', async () => {
    const request = vi.fn().mockResolvedValueOnce(response('기존')).mockResolvedValueOnce(response(null));
    await compareAndSetFriendRemark(key, '기존', '  ', connection(request));
    expect(new URL(request.mock.calls[1][0]).pathname).toBe(`/${remarkPath(key)}.json`);
    expect(request.mock.calls[1][1]).toMatchObject({ method: 'PUT', headers: { 'If-Match': '"v1"' }, body: 'null' });
  });
  it('최신 내용이 달라지면 쓰지 않는다', async () => {
    const request = vi.fn().mockResolvedValue(response('다른 수정'));
    await expect(compareAndSetFriendRemark(key, '기존', '작성', connection(request))).rejects.toThrow('다른 관리자');
    expect(request).toHaveBeenCalledOnce();
  });
  it.each([412, 403, 500])('저장 응답 %i를 성공으로 표시하지 않는다', async status => {
    const request = vi.fn().mockResolvedValueOnce(response('기존')).mockResolvedValueOnce(response(null, status));
    await expect(compareAndSetFriendRemark(key, '기존', '작성', connection(request))).rejects.toThrow();
  });
  it('동일 내용 재시도는 GET만 한다', async () => {
    const request = vi.fn().mockResolvedValue(response('작성'));
    await compareAndSetFriendRemark(key, '기존', '작성', connection(request)); expect(request).toHaveBeenCalledOnce();
  });
  it('계정 전환·ETag 없음·너무 긴 비고는 PUT을 하지 않는다', async () => {
    const request = vi.fn().mockResolvedValue(response('기존', 200, ''));
    await expect(compareAndSetFriendRemark(key, '기존', '작성', connection(request, () => false))).rejects.toThrow('계정');
    expect(request).not.toHaveBeenCalled();
    await expect(compareAndSetFriendRemark(key, '기존', '작성', connection(request))).rejects.toThrow('안전한 저장');
    await expect(compareAndSetFriendRemark(key, '기존', '가'.repeat(10001), connection(request))).rejects.toThrow('10,000');
    expect(request).toHaveBeenCalledOnce();
  });
  it('조회 중 계정이 바뀌면 쓰지 않는다', async () => {
    let current = true;
    const request = vi.fn().mockImplementation(async () => { current = false; return response('기존'); });
    await expect(compareAndSetFriendRemark(key, '기존', '작성', connection(request, () => current))).rejects.toThrow('계정');
    expect(request).toHaveBeenCalledOnce();
  });
  it('PUT 응답이 유실되면 확인 불가로 안내한다', async () => {
    const request = vi.fn().mockResolvedValueOnce(response('기존')).mockRejectedValueOnce(new TypeError('offline'));
    await expect(compareAndSetFriendRemark(key, '기존', '작성', connection(request))).rejects.toThrow('저장 결과를 확인하지 못했습니다');
  });
  it('제한 시간 이후 늦은 조회 응답으로 쓰지 않는다', async () => {
    let finish!: (response: Response) => void;
    const request = vi.fn().mockImplementation(() => new Promise<Response>(resolve => { finish = resolve; }));
    await expect(compareAndSetFriendRemark(key, '기존', '작성', connection(request))).rejects.toThrow('저장하지 않았습니다');
    finish(response('기존')); await Promise.resolve(); await Promise.resolve(); expect(request).toHaveBeenCalledOnce();
  });
});
