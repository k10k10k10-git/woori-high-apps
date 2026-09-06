import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { praiseHttp } from "@/features/praise/server/http";
import { createPraiseReferences } from "@/features/praise/server/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return praiseHttp(async () => createPraiseReferences(await authenticatePraiseRequest(request)));
}
