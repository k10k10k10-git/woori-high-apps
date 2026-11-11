/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  persistence: vi.fn(), login: vi.fn().mockResolvedValue(undefined), sendCode: vi.fn().mockResolvedValue(undefined),
  verifyCode: vi.fn().mockResolvedValue(undefined), google: vi.fn().mockResolvedValue(undefined), signOut: vi.fn().mockResolvedValue(undefined), auth: {},
}));
// Firebase Auth 자리의 Supabase 로그인 모듈과 "로그인 유지" 저장 위치를 흉내 낸다.
vi.mock('@/lib/supabaseAuth', () => ({ auth: mocks.auth, onAuthStateChanged: vi.fn(), signOut: mocks.signOut,
  signInWithEmailPassword: mocks.login, sendEmailCode: mocks.sendCode, verifyEmailCode: mocks.verifyCode, signInWithGoogle: mocks.google }));
vi.mock('@/lib/authStorage', () => ({ setAuthPersistence: mocks.persistence }));
vi.mock('./useFirebaseData', () => ({ loadUserRole: vi.fn() }));
import { doDemoLogin, doGoogleLogin, doLogin, doLogout, doSendLoginCode, doVerifyLoginCode } from './useAuth';
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
it('인증 성공 후 저장 옵션이 거절되어도 로그인 성공을 실패로 바꾸지 않는다', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  await expect(doLogin('fixture@example.com', 'synthetic', false, true)).resolves.toBeUndefined();
  expect(mocks.persistence).toHaveBeenCalledWith('session');
  expect(mocks.login).toHaveBeenCalledExactlyOnceWith('fixture@example.com', 'synthetic');
  expect(mocks.persistence.mock.invocationCallOrder[0]).toBeLessThan(mocks.login.mock.invocationCallOrder[0]);
});
it('인증 자체의 실패는 숨기거나 약한 인증으로 재시도하지 않는다', async () => {
  mocks.login.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
  await expect(doLogin('fixture@example.com', 'synthetic', true, false)).rejects.toMatchObject({ code: 'auth/invalid-credential' });
  expect(mocks.persistence).toHaveBeenCalledWith('local'); expect(mocks.login).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('stayLogin')).toBeNull();
});
it('이메일 코드: 보내기는 저장 옵션을 바꾸지 않고, 확인 성공 뒤에만 로그인 유지·이메일 저장을 기록한다', async () => {
  await doSendLoginCode('fixture@example.com');
  expect(mocks.sendCode).toHaveBeenCalledExactlyOnceWith('fixture@example.com');
  expect(mocks.persistence).not.toHaveBeenCalled();
  mocks.verifyCode.mockRejectedValueOnce({ code: 'auth/invalid-code' });
  await expect(doVerifyLoginCode('fixture@example.com', '123456', true, true)).rejects.toMatchObject({ code: 'auth/invalid-code' });
  expect(localStorage.getItem('savedEmail')).toBeNull();
  await doVerifyLoginCode('fixture@example.com', '123456', true, true);
  expect(mocks.verifyCode).toHaveBeenLastCalledWith('fixture@example.com', '123456');
  expect(mocks.persistence).toHaveBeenLastCalledWith('local');
  expect(localStorage.getItem('savedEmail')).toBe('fixture@example.com');
  expect(localStorage.getItem('stayLogin')).toBe('1');
  localStorage.clear();
});
it('Google·공용 계정·로그아웃도 같은 로그인 모듈을 쓴다', async () => {
  await doGoogleLogin(false);
  expect(mocks.persistence).toHaveBeenCalledWith('session'); expect(mocks.google).toHaveBeenCalledOnce();
  await doLogout();
  expect(mocks.signOut).toHaveBeenCalledExactlyOnceWith(mocks.auth);
  // 공용 계정 설정이 없으면 로그인하지 않는다(모듈 로드 시점 값).
  await expect(doDemoLogin()).rejects.toThrow('공용 출석 계정');
  expect(mocks.login).not.toHaveBeenCalled();
});
