import { setAccountPassword } from "@/features/accounts/passwordServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 통합관리자 전용: 메일함 없는 계정의 로그인 비밀번호를 정한다(없으면 만든다). */
export function POST(request: Request) {
  return setAccountPassword(request);
}
