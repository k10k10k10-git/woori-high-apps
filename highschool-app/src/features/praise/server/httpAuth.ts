import "server-only";
import { resolveMinistryRoles } from "@/features/portal/accessPolicy";
import type { PraiseActor } from "../types";
import { getPraiseFirebaseAdmin, PraiseRequestError, praiseUnavailable } from "./firebaseAdmin";

const invalidTokenCodes = new Set([
  "auth/argument-error", "auth/id-token-expired", "auth/id-token-revoked", "auth/invalid-id-token",
  "auth/user-disabled", "auth/user-not-found", "auth/invalid-argument",
]);
function unauthorized() {
  return new PraiseRequestError(401, "다시 로그인한 뒤 이용해 주세요.", "unauthorized");
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** 클라이언트 역할·UID를 받지 않고 폐기 여부를 검사한 토큰과 현재 역할 원장을 사용한다. */
export async function authenticatePraiseRequest(request: Request): Promise<PraiseActor> {
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 16384 || !/^Bearer [^\s,]+$/i.test(authorization)) throw unauthorized();
  const { auth, database } = getPraiseFirebaseAdmin();
  let token;
  try {
    token = await auth.verifyIdToken(authorization.slice(7), true);
  } catch (error) {
    const code = record(error)?.code;
    if (typeof code === "string" && invalidTokenCodes.has(code)) throw unauthorized();
    throw praiseUnavailable("auth_unavailable");
  }
  const uid = token.uid;
  if (typeof uid !== "string" || !uid.length || uid.length > 128 || /[.#$\[\]/\u0000-\u001f\u007f]/.test(uid)) throw unauthorized();
  // Firebase 익명 계정은 실제 승인 계정으로 취급하지 않는다.
  if (token.firebase?.sign_in_provider === "anonymous") throw unauthorized();
  let values: unknown[];
  try {
    values = await Promise.all(["admins", "retreatAdmins", "iguardMembers", "iguardRoles"]
      .map(async (bucket) => (await database.ref(`${bucket}/${uid}`).get()).val()));
  } catch {
    throw praiseUnavailable("roles_unavailable");
  }
  const [admin, retreatAdmin, iguardMember, iguardRole] = values;
  const roleSource = record(retreatAdmin) ?? record(iguardMember);
  const roles = resolveMinistryRoles({
    isMainAdmin: admin === true,
    hasRetreatAdmin: retreatAdmin !== null && retreatAdmin !== undefined,
    retreatAdminRole: record(retreatAdmin)?.role,
    hasIguardMember: iguardMember !== null && iguardMember !== undefined,
    iguardRole,
    semesterRole: roleSource?.semesterRole,
    retreatRole: roleSource?.retreatRole,
  });
  const name = typeof token.name === "string" && token.name.trim().length > 0 && token.name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(token.name)
    ? token.name.trim() : undefined;
  return { uid, ...(name ? { name } : {}), roles };
}
