import "server-only";
import { canResetAccountPassword } from "@/features/portal/accessPolicy";
import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { praiseJson, praiseResponse } from "@/features/praise/server/http";
import { getPraiseAdmin, PraiseRequestError } from "@/features/praise/server/supabaseAdmin";
import { PraiseDomainError, requireValue } from "@/features/praise/server/validation";
import { parseAccountPasswordInput } from "./passwordPolicy";

/**
 * 통합관리자가 메일함 없는 계정의 비밀번호를 정한다. 요청자의 Supabase 접근 토큰을 인증 서버에
 * 확인하고, 규칙 uid(whoami)의 `admins/{uid}`가 true 인지 서버 DB 에서 다시 읽는다.
 * 비밀번호는 응답·로그에 남기지 않는다.
 */
export async function setAccountPassword(request: Request): Promise<Response> {
  try {
    const actor = await authenticatePraiseRequest(request);
    requireValue(canResetAccountPassword(actor.roles), "통합관리자만 비밀번호를 정할 수 있습니다.", "forbidden", 403);
    const input = parseAccountPasswordInput(await praiseJson(request));
    if (typeof input === "string") throw new PraiseDomainError(400, input, "invalid_input");
    let result: { created: boolean };
    try {
      result = await getPraiseAdmin().auth.setPassword(input.email, input.password);
    } catch (error) {
      if ((error as { code?: unknown })?.code === "weak_password") {
        throw new PraiseDomainError(400, "비밀번호가 너무 쉽습니다. 더 길거나 섞인 비밀번호로 정해 주세요.", "weak_password");
      }
      throw new PraiseRequestError(503, "계정 서버에 연결하지 못했습니다.", "account_unavailable");
    }
    return praiseResponse({ created: result.created });
  } catch (error) {
    if (error instanceof PraiseRequestError || error instanceof PraiseDomainError) {
      const message = error.status === 503 ? "계정 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." : error.message;
      return praiseResponse({ error: message, code: error.code }, error.status);
    }
    return praiseResponse({ error: "비밀번호를 정하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: "unavailable" }, 503);
  }
}
