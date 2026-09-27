/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthUser = { uid: string; email: string | null };

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as AuthUser | null },
  listener: null as ((user: AuthUser | null) => void | Promise<void>) | null,
  onAuthStateChanged: vi.fn(),
  loadUserRole: vi.fn(),
  doDemoLogin: vi.fn(),
  doLogout: vi.fn(),
  dispatch: vi.fn(),
  replace: vi.fn(),
  state: { userRole: null, saveStatus: 'idle' },
}));

vi.mock('firebase/auth', () => ({ onAuthStateChanged: mocks.onAuthStateChanged }));
vi.mock('@/lib/firebase/client', () => ({ auth: mocks.auth }));
vi.mock('@/hooks/useFirebaseData', () => ({ loadUserRole: mocks.loadUserRole }));
vi.mock('@/hooks/useAuth', () => ({ doLogout: mocks.doLogout, doDemoLogin: mocks.doDemoLogin, doLogin: vi.fn() }));
vi.mock('@/store/AppContext', () => ({
  useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }),
}));
vi.mock('@/lib/demo', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/demo')>(),
  DEMO_MODE: true,
  demoConfigured: true,
  isDemoAccount: (email?: string | null) => email === 'public@example.com',
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/attendance',
  useRouter: () => ({ replace: mocks.replace }),
}));
vi.mock('@/components/admin/AdminWorkspace', () => ({ default: () => null }));
vi.mock('@/components/FirebaseDataLoader', () => ({ default: () => null }));
vi.mock('@/components/DataLoadGate', () => ({ default: () => null }));
vi.mock('@/components/TopBar', () => ({ default: () => null }));
vi.mock('@/components/TabNav', () => ({ default: () => null }));
vi.mock('@/components/Toast', () => ({ default: () => null }));
vi.mock('@/components/UpdateBanner', () => ({ default: () => null }));
vi.mock('@/components/DemoClassPicker', () => ({
  default: ({ onPick, onAdminLogin, signInError }: {
    onPick: (sel: { ck: string; teacherName: string }) => void;
    onAdminLogin: () => void;
    signInError?: string | null;
  }) => <div>
    <h1>실제 반 선택</h1>
    {signInError && <p role="alert">{signInError}</p>}
    <button onClick={() => onPick({ ck: '1-2-3', teacherName: '담임' })}>1부 2학년 3반</button>
    <button onClick={onAdminLogin}>교사·관리자 로그인</button>
  </div>,
}));

import AppShell from './AppShell';

async function emitAuth(user: AuthUser | null) {
  const listener = mocks.listener;
  if (!listener) throw new Error('Firebase Auth 구독이 시작되지 않았습니다.');
  mocks.auth.currentUser = user;
  await act(async () => { await listener(user); });
}

