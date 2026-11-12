/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCaptchaToken, type TurnstileApi } from './captcha';

afterEach(() => { delete window.turnstile; document.body.innerHTML = ''; vi.useRealTimers(); });

function fakeTurnstile() {
  let options: Record<string, unknown> = {};
  const api: TurnstileApi & { options: () => Record<string, unknown> } = {
    render: vi.fn((_box: HTMLElement, o: Record<string, unknown>) => { options = o; return 'w1'; }),
    remove: vi.fn(),
    options: () => options,
  };
  window.turnstile = api;
  return api;
}

describe('로그인 로봇 확인 토큰(Turnstile)', () => {
  it('사이트 키가 없으면 확인 없이 지나간다(로컬·시험)', async () => {
    await expect(getCaptchaToken('')).resolves.toBeUndefined();
  });

  it('보이지 않는 상자로 확인해 토큰을 주고, 끝나면 상자와 위젯을 지운다', async () => {
    const api = fakeTurnstile();
    const pending = getCaptchaToken('site-key');
    await Promise.resolve();
    expect(api.options()).toMatchObject({ sitekey: 'site-key', appearance: 'interaction-only', language: 'ko' });
    expect(document.querySelector('[data-login-captcha]')).not.toBeNull();
    (api.options().callback as (t: string) => void)('tok');
    await expect(pending).resolves.toBe('tok');
    expect(api.remove).toHaveBeenCalledWith('w1');
    expect(document.querySelector('[data-login-captcha]')).toBeNull();
  });

  it('확인 실패는 auth/captcha-failed 로 끝난다', async () => {
    const api = fakeTurnstile();
    const pending = getCaptchaToken('site-key');
    await Promise.resolve();
    (api.options()['error-callback'] as () => void)();
    await expect(pending).rejects.toMatchObject({ code: 'auth/captcha-failed' });
    expect(document.querySelector('[data-login-captcha]')).toBeNull();
  });
});
