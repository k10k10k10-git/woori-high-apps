import { isMailboxlessEmail, isValidEmail, MAILBOXLESS_DOMAIN, normalizeEmail } from "@/lib/accountEmail";

// 관리자가 다른 계정의 비밀번호를 정하는 규칙. 화면과 서버가 같은 함수를 쓴다.
// Supabase 프로젝트를 주일학교 플랫폼과 함께 쓰므로, 고등부 전용 메일함 없는 도메인
// 계정만 여기서 다룬다(다른 서비스 계정의 비밀번호를 바꾸는 길을 열지 않는다).

export const ACCOUNT_PASSWORD_MIN = 8;
/** Supabase 비밀번호(bcrypt)는 72바이트까지만 쓴다. */
const ACCOUNT_PASSWORD_MAX_BYTES = 72;

export type AccountPasswordInput = { email: string; password: string };

/** 문제가 없으면 null, 있으면 사람이 읽을 안내. */
export function accountPasswordProblem(email: string, password: string): string | null {
  if (!isValidEmail(email)) return "이메일 주소를 다시 확인해 주세요.";
  if (!isMailboxlessEmail(email)) return `여기서는 @${MAILBOXLESS_DOMAIN} 계정의 비밀번호만 정할 수 있습니다. 다른 계정은 본인이 이메일 코드로 로그인합니다.`;
  if (password.length < ACCOUNT_PASSWORD_MIN) return `비밀번호는 ${ACCOUNT_PASSWORD_MIN}자 이상으로 정해 주세요.`;
  if (new TextEncoder().encode(password).length > ACCOUNT_PASSWORD_MAX_BYTES) return "비밀번호가 너무 깁니다. 영문 기준 72자 이하로 정해 주세요.";
  if (password.trim() !== password) return "비밀번호 앞뒤에는 빈칸을 넣지 마세요.";
  return null;
}

/** 서버 요청 본문을 엄격히 읽는다. 다른 필드(역할·uid 등)는 받지 않는다. */
export function parseAccountPasswordInput(value: unknown): AccountPasswordInput | string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "요청 내용을 읽을 수 없습니다.";
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "email" && key !== "password")) return "요청 내용을 읽을 수 없습니다.";
  if (typeof record.email !== "string" || typeof record.password !== "string") return "이메일과 비밀번호를 입력해 주세요.";
  const problem = accountPasswordProblem(record.email, record.password);
  return problem ?? { email: normalizeEmail(record.email), password: record.password };
}
