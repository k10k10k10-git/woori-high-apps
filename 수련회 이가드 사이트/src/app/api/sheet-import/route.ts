import { NextRequest, NextResponse } from "next/server";

// 구글 시트 CSV를 서버에서 가져온다(브라우저 직접 fetch는 CORS·307 리다이렉트로 불가).
export const runtime = "nodejs";

// ── Firebase ID 토큰 검증 (Admin SDK 없이 Google OAuth2 tokeninfo 사용) ──
async function verifyFirebaseToken(req: NextRequest): Promise<{ uid: string; email?: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token) return null;
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?id_token=${encodeURIComponent(token)}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    // aud must match our Firebase project
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    if (projectId && data.aud !== projectId) return null;
    if (!data.sub) return null;
    return { uid: data.sub, email: data.email };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  // 인증 검증 — 유효한 Firebase 사용자만 시트를 가져올 수 있음
  const user = await verifyFirebaseToken(req);
  if (!user) {
    return NextResponse.json(
      { error: "인증이 필요합니다. 로그인 후 다시 시도해주세요." },
      { status: 401 }
    );
  }

  const id = req.nextUrl.searchParams.get("id");
  const gid = req.nextUrl.searchParams.get("gid");
  const sheetName = req.nextUrl.searchParams.get("sheet");
  if (!id) return NextResponse.json({ error: "시트 ID가 없습니다." }, { status: 400 });

  // SSRF 방어: 시트 ID·gid 형식 검증 — 임의 URL 생성 방지
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    return NextResponse.json({ error: "시트 ID 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (gid && !/^\d+$/.test(gid)) {
    return NextResponse.json({ error: "GID 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // sheet(탭 이름)가 있으면 gviz로 이름 조회 — 링크 하나(시트ID)로 여러 탭 접근 가능
  const url = sheetName
    ? `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
    : `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid ?? "0"}`;
  try {
    const res = await fetch(url, {
      redirect: "follow", // docs.google.com → googleusercontent.com 307 자동 추적
      headers: { "User-Agent": "Mozilla/5.0 (iguard cuesheet import)" },
    });
    const text = await res.text();
    const contentType = res.headers.get("content-type") || "";

    // 비공개 시트는 로그인 HTML을 돌려준다 — CSV가 아니면 게시 안내
    if (!res.ok || contentType.includes("text/html") || /<html/i.test(text.slice(0, 300))) {
      return NextResponse.json(
        { error: "시트를 불러오지 못했습니다. 파일 → 공유 → 웹에 게시(CSV)로 공개했는지 확인해주세요." },
        { status: 403 }
      );
    }
    return NextResponse.json({ csv: text });
  } catch (e) {
    return NextResponse.json(
      { error: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
}
