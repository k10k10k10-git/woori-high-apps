import { NextRequest, NextResponse } from "next/server";
import { createVerify, X509Certificate } from "node:crypto";

// 구글 시트 CSV를 서버에서 가져온다(브라우저 직접 fetch는 CORS·307 리다이렉트로 불가).
export const runtime = "nodejs";

// ── Firebase ID 토큰 검증 (Admin SDK 없이 직접 서명 검증) ──
// ⚠ https://www.googleapis.com/oauth2/v3/tokeninfo 는 Google 자체 OAuth 로그인 토큰(iss=accounts.google.com)
//   검증용이라, Firebase Auth가 발급한 ID 토큰(iss=securetoken.google.com/{project})은 여기서 항상 실패한다.
//   (로그인 여부와 무관하게 매번 401 — 실사용 버그로 발견됨). Firebase 공식 REST 검증 절차대로
//   securetoken 공개 인증서로 RS256 서명을 직접 검증한다.
const SECURETOKEN_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
let certsCache: { certs: Record<string, string>; expiresAt: number } | null = null;

async function getSecuretokenCerts(): Promise<Record<string, string>> {
  if (certsCache && certsCache.expiresAt > Date.now()) return certsCache.certs;
  const res = await fetch(SECURETOKEN_CERTS_URL);
  if (!res.ok) throw new Error("인증서를 가져오지 못했습니다.");
  const certs = await res.json() as Record<string, string>;
  // Google이 내려주는 Cache-Control max-age를 존중, 없으면 10분 기본값
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1000 : 10 * 60 * 1000;
  certsCache = { certs, expiresAt: Date.now() + maxAgeMs };
  return certs;
}

function base64UrlJSON(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
}

async function verifyFirebaseToken(req: NextRequest): Promise<{ uid: string; email?: string } | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let payload: { aud?: string; iss?: string; sub?: string; email?: string; exp?: number; iat?: number };
  try {
    header = base64UrlJSON(headerB64);
    payload = base64UrlJSON(payloadB64);
  } catch {
    return null;
  }

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  if (header.alg !== "RS256" || !header.kid) return null;
  if (payload.aud !== projectId) return null;
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  if (typeof payload.iat !== "number" || payload.iat > now + 60) return null; // 시계 오차 허용

  try {
    const certs = await getSecuretokenCerts();
    const pem = certs[header.kid];
    if (!pem) return null;

    const publicKey = new X509Certificate(pem).publicKey;
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    const valid = verifier.verify(publicKey, Buffer.from(signatureB64, "base64url"));
    if (!valid) return null;
  } catch {
    return null;
  }

  return { uid: payload.sub, email: payload.email };
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
