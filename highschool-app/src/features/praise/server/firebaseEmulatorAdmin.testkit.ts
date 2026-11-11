// 계약 시험 전용: Firebase RTDB·Auth 에뮬레이터를 새 서버 어댑터(PraiseAdmin) 모양으로 감싼다.
// 운영 코드는 Supabase(`supabaseAdmin.ts`)를 쓰고, 이 파일은 `*.integration.test.ts`에서만 import 한다.
// 실제 트리 DB 의 직렬화·동시 저장·토큰 폐기 계약을 서버 업무 코드에 그대로 검사하기 위한 다리다.
import type { App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import { AdminError, type PraiseAdmin } from "./supabaseAdmin";

const INVALID = new Set(["auth/argument-error", "auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token", "auth/user-disabled", "auth/user-not-found", "auth/invalid-argument"]);

export function firebaseEmulatorAdmin(app: App): PraiseAdmin {
  const database = getDatabase(app);
  const auth = getAuth(app);
  const base = String(app.options.databaseURL);
  const rest = (path: string) => {
    const url = new URL(`/${path}.json`, base);
    url.searchParams.set("ns", new URL(base).searchParams.get("ns") ?? "");
    return url;
  };
  const headers = { Authorization: "Bearer owner" };
  return {
    database: {
      async get(path) { return (await database.ref(path).get()).val(); },
      async shallow(path) {
        const url = rest(path); url.searchParams.set("shallow", "true");
        return (await fetch(url, { headers })).json();
      },
      async transaction(path, update) {
        const reference = database.ref(path);
        // 에뮬레이터 SDK 의 첫 null 캐시를 피하려고 실제 값을 받은 뒤 시작한다.
        let stop = () => {};
        await new Promise<void>((resolve, reject) => { const listener = () => resolve(); stop = () => reference.off("value", listener); reference.on("value", listener, reject); });
        try {
          const result = await reference.transaction(update, undefined, false);
          return { committed: result.committed, value: result.snapshot.val() };
        } finally { stop(); }
      },
      async readHashed(path) {
        const response = await fetch(rest(path), { headers: { ...headers, "X-Firebase-ETag": "true" } });
        return { value: await response.json(), hash: response.headers.get("etag") ?? "" };
      },
      async compareAndSet(path, expectedHash, value) {
        const response = await fetch(rest(path), { method: "PUT", headers: { ...headers, "Content-Type": "application/json", "If-Match": expectedHash }, body: JSON.stringify(value) });
        if (response.status === 412) {
          const current = await this.readHashed(path);
          return { committed: false, ...current };
        }
        return { committed: true, value: await response.json(), hash: response.headers.get("etag") ?? "" };
      },
    },
    auth: {
      async verifyAccessToken(token) {
        try {
          const decoded = await auth.verifyIdToken(token, true);
          return {
            uid: decoded.uid,
            email: decoded.email ?? null,
            name: typeof decoded.name === "string" ? decoded.name : null,
            supabaseId: decoded.uid,
            anonymous: decoded.firebase?.sign_in_provider === "anonymous",
            disabled: false,
          };
        } catch (error) {
          const code = (error as { code?: unknown })?.code;
          throw new AdminError(typeof code === "string" && INVALID.has(code) ? "invalid_token" : "auth_unavailable");
        }
      },
      async accountStatus(uid) {
        const user = await auth.getUser(uid).catch(() => null);
        return !user ? "missing" : user.disabled ? "disabled" : "active";
      },
      async setPassword() { throw new AdminError("not_supported"); },
    },
  };
}