describe('실제 출석부 진입과 권한 조회 실패', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    mocks.auth.currentUser = null;
    mocks.listener = null;
    mocks.onAuthStateChanged.mockReset().mockImplementation((_auth, listener) => {
      mocks.listener = listener;
      return vi.fn();
    });
    mocks.loadUserRole.mockReset();
    mocks.doDemoLogin.mockReset().mockResolvedValue(undefined);
    mocks.doLogout.mockReset().mockResolvedValue(undefined);
    mocks.dispatch.mockReset();
    mocks.replace.mockReset();
  });

  afterEach(() => cleanup());

  it('비인증 상태에서 공용 계정 로그인 후 실제 반을 선택해 교사 원장을 연다', async () => {
    render(<AppShell><div>실제 원장 화면</div></AppShell>);

    await emitAuth(null);
    expect(mocks.doDemoLogin).toHaveBeenCalledTimes(1);
    expect(mocks.loadUserRole).not.toHaveBeenCalled();

    await emitAuth({ uid: 'public-uid', email: 'public@example.com' });
    expect(screen.getByRole('heading', { name: '실제 반 선택' })).not.toBeNull();
    expect(mocks.loadUserRole).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '1부 2학년 3반' }));
    expect(mocks.dispatch).toHaveBeenCalledWith({ type: 'SET_USER_ROLE', payload: expect.objectContaining({ role: 'teacher', part: '1', grade: '2', class: '3' }) });
    expect(JSON.parse(localStorage.getItem('demoLastSelection') ?? '{}')).toMatchObject({ ck: '1-2-3', teacherName: '담임' });
    expect(screen.queryByRole('heading', { name: '실제 반 선택' })).toBeNull();
  });

  it('과거 저장된 반이 있어도 공용 계정은 실제 반 선택을 먼저 보여 준다', async () => {
    localStorage.setItem('demoSelection', JSON.stringify({ ck: '2-3-4', teacherName: '담임' }));
    render(<AppShell><div>실제 원장 화면</div></AppShell>);

    await emitAuth({ uid: 'public-uid', email: 'public@example.com' });

    expect(screen.getByRole('heading', { name: '실제 반 선택' })).not.toBeNull();
    expect(mocks.dispatch).not.toHaveBeenCalledWith({ type: 'SET_USER_ROLE', payload: expect.objectContaining({ role: 'teacher' }) });
    expect(mocks.loadUserRole).not.toHaveBeenCalled();
  });

  it('개인 계정 로그인을 누르면 공용 계정을 끊고 다시 자동 접속하지 않는다', async () => {
    render(<AppShell><div>실제 원장 화면</div></AppShell>);
    await emitAuth({ uid: 'public-uid', email: 'public@example.com' });

    fireEvent.click(screen.getByRole('button', { name: '교사·관리자 로그인' }));
    await waitFor(() => expect(mocks.doLogout).toHaveBeenCalledTimes(1));
    await emitAuth(null);

    expect(screen.getByRole('heading', { name: '교사·관리자 로그인' })).not.toBeNull();
    expect(mocks.doDemoLogin).not.toHaveBeenCalled();
  });

  it('역할 조회의 일시적 오류는 로그아웃시키지 않고 재시도를 안내한다', async () => {
    const user = { uid: 'teacher-uid', email: 'teacher@example.com' };
    mocks.loadUserRole.mockResolvedValue('error');
    render(<AppShell><div>실제 원장 화면</div></AppShell>);

    await emitAuth(user);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('권한 정보를 불러오지 못했습니다');
    expect(alert.textContent).toContain('로그인 상태는 유지됩니다');
    expect(screen.getByRole('button', { name: '다시 불러오기' })).not.toBeNull();
    expect(mocks.doLogout).not.toHaveBeenCalled();
    expect(mocks.auth.currentUser).toBe(user);

    mocks.doLogout.mockImplementation(async () => { mocks.auth.currentUser = null; });
    fireEvent.click(screen.getByRole('button', { name: '다른 계정으로 로그인' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: '교사·관리자 로그인' })).not.toBeNull());
    expect(mocks.doLogout).toHaveBeenCalledTimes(1);
    await emitAuth(null);
    expect(screen.getByRole('heading', { name: '교사·관리자 로그인' })).not.toBeNull();
    expect(mocks.doDemoLogin).not.toHaveBeenCalled();
  });

  it('미등록 계정 로그아웃 후에도 공용 계정으로 자동 접속하지 않는다', async () => {
    mocks.loadUserRole.mockResolvedValue('unauthorized');
    render(<AppShell><div>실제 원장 화면</div></AppShell>);

    await emitAuth({ uid: 'unknown-uid', email: 'unknown@example.com' });
    expect(mocks.doLogout).toHaveBeenCalledTimes(1);
    await emitAuth(null);

    expect(screen.getByRole('heading', { name: '교사·관리자 로그인' })).not.toBeNull();
    expect(mocks.doDemoLogin).not.toHaveBeenCalled();
  });

  it('sessionStorage가 막혀도 다른 계정 전환은 공용 자동 로그인으로 튀지 않는다', async () => {
    const storage = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => { throw new Error('blocked'); } });
    try {
      mocks.loadUserRole.mockResolvedValue('error');
      render(<AppShell><div>실제 원장 화면</div></AppShell>);
      await emitAuth({ uid: 'teacher-uid', email: 'teacher@example.com' });
      fireEvent.click(screen.getByRole('button', { name: '다른 계정으로 로그인' }));
      await waitFor(() => expect(mocks.doLogout).toHaveBeenCalledTimes(1));
      await emitAuth(null);

      expect(screen.getByRole('heading', { name: '교사·관리자 로그인' })).not.toBeNull();
      expect(mocks.doDemoLogin).not.toHaveBeenCalled();
    } finally {
      if (storage) Object.defineProperty(window, 'sessionStorage', storage);
    }
  });

  it('다른 계정 전환에 실패하면 인증 오류 화면을 유지한다', async () => {
    const user = { uid: 'teacher-uid', email: 'teacher@example.com' };
    mocks.loadUserRole.mockResolvedValue('error');
    mocks.doLogout.mockRejectedValue(new Error('offline'));
    render(<AppShell><div>실제 원장 화면</div></AppShell>);

    await emitAuth(user);
    fireEvent.click(screen.getByRole('button', { name: '다른 계정으로 로그인' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('로그아웃하지 못했습니다'));
    expect(mocks.auth.currentUser).toBe(user);
    expect(screen.queryByRole('heading', { name: '교사·관리자 로그인' })).toBeNull();
  });
});
