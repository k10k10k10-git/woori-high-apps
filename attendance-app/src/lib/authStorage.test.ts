/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authStorage, setAuthPersistence } from './authStorage';

const KEY = 'sb-project-auth-token';
afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

describe('로그인 유지 선택에 따른 Supabase 세션 저장 위치', () => {
  it('로그인 유지를 끄면(기본) 이 탭 세션 저장소에만 두고, 토큰 갱신도 그곳에 쓴다', () => {
    setAuthPersistence('session');
    authStorage.setItem(KEY, 'v1');
    expect(sessionStorage.getItem(KEY)).toBe('v1');
    expect(localStorage.getItem(KEY)).toBeNull();
    authStorage.setItem(KEY, 'v2');
    expect(authStorage.getItem(KEY)).toBe('v2');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('로그인 유지를 켜면 브라우저 저장소에 두고, 예전 탭 세션 사본은 지운다', () => {
    sessionStorage.setItem(KEY, 'old');
    setAuthPersistence('local');
    authStorage.setItem(KEY, 'new');
    expect(localStorage.getItem(KEY)).toBe('new');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('고른 기록이 없는 새 탭은 세션이 있는 곳을 따르고, 처음이면 Firebase 기본처럼 유지 쪽에 둔다', () => {
    localStorage.setItem(KEY, 'kept');
    expect(authStorage.getItem(KEY)).toBe('kept');
    authStorage.setItem(KEY, 'refreshed');
    expect(localStorage.getItem(KEY)).toBe('refreshed');
    localStorage.clear();
    sessionStorage.setItem(KEY, 'tab');
    authStorage.setItem(KEY, 'tab2');
    expect(sessionStorage.getItem(KEY)).toBe('tab2');
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('로그아웃(removeItem)은 두 저장소에서 모두 지운다', () => {
    localStorage.setItem(KEY, 'a');
    sessionStorage.setItem(KEY, 'b');
    authStorage.removeItem(KEY);
    expect(authStorage.getItem(KEY)).toBeNull();
  });

  it('저장소가 막힌 브라우저에서도 예외 없이 메모리로 로그인을 이어 간다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
    expect(() => setAuthPersistence('session')).not.toThrow();
    expect(() => authStorage.setItem(KEY, 'memory')).not.toThrow();
    expect(authStorage.getItem(KEY)).toBe('memory');
    authStorage.removeItem(KEY);
    expect(authStorage.getItem(KEY)).toBeNull();
  });
});
