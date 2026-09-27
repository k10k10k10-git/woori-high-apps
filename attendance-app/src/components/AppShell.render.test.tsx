/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type AuthUser = { uid: string; email: string | null };

const mocks = vi.hoisted(() => ({
  auth: { currentUser: null as AuthUser | null },
  listener: null as ((user: AuthUser | null) => void | Promise<void>) | null,
  onAuthStateChanged: vi.fn(),
  loadUserRole: vi.fn(),
  doLogout: vi.fn(),
  dispatch: vi.fn(),
  replace: vi.fn(),
  state: { userRole: null, saveStatus: 'idle' },
}));

vi.mock('firebase/auth', () => ({ onAuthStateChanged: mocks.onAuthStateChanged }));
vi.mock('@/lib/firebase/client', () => ({ auth: mocks.auth }));
vi.mock('@/hooks/useFirebaseData', () => ({ loadUserRole: mocks.loadUserRole }));
vi.mock('@/hooks/useAuth', () => ({ doLogout: mocks.doLogout, doLogin: vi.fn() }));
vi.mock('@/store/AppContext', () => ({
  useApp: () => ({ state: mocks.state, dispatch: mocks.dispatch }),
}));
vi.mock('@/lib/demo', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/demo')>(),
  DEMO_MODE: true,
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
    mocks.doLogout.mockReset().mockResolvedValue(undefined);
    mocks.dispatch.mockReset();
    mocks.replace.mockReset();
  });

  afterEach(() => cleanup());

  it('가상 반이 저장돼 있어도 비인증 상태에서는 실제 로그인을 먼저 보여 준다', async () => {
    localStorage.setItem('demoSelection', JSON.stringify({ ck: '1-1-1', teacherName: '' }));
    render(<AppShell><div>실제 원장 화면</div></AppShell>);

    await emitAuth(null);

    expect(screen.getByRole('heading', { name: '실제 출석부 로그인' })).not.toBeNull();
    expect(screen.queryByText('가상 학생 1')).toBeNull();
    expect(mocks.loadUserRole).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '가상 출석부 체험' }));
    expect(screen.getByRole('heading', { name: '고등부 출석부' })).not.toBeNull();
    expect(screen.getByText(/운영 출석부에 저장되지 않습니다/)).not.toBeNull();
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
    await waitFor(() => expect(screen.getByRole('heading', { name: '실제 출석부 로그인' })).not.toBeNull());
    expect(mocks.doLogout).toHaveBeenCalledTimes(1);
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
    expect(screen.queryByRole('heading', { name: '실제 출석부 로그인' })).toBeNull();
  });
});
