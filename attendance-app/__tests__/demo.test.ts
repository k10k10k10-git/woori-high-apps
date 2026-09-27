import { describe, it, expect } from 'vitest';
import {
  parseClassKey, buildDemoRole,
  buildDemoOptionsFromClasses, resolveDemoSelection,
  loadLastDemoSelection, saveDemoSelection, clearDemoSelection,
} from '@/lib/demo';

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

describe('실제 반 선택', () => {
  it('실제 반 노드에서 정렬된 선택지를 만들고 선택 반 교사 역할을 만든다', () => {
    const options = buildDemoOptionsFromClasses({
      '2-3-10': { teacher: '담임' },
      '1-1-2': { teacher: '첫 담임' },
      invalid: { teacher: '제외' },
    });
    expect(options.map(option => option.ck)).toEqual(['1-1-2', '2-3-10']);
    expect(buildDemoRole(options[1])).toMatchObject({ role: 'teacher', part: '2', grade: '3', class: '10', name: '담임 (데모)' });
    expect(resolveDemoSelection({ ck: '2-3-10', teacherName: '담임' })).toEqual({ ck: '2-3-10', teacherName: '담임' });
  });
});

describe('공용 출석 반 선택 저장', () => {
  it('최근 반만 저장하고 과거 자동 진입 키를 버린다', () => {
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

    const selection = { ck: '2-3-3', teacherName: '담임' };
    storage.set('demoSelection', JSON.stringify(selection));
    saveDemoSelection(selection);

    expect(storage.has('demoSelection')).toBe(false);
    expect(loadLastDemoSelection()).toEqual(selection);
    clearDemoSelection();
    expect(loadLastDemoSelection()).toEqual(selection);
  });
});
