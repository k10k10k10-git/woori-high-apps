import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { getPraiseFirebaseAdmin, praiseUnavailable } from "@/features/praise/server/firebaseAdmin";
import { praiseHttp } from "@/features/praise/server/http";
import { activeTeamKeys, canAccessOperationsCenter } from "@/features/teams/teamModel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return praiseHttp(async () => {
    const actor = await authenticatePraiseRequest(request);
    const semesterId = new URL(request.url).searchParams.get("semesterId") ?? "";
    if (!/^\d{4}-(?:1|2|sunday)$/.test(semesterId) || !(canAccessOperationsCenter(actor.roles, actor.teamMemberships)
      || activeTeamKeys(actor.teamMemberships, semesterId).includes("barnabas"))) return { classes: [] };
    const year = semesterId.slice(0, 4);
    let value: unknown;
    try {
      value = (await getPraiseFirebaseAdmin().database.ref(`classes/${year}`).get()).val();
    } catch {
      throw praiseUnavailable("class_options_unavailable");
    }
    return { classes: value && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(value).map(([classKey, item]) => ({ classKey, teacher: typeof (item as {teacher?: unknown})?.teacher === "string" ? (item as {teacher: string}).teacher : "", students: {} }))
      : [] };
  });
}
