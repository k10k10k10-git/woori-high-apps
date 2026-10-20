import { describe, expect, it, vi } from 'vitest';
import { createStudentMoveLockTransaction } from '@/utils/studentMoveLockRequest';

const connection = {
  databaseUrl: 'https://example.firebaseio.com/?ns=synthetic',
  idToken: 'secret-token',
  path: 'config/studentMoveLocks/2026',
  isCurrent: () => true,
};

const response = (value: unknown, status = 200, etag: string | null = '"version-1"') => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(etag ? { etag } : {}),
  json: async () => value,
});

describe('학생 이동 잠금 REST 조건부 저장', () => {
  it('서버 ETag와 최신 값으로만 저장하며 다른 반과 ns 쿼리를 보존한다', async () => {
    const other = { '2-1-1': { other: { operation: { phase: 'pending' } } } };
    const fetchOnce = vi.fn()
      .mockResolvedValueOnce(response(other))
      .mockResolvedValueOnce(response(null));
    const next = { ...other, '1-1-1': { owner: { operation: { phase: 'preparing' } } } };
    const updateValue = vi.fn(value => ({ ...(value as Record<string, unknown>), '1-1-1': next['1-1-1'] }));
    await expect(createStudentMoveLockTransaction({ ...connection, fetchOnce })(updateValue))
      .resolves.toEqual({ committed: true, value: next });
    expect(updateValue).toHaveBeenCalledWith(other);
    const [address, getOptions] = fetchOnce.mock.calls[0] as [string, RequestInit];
    expect(new URL(address).pathname).toBe('/config/studentMoveLocks/2026.json');
    expect(new URL(address).searchParams.get('ns')).toBe('synthetic');
    expect(new URL(address).searchParams.get('auth')).toBe('secret-token');
    expect(getOptions).toMatchObject({ method: 'GET', cache: 'no-store', headers: { 'X-Firebase-ETag': 'true' } });
    expect(fetchOnce.mock.calls[1][1]).toMatchObject({
      method: 'PUT', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'If-Match': '"version-1"' },
      body: JSON.stringify(next),
    });
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it('경로 키를 각각 인코딩한다', async () => {
    const fetchOnce = vi.fn().mockResolvedValue(response(null));
    await createStudentMoveLockTransaction({ ...connection, path: 'config/studentMoveLocks/operation%7Eid', fetchOnce })(() => undefined);
    expect(new URL(fetchOnce.mock.calls[0][0]).pathname).toBe('/config/studentMoveLocks/operation%257Eid.json');
  });

  it('갱신 함수가 중단하면 PUT하지 않고 최신 잠금 상태를 돌려준다', async () => {
    const value = { occupied: true };
    const fetchOnce = vi.fn().mockResolvedValue(response(value));
    await expect(createStudentMoveLockTransaction({ ...connection, fetchOnce })(() => undefined))
      .resolves.toEqual({ committed: false, value });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it('잠금 해제의 null도 같은 ETag 조건으로 저장한다', async () => {
    const fetchOnce = vi.fn().mockResolvedValue(response({ occupied: true }));
    await expect(createStudentMoveLockTransaction({ ...connection, fetchOnce })(() => null))
      .resolves.toEqual({ committed: true, value: null });
    expect(fetchOnce.mock.calls[1][1].body).toBe('null');
  });

  it('412일 때만 최신 ETag를 다시 읽고 갱신 함수를 재계산한다', async () => {
    const first = { revision: 1 }, latest = { revision: 2, other: true };
    const fetchOnce = vi.fn()
      .mockResolvedValueOnce(response(first))
      .mockResolvedValueOnce(response(null, 412))
      .mockResolvedValueOnce(response(latest, 200, '"version-2"'))
      .mockResolvedValueOnce(response(null));
    const updateValue = vi.fn(value => ({ ...(value as Record<string, unknown>), own: true }));
    await expect(createStudentMoveLockTransaction({ ...connection, fetchOnce })(updateValue))
      .resolves.toEqual({ committed: true, value: { ...latest, own: true } });
    expect(updateValue.mock.calls).toEqual([[first], [latest]]);
    expect(fetchOnce.mock.calls[3][1]).toMatchObject({ headers: { 'If-Match': '"version-2"' }, body: JSON.stringify({ ...latest, own: true }) });
  });

  it('412 경합은 최대 세 번의 조건부 PUT 뒤 중단한다', async () => {
    const fetchOnce = vi.fn(async (_url: string, init: RequestInit) => response(null, init.method === 'PUT' ? 412 : 200));
    await expect(createStudentMoveLockTransaction({ ...connection, fetchOnce })(() => ({ own: true }))).rejects.toThrow('잠금 결과');
    expect(fetchOnce.mock.calls.map(([, init]) => init.method)).toEqual(['GET', 'PUT', 'GET', 'PUT', 'GET', 'PUT']);
  });

  it.each(['get', 'etag', 'put', 'network', 'json'])('%s 오류를 안전한 오류로 바꾸며 불명확한 쓰기를 재전송하지 않는다', async failure => {
    const fetchOnce = vi.fn(async (_url: string, init: RequestInit) => {
      if (failure === 'network') throw new Error('secret-token');
      if (failure === 'json') return { ...response(null), json: async () => { throw new Error('secret-token'); } };
      return response(null, failure === 'get' && init.method === 'GET' ? 403 : failure === 'put' && init.method === 'PUT' ? 503 : 200, failure === 'etag' ? null : '"version"');
    });
    const result = createStudentMoveLockTransaction({ ...connection, fetchOnce })(() => ({ own: true }));
    await expect(result).rejects.toThrow('학생 이동 잠금 결과를 확인하지 못했습니다.');
    await expect(result).rejects.not.toThrow('secret-token');
    expect(fetchOnce).toHaveBeenCalledTimes(failure === 'put' ? 2 : 1);
  });

  it.each(['isCurrent', 'isActive'] as const)('%s가 바뀐 GET 응답 뒤에는 PUT하지 않는다', async guard => {
    let active = true;
    const fetchOnce = vi.fn(async () => ({ ...response(null), json: async () => { active = false; return null; } }));
    await expect(createStudentMoveLockTransaction({ ...connection, [guard]: () => active, fetchOnce })(() => ({ own: true })))
      .rejects.toThrow('잠금 결과');
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it('갱신 함수 안에서 대상이 바뀌어도 PUT하지 않는다', async () => {
    let current = true;
    const fetchOnce = vi.fn().mockResolvedValue(response(null));
    await expect(createStudentMoveLockTransaction({ ...connection, isCurrent: () => current, fetchOnce })(() => {
      current = false; return { own: true };
    })).rejects.toThrow('잠금 결과');
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it('PUT 응답 뒤 계정이나 작업이 바뀌면 성공을 반환하지 않는다', async () => {
    let current = true;
    const fetchOnce = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.method === 'PUT') current = false;
      return response(null);
    });
    await expect(createStudentMoveLockTransaction({ ...connection, isCurrent: () => current, fetchOnce })(() => ({ own: true })))
      .rejects.toThrow('잠금 결과');
    expect(fetchOnce).toHaveBeenCalledTimes(2);
  });

  it('시작 전 인증이나 활성 범위가 없으면 요청하지 않는다', async () => {
    const fetchOnce = vi.fn();
    for (const invalid of [{ idToken: '' }, { databaseUrl: undefined }, { isCurrent: () => false }, { isActive: () => false }]) {
      await expect(createStudentMoveLockTransaction({ ...connection, ...invalid, fetchOnce })(() => ({ own: true }))).rejects.toThrow('잠금 결과');
    }
    expect(fetchOnce).not.toHaveBeenCalled();
  });

  it('Abort를 무시하는 늦은 GET도 제한 시간에 반환하고 나중에 PUT하지 않는다', async () => {
    vi.useFakeTimers();
    try {
      let deliver: (value: ReturnType<typeof response>) => void = () => {};
      const fetchOnce = vi.fn<(url: string, init: RequestInit) => Promise<ReturnType<typeof response>>>(
        () => new Promise(resolve => { deliver = resolve; }),
      );
      const result = createStudentMoveLockTransaction({ ...connection, fetchOnce, timeoutMs: 100 })(() => ({ own: true }));
      const rejected = expect(result).rejects.toThrow('잠금 결과');
      await vi.advanceTimersByTimeAsync(100);
      await rejected;
      deliver(response(null));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchOnce).toHaveBeenCalledTimes(1);
      expect(fetchOnce.mock.calls[0][1].signal?.aborted).toBe(true);
    } finally { vi.useRealTimers(); }
  });

  it('응답이 늦은 PUT은 불명확한 상태로 종료하고 재전송하거나 성공으로 바꾸지 않는다', async () => {
    vi.useFakeTimers();
    try {
      let deliver: (value: ReturnType<typeof response>) => void = () => {};
      const fetchOnce = vi.fn(async (_url: string, init: RequestInit) => init.method === 'GET'
        ? response(null)
        : new Promise<ReturnType<typeof response>>(resolve => { deliver = resolve; }));
      const result = createStudentMoveLockTransaction({ ...connection, fetchOnce, timeoutMs: 100 })(() => ({ own: true }));
      const rejected = expect(result).rejects.toThrow('잠금 결과');
      await vi.advanceTimersByTimeAsync(100);
      await rejected;
      deliver(response(null));
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchOnce).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
});
