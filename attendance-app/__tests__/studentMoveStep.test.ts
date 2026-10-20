import { afterEach, expect, it, vi } from 'vitest';
import { awaitStudentMoveStep } from '@/utils/studentMoveStep';

afterEach(() => vi.useRealTimers());

it('성공과 실패 뒤 타이머를 해제한다', async () => {
  vi.useFakeTimers();
  await expect(awaitStudentMoveStep(Promise.resolve(7))).resolves.toBe(7);
  await expect(awaitStudentMoveStep(Promise.reject(new Error('실패')))).rejects.toThrow('실패');
  expect(vi.getTimerCount()).toBe(0);
});

it('취소 API 없는 Promise도 15초 뒤 반환하고 늦은 거절을 처리한다', async () => {
  vi.useFakeTimers();
  let reject!: (cause: Error) => void;
  const onTimeout = vi.fn();
  const result = awaitStudentMoveStep(new Promise<void>((_resolve, fail) => { reject = fail; }), { onTimeout });
  const assertion = expect(result).rejects.toThrow('시간이 지났습니다');
  await vi.advanceTimersByTimeAsync(15_000);
  await assertion;
  expect(onTimeout).toHaveBeenCalledOnce();
  reject(new Error('늦은 거절'));
  await Promise.resolve();
  expect(vi.getTimerCount()).toBe(0);
});

it('화면 해제 신호는 타이머를 기다리지 않고 대기를 종료한다', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const result = awaitStudentMoveStep(new Promise<void>(() => {}), { signal: controller.signal });
  const assertion = expect(result).rejects.toThrow('중단');
  controller.abort();
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});

it('이미 해제된 화면과 정리용 5초 제한도 지킨다', async () => {
  vi.useFakeTimers();
  const controller = new AbortController(); controller.abort();
  await expect(awaitStudentMoveStep(Promise.resolve('늦음'), { signal: controller.signal })).rejects.toThrow('중단');
  const result = awaitStudentMoveStep(new Promise<void>(() => {}), { timeoutMs: 5000 });
  const assertion = expect(result).rejects.toThrow('시간이 지났습니다');
  await vi.advanceTimersByTimeAsync(5000);
  await assertion;
  expect(vi.getTimerCount()).toBe(0);
});
