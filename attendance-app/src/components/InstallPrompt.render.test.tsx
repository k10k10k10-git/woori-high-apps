/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import InstallPrompt from './InstallPrompt';

const originalUserAgent = navigator.userAgent;

function setStandalone(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value });
}

function setNavigatorStandalone(value: boolean) {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value });
}

function dispatchInstallPrompt(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as Event & {
    prompt: ReturnType<typeof vi.fn>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  };
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  act(() => window.dispatchEvent(event));
  return event;
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    localStorage.clear();
    setStandalone(false);
    setNavigatorStandalone(false);
    setUserAgent('Mozilla/5.0 Chrome/140 Safari/537.36');
  });

  afterEach(() => {
    cleanup();
    setUserAgent(originalUserAgent);
  });

  it('설치 가능한 브라우저에서만 안내하고 설치 완료 선택 후 숨긴다', async () => {
    render(<InstallPrompt />);
    const event = dispatchInstallPrompt();

    expect(screen.getByRole('region', { name: '홈 화면 설치 안내' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '설치' }));

    await waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('region', { name: '홈 화면 설치 안내' })).toBeNull());
    expect(localStorage.getItem('woori-attendance-install-dismissed')).toBe('1');
  });

  it('iOS 홈 화면 앱으로 실행 중이면 설치 안내를 표시하지 않는다', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');
    setNavigatorStandalone(true);
    render(<InstallPrompt />);
    dispatchInstallPrompt();

    expect(screen.queryByRole('region', { name: '홈 화면 설치 안내' })).toBeNull();
  });

  it('닫은 안내는 같은 브라우저에서 다시 표시하지 않는다', () => {
    const first = render(<InstallPrompt />);
    dispatchInstallPrompt();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    first.unmount();

    render(<InstallPrompt />);
    dispatchInstallPrompt();
    expect(screen.queryByRole('region', { name: '홈 화면 설치 안내' })).toBeNull();
  });

  it('iOS에서는 홈 화면 추가 방법을 안내하고 확인 후 닫는다', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1');
    render(<InstallPrompt />);

    fireEvent.click(screen.getByRole('button', { name: '방법 보기' }));
    expect(screen.getByText(/공유 버튼을 누른 뒤/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(screen.queryByRole('region', { name: '홈 화면 설치 안내' })).toBeNull();
  });
});
