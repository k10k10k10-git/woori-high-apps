import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { praiseHttp, praiseJson } from "@/features/praise/server/http";
import { parseCommand } from "@/features/praise/server/parsers";
import { executePraise, requireWorkspace } from "@/features/praise/server/service";
import { praiseView } from "@/features/praise/server/view";
import { id } from "@/features/praise/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ workspaceId: string }> };
export async function GET(request: Request, context: Context) { return praiseHttp(async () => { const actor = await authenticatePraiseRequest(request); return praiseView(await requireWorkspace(actor, id((await context.params).workspaceId)), actor); }); }
export async function POST(request: Request, context: Context) { return praiseHttp(async () => { const actor = await authenticatePraiseRequest(request); return executePraise(actor, id((await context.params).workspaceId), parseCommand(await praiseJson(request))); }); }
