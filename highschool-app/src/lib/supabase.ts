import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * 앱 전체가 함께 쓰는 Supabase 클라이언트 — 데이터(`@/lib/rtdb`)·로그인·파일 저장이 모두 이 하나를 쓴다.
 * 공개 환경 변수만 쓰며, 브라우저에서는 로그인 세션을 저장해 새로고침 뒤에도 유지한다.
 * 처음 부를 때 만든다(환경 변수가 없는 빌드·시험에서 import 만으로 실패하지 않게).
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase 공개 환경 변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)가 설정되지 않았습니다.");
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}
