import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

/** 토큰·인증서·SDK 내부 오류를 응답에 노출하지 않는 서버 경계 오류. */
export class PraiseRequestError extends Error {
  constructor(public status: 401 | 503, message: string, public code: string) {
    super(message);
    this.name = "PraiseRequestError";
  }
}

export function praiseUnavailable(code = "praise_unavailable"): PraiseRequestError {
  return new PraiseRequestError(503, "찬양팀 서버 연결을 확인하고 다시 시도해 주세요.", code);
}

const APP_NAME = "woori-praise-server";

function configuration() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim();
  const credentialJson = process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  // 검증하지 않은 로컬 ADC·에뮬레이터로 운영 요청이 흘러가지 않게 명시 자격만 받는다.
  if (!projectId || !databaseURL || !credentialJson || process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
    throw praiseUnavailable("server_not_configured");
  }
  try {
    const url = new URL(databaseURL);
    const prefix = `${projectId}-default-rtdb`;
    const allowedHost = url.hostname === `${projectId}.firebaseio.com`
      || url.hostname === `${prefix}.firebaseio.com`
      || (url.hostname.startsWith(`${prefix}.`) && /^[a-z0-9-]+\.firebasedatabase\.app$/.test(url.hostname.slice(prefix.length + 1)));
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || !["", "/"].includes(url.pathname) || !allowedHost) throw new Error();
    const source = JSON.parse(credentialJson) as Record<string, unknown>;
    if (source.type !== "service_account" || source.project_id !== projectId
      || typeof source.client_email !== "string" || !source.client_email.endsWith(`@${projectId}.iam.gserviceaccount.com`)
      || typeof source.private_key !== "string" || !source.private_key.startsWith("-----BEGIN PRIVATE KEY-----")) throw new Error();
    return { projectId, databaseURL: url.origin, credential: { projectId, clientEmail: source.client_email, privateKey: source.private_key } };
  } catch {
    throw praiseUnavailable("server_not_configured");
  }
}

export function getPraiseFirebaseAdmin() {
  const config = configuration();
  try {
    let app: App | undefined = getApps().find((entry) => entry.name === APP_NAME);
    if (app && (app.options.projectId !== config.projectId || app.options.databaseURL !== config.databaseURL)) throw new Error();
    app ??= initializeApp({ projectId: config.projectId, databaseURL: config.databaseURL, credential: cert(config.credential) }, APP_NAME);
    return { app, auth: getAuth(app), database: getDatabase(app) };
  } catch {
    throw praiseUnavailable("server_not_configured");
  }
}
