/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
import { loginErrorMessage, readLoginPreferences, writeLoginPreferences } from './loginPreferences';
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
it('저장 옵션을 읽고 비밀번호 없이 이메일만 보존한다', () => {
  writeLoginPreferences('fixture@example.com', true, false);
  expect(readLoginPreferences()).toEqual({ email: 'fixture@example.com', saveEmail: true, stayLogin: false });
  expect(localStorage.length).toBe(3);
  writeLoginPreferences('fixture@example.com', false, true);
  expect(readLoginPreferences()).toEqual({ email: '', saveEmail: false, stayLogin: true });
});
it('읽기·쓰기·접근 자체가 거절되어도 옵션 때문에 예외가 전파되지 않는다', () => {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
  expect(readLoginPreferences()).toEqual({ email: '', saveEmail: false, stayLogin: false });
  expect(() => writeLoginPreferences('fixture@example.com', true, true)).not.toThrow();
});
it.each([
  ['auth/network-request-failed', '인터넷 연결'], ['auth/too-many-requests', '잠시 제한'],
  ['auth/user-disabled', '중지'], ['auth/invalid-email', '이메일 형식'], ['auth/web-storage-unsupported', '저장소 설정'],
  ['auth/unknown', '관리자에게 문의'],
])('인증 오류 %s를 복구 가능한 한국어로 안내한다', (code, message) => {
  expect(loginErrorMessage({ code })).toContain(message);
  expect(loginErrorMessage({ code })).not.toContain('auth/');
});
it('알 수 없는 오류도 undefined를 표시하지 않는다', () => { expect(loginErrorMessage(null)).not.toContain('undefined'); });
