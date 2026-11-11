import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authStorage } from "./authStorage";

// 브라우저 Supabase 클라이언트는 이 파일 한 곳에서만 만든다(작업 약속 2장).
// 고등부 앱 src/lib/supabase.ts 의 복사본. 다른 점은 하나: 출석부의 "로그인 유지" 선택을 지키려고
// 세션 저장소를 authStorage(탭 세션 ↔ 브라우저 유지)로 바꿔 끼운다.

let client: SupabaseClient | null = null;

/** 공개 환경 변수가 모두 있을 때만 참. 없으면 앱은 뜨되 로그인·저장은 설정 오류로 끝난다. */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
}

export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) throw new Error("Supabase 공개 설정(NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY)이 없습니다.");
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce", storage: authStorage },
  });
  return client;
}
