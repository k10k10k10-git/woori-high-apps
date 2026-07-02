import { NextResponse } from "next/server";

// 매 요청마다 현재 배포의 빌드 ID를 반환 — 클라이언트가 폴링해 새 버전 배포를 감지한다.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? "" });
}
