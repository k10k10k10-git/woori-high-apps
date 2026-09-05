import { describe, expect, it, vi } from 'vitest';
import { createChartLoader, createChartRegistry, type ChartClass } from '@/utils/chartSetup';

type ChartModule = typeof import('chart.js');

function chartModule() {
  const register = vi.fn();
  const chartModuleValue = { Chart: { register } } as unknown as ChartModule;
  return { chartModuleValue, register, Chart: chartModuleValue.Chart };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const settleCallbacks = () => new Promise(resolve => setTimeout(resolve, 0));

describe('차트 모듈 로딩 캐시', () => {
  it('일시적 import 실패 뒤 다음 호출은 다시 로딩한다', async () => {
    const { chartModuleValue, Chart, register } = chartModule();
    const load = vi.fn().mockRejectedValueOnce(new Error('chunk load failed')).mockResolvedValue(chartModuleValue);
    const getChart = createChartRegistry(load);
    await expect(getChart()).rejects.toThrow('chunk load failed');
    await expect(getChart()).resolves.toBe(Chart);
    expect(load).toHaveBeenCalledTimes(2);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('동시 요청은 한 번만 로딩·등록하고 성공한 클래스는 재사용한다', async () => {
    const { chartModuleValue, Chart, register } = chartModule();
    const pending = deferred<ChartModule>();
    const load = vi.fn(() => pending.promise);
    const getChart = createChartRegistry(load);
    const first = getChart();
    const second = getChart();
    pending.resolve(chartModuleValue);
    expect(await first).toBe(Chart);
    expect(await second).toBe(Chart);
    expect(await getChart()).toBe(Chart);
    expect(load).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });

  it('구성 요소 등록 실패도 영구 캐시하지 않는다', async () => {
    const { chartModuleValue, Chart, register } = chartModule();
    register.mockImplementationOnce(() => { throw new Error('registration failed'); });
    const getChart = createChartRegistry(async () => chartModuleValue);
    await expect(getChart()).rejects.toThrow('registration failed');
    await expect(getChart()).resolves.toBe(Chart);
    expect(register).toHaveBeenCalledTimes(2);
  });

  it('동기적인 로더 예외도 다음 요청에서 재시도한다', async () => {
    const { chartModuleValue, Chart } = chartModule();
    const load = vi.fn().mockImplementationOnce(() => { throw new Error('sync failure'); }).mockResolvedValue(chartModuleValue);
    const getChart = createChartRegistry(load);
    await expect(getChart()).rejects.toThrow('sync failure');
    await expect(getChart()).resolves.toBe(Chart);
  });
});

describe('화면 차트 로딩 수명', () => {
  it('로드 실패는 오류 콜백으로 전달하고 준비됨으로 표시하지 않는다', async () => {
    const setChart = vi.fn();
    const setReady = vi.fn();
    const onError = vi.fn();
    const error = new Error('chunk load failed');
    createChartLoader(setChart, setReady, onError, async () => { throw error; });
    await settleCallbacks();
    expect(onError).toHaveBeenCalledWith(error);
    expect(setChart).not.toHaveBeenCalled();
    expect(setReady).not.toHaveBeenCalled();
  });

  it('화면 전용 플러그인 초기화 실패도 오류 상태로 전달한다', async () => {
    const { Chart } = chartModule();
    const error = new Error('plugin failed');
    const setReady = vi.fn();
    const onError = vi.fn();
    createChartLoader(() => { throw error; }, setReady, onError, async () => Chart);
    await settleCallbacks();
    expect(onError).toHaveBeenCalledWith(error);
    expect(setReady).not.toHaveBeenCalled();
  });

  it('언마운트 후 도착한 성공은 상태를 변경하지 않는다', async () => {
    const { Chart } = chartModule();
    const pending = deferred<ChartClass>();
    const setChart = vi.fn();
    const setReady = vi.fn();
    const onError = vi.fn();
    const cleanup = createChartLoader(setChart, setReady, onError, () => pending.promise);
    cleanup();
    pending.resolve(Chart);
    await settleCallbacks();
    expect(setChart).not.toHaveBeenCalled();
    expect(setReady).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('언마운트 후 도착한 실패도 오류 콜백을 호출하지 않는다', async () => {
    const pending = deferred<ChartClass>();
    const onError = vi.fn();
    const cleanup = createChartLoader(vi.fn(), vi.fn(), onError, () => pending.promise);
    cleanup();
    pending.reject(new Error('late failure'));
    await settleCallbacks();
    expect(onError).not.toHaveBeenCalled();
  });

  it('이전 화면을 해제해도 같은 로딩을 기다리는 현재 화면은 준비된다', async () => {
    const { Chart } = chartModule();
    const pending = deferred<ChartClass>();
    const oldReady = vi.fn();
    const currentChart = vi.fn();
    const currentReady = vi.fn();
    const cleanup = createChartLoader(vi.fn(), oldReady, vi.fn(), () => pending.promise);
    createChartLoader(currentChart, currentReady, vi.fn(), () => pending.promise);
    cleanup();
    pending.resolve(Chart);
    await settleCallbacks();
    expect(oldReady).not.toHaveBeenCalled();
    expect(currentChart).toHaveBeenCalledWith(Chart);
    expect(currentReady).toHaveBeenCalledWith(true);
  });
});
