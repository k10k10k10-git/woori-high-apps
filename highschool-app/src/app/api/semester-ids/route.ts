import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { listSemesterIds } from "@/features/praise/server/references";
import { praiseHttp } from "@/features/praise/server/http";
import { requireValue } from "@/features/praise/server/validation";
import { hasAnyMinistryRole } from "@/features/portal/accessPolicy";
import { canViewSemesterOperations } from "@/features/teams/teamModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return praiseHttp(async () => {
    const actor = await authenticatePraiseRequest(request);
    const hasMinistryRole = hasAnyMinistryRole(actor.roles);
    requireValue(hasMinistryRole || canViewSemesterOperations(actor.roles, actor.teamMemberships), "승인된 사역 계정으로 이용해 주세요.", "forbidden", 403);
    const ids = await listSemesterIds();
    return { ids: hasMinistryRole ? ids : ids.filter((semesterId) => canViewSemesterOperations(actor.roles, actor.teamMemberships, semesterId)) };
  });
}
