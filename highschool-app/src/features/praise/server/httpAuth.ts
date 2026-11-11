import "server-only";
import { resolveMinistryRoles } from "@/features/portal/accessPolicy";
import { mergeTeamMemberships } from "@/features/teams/teamModel";
import type { PraiseActor } from "../types";
import { getPraiseAdmin, PraiseRequestError, praiseUnavailable, type VerifiedAccount } from "./supabaseAdmin";

function unauthorized() {
  return new PraiseRequestError(401, "다시 로그인한 뒤 이용해 주세요.", "unauthorized");
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** 클라이언트 역할·UID를 받지 않고 인증 서버가 확인한 Supabase 접근 토큰과 현재 역할 원장을 사용한다. */
export async function authenticatePraiseRequest(request: Request): Promise<PraiseActor> {
  const authorization = request.headers.get("authorization");
  if (!authorization || authorization.length > 16384 || !/^Bearer [^\s,]+$/i.test(authorization)) throw unauthorized();
  const { auth, database } = getPraiseAdmin();
  let account: VerifiedAccount;
  try {
    // 인증 서버에 직접 물어 만료·로그아웃(세션 폐기)·삭제된 계정을 거절한다.
    account = await auth.verifyAccessToken(authorization.slice(7));
  } catch (error) {
    if (record(error)?.code === "invalid_token") throw unauthorized();
    throw praiseUnavailable("auth_unavailable");
  }
  const uid = account.uid;
  if (typeof uid !== "string" || !uid.length || uid.length > 128 || /[.#$\[\]/\u0000-\u001f\u007f]/.test(uid)) throw unauthorized();
  // 익명·정지 계정은 실제 승인 계정으로 취급하지 않는다.
  if (account.anonymous || account.disabled) throw unauthorized();
  let values: unknown[];
  try {
    values = await Promise.all(["admins", "retreatAdmins", "iguardMembers", "iguardRoles"]
      .map((bucket) => database.get(`${bucket}/${uid}`)));
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
  const name = typeof account.name === "string" && account.name.trim().length > 0 && account.name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(account.name)
    ? account.name.trim() : undefined;
  return {
    uid,
    ...(name ? { name } : {}),
    roles,
    teamMemberships: mergeTeamMemberships(
      record(iguardMember)?.teamMemberships,
      record(retreatAdmin)?.teamMemberships,
    ),
  };
}
