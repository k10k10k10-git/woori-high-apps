/** 메일함이 없는 고등부 공용 계정 도메인. 이 계정은 이메일 코드를 받을 수 없어 비밀번호로만 들어온다. */
export const MAILBOXLESS_DOMAIN = "woorihigh.com";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 로그인·관리 도구가 같은 기준으로 비교하도록 공백을 지우고 소문자로 맞춘다. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL.test(email);
}

export function isMailboxlessEmail(value: string): boolean {
  return normalizeEmail(value).endsWith(`@${MAILBOXLESS_DOMAIN}`);
}
