// 로그인 로봇 확인(Cloudflare Turnstile). 운영 Supabase 는 비밀번호·이메일 코드 로그인에 확인 토큰을 요구한다
// (우리틴즈 교적·출석부와 같은 위젯, 2026-11-12). 토큰은 한 번만 쓸 수 있어 로그인할 때마다 새로 받는다.
// 대부분은 화면에 아무것도 보이지 않고 끝나며, Cloudflare 가 의심할 때만 화면 아래에 확인 상자가 잠깐 뜬다.

const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
/** 공개 사이트 키(빌드 때 들어감). 비어 있으면 로봇 확인 없이 로그인한다(로컬·시험). */
export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '').trim();
const TIMEOUT_MS = 90_000;

export type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string | undefined;
  remove(widgetId: string): void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export class CaptchaError extends Error {
  code = 'auth/captcha-failed';
}

let loading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SRC;
    script.async = true;
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new CaptchaError('로봇 확인을 불러오지 못했습니다.')));
    script.onerror = () => { loading = null; reject(new CaptchaError('로봇 확인을 불러오지 못했습니다.')); };
    document.head.appendChild(script);
  });
  return loading;
}

/** 로그인에 붙일 로봇 확인 토큰. 사이트 키가 없으면 undefined. */
export async function getCaptchaToken(siteKey: string = TURNSTILE_SITE_KEY): Promise<string | undefined> {
  if (!siteKey || typeof window === 'undefined') return undefined;
  const api = await loadTurnstile();
  return new Promise<string>((resolve, reject) => {
    const box = document.createElement('div');
    box.setAttribute('data-login-captcha', '');
    box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483647;';
    document.body.appendChild(box);
    const widget: { id?: string } = {};
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try { if (widget.id) api.remove(widget.id); } catch { /* 이미 지워진 위젯 */ }
      box.remove();
      action();
    };
    const fail = () => finish(() => reject(new CaptchaError('로봇 확인을 마치지 못했습니다.')));
    const timer = window.setTimeout(fail, TIMEOUT_MS);
    widget.id = api.render(box, {
      sitekey: siteKey,
      language: 'ko',
      appearance: 'interaction-only',
      callback: (token: string) => finish(() => resolve(token)),
      'error-callback': fail,
      'expired-callback': fail,
    });
  });
}
