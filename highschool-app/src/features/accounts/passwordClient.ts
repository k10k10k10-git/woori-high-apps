import { auth } from "@/lib/supabaseAuth";
import { normalizeEmail } from "@/lib/accountEmail";

/** 서버에 비밀번호 정하기를 요청한다. 실패 사유는 서버가 준 쉬운 안내를 그대로 쓴다. */
export async function requestAccountPassword(email: string, password: string): Promise<{ created: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인 후 다시 시도해 주세요.");
  const token = await user.getIdToken().catch(() => { throw new Error("로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요."); });
  if (auth.currentUser?.uid !== user.uid) throw new Error("로그인 계정이 바뀌었습니다. 새로고침해 주세요.");
  const response = await fetch("/api/accounts/password", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email: normalizeEmail(email), password }),
  }).catch(() => { throw new Error("서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요."); });
  const body = await response.json().catch(() => null) as { created?: unknown; error?: unknown } | null;
  if (!response.ok) throw new Error(typeof body?.error === "string" ? body.error : "비밀번호를 정하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  return { created: body?.created === true };
}
