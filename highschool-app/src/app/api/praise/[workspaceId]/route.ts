import { after } from "next/server";
import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { praiseHttp, praiseJson } from "@/features/praise/server/http";
import { parseCommand } from "@/features/praise/server/parsers";
import { executePraise, readPraiseView } from "@/features/praise/server/service";
import { id } from "@/features/praise/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ workspaceId: string }> };
function attendanceMeetingOf(request: Request) {
  const meeting = new URL(request.url).searchParams.get("attendance");
  return meeting ? id(meeting) : meeting ?? undefined;
}
export async function GET(request: Request, context: Context) { return praiseHttp(async () => { const actor = await authenticatePraiseRequest(request); return readPraiseView(actor, id((await context.params).workspaceId), attendanceMeetingOf(request)); }); }
export async function POST(request: Request, context: Context) { return praiseHttp(async () => { const actor = await authenticatePraiseRequest(request); return executePraise(actor, id((await context.params).workspaceId), parseCommand(await praiseJson(request)), after, attendanceMeetingOf(request)); }); }
