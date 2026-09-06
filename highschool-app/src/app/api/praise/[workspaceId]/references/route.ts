import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { praiseHttp } from "@/features/praise/server/http";
import { requireWorkspace } from "@/features/praise/server/service";
import { praiseReferences } from "@/features/praise/server/references";
import { id } from "@/features/praise/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) { return praiseHttp(async () => { const actor = await authenticatePraiseRequest(request); await requireWorkspace(actor, id((await context.params).workspaceId), true); return { semesters: await praiseReferences() }; }); }
