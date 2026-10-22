import { authenticateFinanceRequest, executeFinance, financeHttp, financeJson, getFinance, getFinanceHistory } from "@/features/finance/server";
import { financeYear } from "@/features/finance/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
type Context = { params: Promise<{ year: string }> };
export async function GET(request: Request, context: Context) {
  return financeHttp(async () => {
    const actor = await authenticateFinanceRequest(request);
    const year = financeYear((await context.params).year);
    const history = new URL(request.url).searchParams.get("history");
    return history === null ? getFinance(actor, year) : getFinanceHistory(actor, year, history);
  });
}
export async function POST(request: Request, context: Context) {
  return financeHttp(async () => {
    const actor = await authenticateFinanceRequest(request);
    const year = financeYear((await context.params).year);
    return executeFinance(actor, year, await financeJson(request, year));
  });
}
