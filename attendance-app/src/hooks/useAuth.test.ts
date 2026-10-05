/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ persistence: vi.fn().mockResolvedValue(undefined), login: vi.fn().mockResolvedValue({}), auth: {} }));
vi.mock('firebase/auth', () => ({ setPersistence: mocks.persistence, signInWithEmailAndPassword: mocks.login, browserLocalPersistence: 'local', browserSessionPersistence: 'session', onAuthStateChanged: vi.fn(), signOut: vi.fn() }));
vi.mock('@/lib/firebase/client', () => ({ auth: mocks.auth }));
vi.mock('./useFirebaseData', () => ({ loadUserRole: vi.fn() }));
import { doLogin } from './useAuth';
afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
it('인증 성공 후 저장 옵션이 거절되어도 로그인 성공을 실패로 바꾸지 않는다', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  await expect(doLogin('fixture@example.com', 'synthetic', false, true)).resolves.toBeUndefined();
  expect(mocks.persistence).toHaveBeenCalledWith(mocks.auth, 'session');
  expect(mocks.login).toHaveBeenCalledExactlyOnceWith(mocks.auth, 'fixture@example.com', 'synthetic');
});
it('인증 자체의 실패는 숨기거나 약한 인증으로 재시도하지 않는다', async () => {
  mocks.login.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
  await expect(doLogin('fixture@example.com', 'synthetic', true, false)).rejects.toMatchObject({ code: 'auth/invalid-credential' });
  expect(mocks.persistence).toHaveBeenCalledWith(mocks.auth, 'local'); expect(mocks.login).toHaveBeenCalledTimes(1);
});
