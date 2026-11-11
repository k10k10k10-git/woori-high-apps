import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// 브라우저 Supabase 클라이언트는 이 파일 한 곳에서만 만든다(작업 약속 2장).
// 데이터 계층 작업자도 같은 모양(getSupabase)으로 만들며, 통합 때 하나로 합친다.

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
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  });
  return client;
}
