import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { praiseHttp, praiseJson } from "@/features/praise/server/http";
import { parseCreate } from "@/features/praise/server/parsers";
import { createPraise, listPraise } from "@/features/praise/server/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) { return praiseHttp(async () => listPraise(await authenticatePraiseRequest(request))); }
export async function POST(request: Request) { return praiseHttp(async () => { const actor = await authenticatePraiseRequest(request); return createPraise(actor, parseCreate(await praiseJson(request))); }); }
