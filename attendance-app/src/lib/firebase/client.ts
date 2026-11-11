'use client';
// Firebase 에서 Supabase 로 플랫폼만 바꿨다(docs/SUPABASE_PLATFORM_CONTRACT.md).
// 화면·업무 코드가 쓰던 이름(db, auth)은 그대로 두고 새 모듈의 값을 내보낸다.
// 이 파일은 공개 환경 변수를 읽지 않으므로 설정이 없어도 빌드·화면이 뜬다(실제 연결 때 설정 오류가 난다).
import { getDatabase } from '@/lib/rtdb';

export { auth } from '@/lib/supabaseAuth';
export const db = getDatabase();
