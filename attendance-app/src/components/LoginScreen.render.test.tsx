/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  doLogin: vi.fn(),
  onBackToDemo: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({ doLogin: mocks.doLogin }));

import LoginScreen from './LoginScreen';

describe('관리자 로그인 진입 화면', () => {
  beforeEach(() => {
    mocks.doLogin.mockReset();
    mocks.onBackToDemo.mockReset();
    localStorage.clear();
  });

  afterEach(() => cleanup());

  it('명시적인 입력 이름과 기존 로그인 옵션을 그대로 전달한다', async () => {
    mocks.doLogin.mockResolvedValue(undefined);
    render(<LoginScreen onBackToDemo={mocks.onBackToDemo} />);

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'secret-password' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '이메일 저장' }));
    fireEvent.click(screen.getByRole('button', { name: /로그인$/ }));

    await waitFor(() => {
      expect(mocks.doLogin).toHaveBeenCalledWith(
        'admin@example.com',
        'secret-password',
        false,
        true,
      );
    });

    expect(screen.getByLabelText('이메일').getAttribute('autocomplete')).toBe('email');
    expect(screen.getByLabelText('비밀번호').getAttribute('type')).toBe('password');
    expect(screen.getByLabelText('비밀번호').getAttribute('autocomplete')).toBe('current-password');
  });

  it('빈 입력과 인증 오류를 alert로 알리고 데모 복귀 동작을 유지한다', () => {
    const { rerender } = render(<LoginScreen onBackToDemo={mocks.onBackToDemo} />);

    fireEvent.click(screen.getByRole('button', { name: /로그인$/ }));
    expect(screen.getByRole('alert').textContent).toContain('이메일과 비밀번호를 입력하세요');

    fireEvent.click(screen.getByRole('button', { name: /반 선택 화면으로 돌아가기/ }));
    expect(mocks.onBackToDemo).toHaveBeenCalledTimes(1);

    rerender(<LoginScreen authError="권한 정보를 확인할 수 없습니다" onBackToDemo={mocks.onBackToDemo} />);
    expect(screen.getByRole('alert').textContent).toContain('권한 정보를 확인할 수 없습니다');
  });

  it('로그인 처리 중에는 버튼을 잠그고 상태를 표시한다', async () => {
    let finishLogin: (() => void) | undefined;
    mocks.doLogin.mockImplementation(() => new Promise<void>(resolve => { finishLogin = resolve; }));
    render(<LoginScreen />);

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'secret-password' } });
    fireEvent.click(screen.getByRole('button', { name: /로그인$/ }));

    const pendingButton = await screen.findByRole('button', { name: '로그인 중...' });
    expect(pendingButton).toHaveProperty('disabled', true);
    expect(screen.getByRole('status').textContent).toContain('로그인 정보를 확인하는 중입니다');

    finishLogin?.();
    await waitFor(() => expect(screen.getByRole('button', { name: /로그인$/ })).toHaveProperty('disabled', false));
  });

  it('인증 실패를 사용자가 이해할 수 있는 오류로 알린다', async () => {
    mocks.doLogin.mockRejectedValue({ code: 'auth/invalid-credential' });
    render(<LoginScreen />);

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /로그인$/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('이메일 또는 비밀번호가 잘못되었습니다');
    expect(screen.getByRole('button', { name: /로그인$/ })).toHaveProperty('disabled', false);
  });
});
