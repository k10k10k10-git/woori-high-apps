import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { listSemesterIds } from "@/features/praise/server/references";
import { praiseHttp } from "@/features/praise/server/http";
import { requireValue } from "@/features/praise/server/validation";
import { hasAnyMinistryRole } from "@/features/portal/accessPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return praiseHttp(async () => {
    const actor = await authenticatePraiseRequest(request);
    requireValue(hasAnyMinistryRole(actor.roles), "승인된 사역 계정으로 이용해 주세요.", "forbidden", 403);
    return { ids: await listSemesterIds() };
  });
}
