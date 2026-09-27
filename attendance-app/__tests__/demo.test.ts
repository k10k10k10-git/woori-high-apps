import { describe, it, expect } from 'vitest';
import {
  parseClassKey,
  DEMO_OPTIONS, resolveDemoSelection,
  loadLastDemoSelection, saveDemoSelection,
} from '@/lib/demo';

// 저장된 예전 실제 반/담임 정보가 가상 데모 화면으로 새어 나오지 않도록 검증한다.
describe('parseClassKey', () => {
  it('부-학년-반을 분리한다', () => {
    expect(parseClassKey('1-2-3')).toEqual({ part: '1', grade: '2', cls: '3' });
    expect(parseClassKey('2-3-11')).toEqual({ part: '2', grade: '3', cls: '11' });
  });

  it('형식이 아니면 null', () => {
    expect(parseClassKey('')).toBeNull();
    expect(parseClassKey('1-2')).toBeNull();
    expect(parseClassKey('1-2-3-4')).toBeNull();
    expect(parseClassKey('1--3')).toBeNull();
  });
});

describe('가상 반만 허용', () => {
  it('운영 명단을 읽지 않아도 부서·학년·반 선택지가 있다', () => {
    expect(DEMO_OPTIONS).toHaveLength(18);
    expect(DEMO_OPTIONS[0]).toMatchObject({ ck: '1-1-1', teacherName: '' });
  });

  it('이전 저장된 실제 담임 이름을 버리고 가상 선택지 밖 반을 거부한다', () => {
    expect(resolveDemoSelection({ ck: '1-2-3', teacherName: '실제 담임' })).toEqual({ ck: '1-2-3', teacherName: '' });
    expect(resolveDemoSelection({ ck: '1-2-10', teacherName: '실제 담임' })).toBeNull();
  });
});

describe('데모 최근 반 선택', () => {
  it('최근 반만 저장하고 오래된 자동 진입 키는 사용하지 않는다', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
      configurable: true,
    });

    const selection = { ck: '2-3-3', teacherName: '' };
    saveDemoSelection(selection);

    expect(storage.has('demoSelection')).toBe(false);
    expect(loadLastDemoSelection()).toEqual(selection);
  });
});
