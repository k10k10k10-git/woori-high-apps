/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLayoutEffect } from 'react';

const mocks = vi.hoisted(() => ({
  doLogin: vi.fn(),
  doSendLoginCode: vi.fn(),
  doVerifyLoginCode: vi.fn(),
  doGoogleLogin: vi.fn(),
  onBackToDemo: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  doLogin: mocks.doLogin, doSendLoginCode: mocks.doSendLoginCode,
  doVerifyLoginCode: mocks.doVerifyLoginCode, doGoogleLogin: mocks.doGoogleLogin,
}));

import LoginScreen from './LoginScreen';

/** 기본은 고등부 앱처럼 이메일 코드다. 비밀번호 갈래 시험은 먼저 비밀번호를 고른다. */
const usePassword = () => fireEvent.click(screen.getByRole('button', { name: '비밀번호' }));

describe('교사·관리자 로그인 진입 화면', () => {
  beforeEach(() => {
    mocks.doLogin.mockReset();
    mocks.doSendLoginCode.mockReset();
    mocks.doVerifyLoginCode.mockReset();
    mocks.doGoogleLogin.mockReset();
    mocks.onBackToDemo.mockReset();
    localStorage.clear();
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

  it('브라우저 저장소가 차단돼도 로그인 폼을 연다', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    render(<LoginScreen />);
    usePassword();
    expect(screen.getByRole('button', { name: /로그인$/ })).toHaveProperty('disabled', false);
    expect(screen.getByLabelText('이메일')).toHaveProperty('value', '');
  });

  it('명시적인 입력 이름과 기존 로그인 옵션을 그대로 전달한다', async () => {
    mocks.doLogin.mockResolvedValue(undefined);
    render(<LoginScreen onBackToDemo={mocks.onBackToDemo} />);
    expect(screen.getByRole('heading', { name: '교사·관리자 로그인' })).not.toBeNull();
    usePassword();

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

  it('저장 옵션 복원보다 먼저 입력한 이메일을 지우거나 덮지 않는다', async () => {
    localStorage.setItem('saveEmail', '1');
    localStorage.setItem('savedEmail', 'old@example.com');
    function EarlyInput() {
      useLayoutEffect(() => {
        const input = screen.getByLabelText('이메일');
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'new@example.com');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, []);
      return <LoginScreen />;
    }
    await act(async () => { render(<EarlyInput />); });
    expect(screen.getByLabelText('이메일')).toHaveProperty('value', 'new@example.com');
    expect(screen.getByRole('checkbox', { name: '이메일 저장' })).toHaveProperty('checked', true);
  });

  it('빈 입력과 인증 오류를 alert로 알리고 반 선택 복귀 동작을 유지한다', () => {
    const { rerender } = render(<LoginScreen onBackToDemo={mocks.onBackToDemo} />);
    usePassword();

    fireEvent.click(screen.getByRole('button', { name: /로그인$/ }));
    expect(screen.getByRole('alert').textContent).toContain('이메일과 비밀번호를 입력하세요');

    fireEvent.click(screen.getByRole('button', { name: /반 선택으로 돌아가기/ }));
    expect(mocks.onBackToDemo).toHaveBeenCalledTimes(1);

    rerender(<LoginScreen authError="권한 정보를 확인할 수 없습니다" onBackToDemo={mocks.onBackToDemo} />);
    expect(screen.getByRole('alert').textContent).toContain('권한 정보를 확인할 수 없습니다');
  });

  it('로그인 처리 중에는 버튼을 잠그고 상태를 표시한다', async () => {
    let finishLogin: (() => void) | undefined;
    mocks.doLogin.mockImplementation(() => new Promise<void>(resolve => { finishLogin = resolve; }));
    render(<LoginScreen />);
    usePassword();

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
    usePassword();

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: /로그인$/ }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('이메일 또는 비밀번호가 잘못되었습니다');
    expect(screen.getByRole('button', { name: /로그인$/ })).toHaveProperty('disabled', false);
  });

  it('이전 권한 오류가 재로그인 실패의 실제 원인을 가리지 않는다', async () => {
    mocks.doLogin.mockRejectedValue({ code: 'auth/network-request-failed' });
    render(<LoginScreen authError="이전 권한 조회 실패" />);
    usePassword();
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'secret-password' } });
    fireEvent.click(screen.getByRole('button', { name: /로그인$/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('인터넷'));
    expect(screen.getByRole('alert').textContent).not.toContain('이전 권한 조회 실패');
  });

  it('이메일 코드: 코드를 받고 6자리를 확인하면 로그인 유지·이메일 저장 선택을 그대로 넘긴다', async () => {
    mocks.doSendLoginCode.mockResolvedValue(undefined);
    mocks.doVerifyLoginCode.mockResolvedValue(undefined);
    render(<LoginScreen />);
    expect(screen.getByRole('button', { name: '이메일 코드' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByLabelText('비밀번호')).toBeNull();

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'Teacher@Example.com' } });
    fireEvent.click(screen.getByRole('checkbox', { name: '로그인 유지' }));
    fireEvent.click(screen.getByRole('button', { name: /코드 받기/ }));
    await waitFor(() => expect(mocks.doSendLoginCode).toHaveBeenCalledExactlyOnceWith('Teacher@Example.com'));
    expect(screen.getAllByRole('status').some(node => node.textContent?.includes('teacher@example.com로 코드를 보냈습니다'))).toBe(true);

    fireEvent.change(screen.getByLabelText('6자리 코드'), { target: { value: '12a34' } });
    fireEvent.click(screen.getByRole('button', { name: /코드 확인/ }));
    expect(screen.getByRole('alert').textContent).toContain('숫자 코드');
    expect(mocks.doVerifyLoginCode).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('6자리 코드'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /코드 확인/ }));
    await waitFor(() => expect(mocks.doVerifyLoginCode).toHaveBeenCalledExactlyOnceWith('Teacher@Example.com', '123456', true, false));
  });

  it('이메일 코드: 코드를 보낸 뒤 이메일을 바꾸면 다시 코드 받기부터, 틀린 코드는 쉬운 말로 알린다', async () => {
    mocks.doSendLoginCode.mockResolvedValue(undefined);
    mocks.doVerifyLoginCode.mockRejectedValue({ code: 'auth/invalid-code' });
    render(<LoginScreen />);
    fireEvent.click(screen.getByRole('button', { name: /코드 받기/ }));
    expect(screen.getByRole('alert').textContent).toContain('이메일을 입력하세요');
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'not-an-email' } });
    fireEvent.click(screen.getByRole('button', { name: /코드 받기/ }));
    expect(screen.getByRole('alert').textContent).toContain('이메일 형식');
    expect(mocks.doSendLoginCode).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'a@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /코드 받기/ }));
    await screen.findByLabelText('6자리 코드');
    fireEvent.change(screen.getByLabelText('6자리 코드'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: /코드 확인/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('코드가 맞지 않거나 시간이 지났습니다');

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'b@example.com' } });
    expect(screen.queryByLabelText('6자리 코드')).toBeNull();
    expect(screen.getByRole('button', { name: /코드 받기/ })).not.toBeNull();
  });

  it('@woorihigh.com 계정은 코드를 고를 수 없고 비밀번호로만 로그인한다', async () => {
    mocks.doLogin.mockResolvedValue(undefined);
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'Staff@WooriHigh.com' } });
    expect(screen.getByRole('button', { name: '이메일 코드' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: '비밀번호' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/메일함이 없어 코드를 받을 수 없습니다/)).not.toBeNull();
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'set-by-admin' } });
    fireEvent.click(screen.getByRole('button', { name: /로그인$/ }));
    await waitFor(() => expect(mocks.doLogin).toHaveBeenCalledExactlyOnceWith('Staff@WooriHigh.com', 'set-by-admin', false, false));
    expect(mocks.doSendLoginCode).not.toHaveBeenCalled();
  });

  it('Google 단추는 NEXT_PUBLIC_SUPABASE_GOOGLE=1 일 때만 보인다', async () => {
    const { unmount } = render(<LoginScreen />);
    expect(screen.queryByRole('button', { name: 'Google로 로그인' })).toBeNull();
    unmount();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_GOOGLE', '1');
    mocks.doGoogleLogin.mockResolvedValue(undefined);
    render(<LoginScreen />);
    fireEvent.click(screen.getByRole('button', { name: 'Google로 로그인' }));
    await waitFor(() => expect(mocks.doGoogleLogin).toHaveBeenCalledExactlyOnceWith(false));
  });
});
