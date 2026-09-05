import { describe, expect, it, vi } from 'vitest';
import {
  STUDENT_MOVE_PATCH_TIMEOUT_MS,
  isStudentMoveCommitted,
  patchStudentMoveOnce,
} from '@/utils/studentMoveRequest';

describe('patchStudentMoveOnce', () => {
  it('루트 multipath PATCH를 정확히 한 번만 전송한다', async () => {
    const fetchOnce = vi.fn(async () => ({ ok: true, status: 200 }));
    const payload = {
      'classes/2026/1-1-1/students/S11_01': null,
      'classes/2026/1-1-2/students/S11_01': { id: 'S11_01', name: '홍길동' },
    };

    await expect(patchStudentMoveOnce({
      databaseUrl: 'https://example.firebaseio.com/',
      idToken: 'token value',
      payload,
      fetchOnce,
    })).resolves.toEqual({ status: 'committed' });

    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(fetchOnce).toHaveBeenCalledWith(
      'https://example.firebaseio.com/.json?auth=token%20value',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        cache: 'no-store',
      }),
    );
  });

  it('네트워크 예외에도 PATCH를 재시도하지 않고 토큰이 든 오류를 노출하지 않는다', async () => {
    const fetchOnce = vi.fn(async (url: string) => {
      throw new Error(`요청 실패: ${url}`);
    });
    const result = await patchStudentMoveOnce({
      databaseUrl: 'https://example.firebaseio.com',
      idToken: 'secret-token',
      payload: { path: null },
      fetchOnce,
    });

    expect(fetchOnce).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: 'unknown' });
    expect(JSON.stringify(result)).not.toContain('secret-token');
    expect(JSON.stringify(result)).not.toContain('firebaseio.com');
  });

  it('서버 거절은 상태 코드만 반환하고 재시도하지 않는다', async () => {
    const fetchOnce = vi.fn(async () => ({ ok: false, status: 403 }));

    await expect(patchStudentMoveOnce({
      databaseUrl: 'https://example.firebaseio.com',
      idToken: 'secret-token',
      payload: { path: null },
      fetchOnce,
    })).resolves.toEqual({ status: 'rejected', httpStatus: 403 });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it('5xx 응답은 반영 여부를 단정하지 않고 재시도하지 않는다', async () => {
    const fetchOnce = vi.fn(async () => ({ ok: false, status: 503 }));

    await expect(patchStudentMoveOnce({
      databaseUrl: 'https://example.firebaseio.com',
      idToken: 'secret-token',
      payload: { path: null },
      fetchOnce,
    })).resolves.toEqual({ status: 'unknown' });
    expect(fetchOnce).toHaveBeenCalledTimes(1);
  });

  it('30초가 지나면 한 번뿐인 요청을 중단하고 unknown으로 유지한다', async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | null | undefined;
      const fetchOnce = vi.fn((_url: string, init: RequestInit) => new Promise<never>((_resolve, reject) => {
        signal = init.signal;
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      }));
      const request = patchStudentMoveOnce({
        databaseUrl: 'https://example.firebaseio.com',
        idToken: 'secret-token',
        payload: { path: null },
        fetchOnce,
      });

      await vi.advanceTimersByTimeAsync(STUDENT_MOVE_PATCH_TIMEOUT_MS - 1);
      expect(signal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await expect(request).resolves.toEqual({ status: 'unknown' });
      expect(signal?.aborted).toBe(true);
      expect(fetchOnce).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('isStudentMoveCommitted', () => {
  it('불변 commit marker와 양쪽 학생 상태가 모두 맞아야 성공으로 확정한다', () => {
    expect(isStudentMoveCommitted({
      commitMarkerIsTrue: true,
      sourceStudentExists: false,
      destinationStudentExists: true,
    })).toBe(true);
    expect(isStudentMoveCommitted({
      commitMarkerIsTrue: false,
      sourceStudentExists: false,
      destinationStudentExists: true,
    })).toBe(false);
    expect(isStudentMoveCommitted({
      commitMarkerIsTrue: true,
      sourceStudentExists: true,
      destinationStudentExists: true,
    })).toBe(false);
  });
});
