import { authenticateFinanceRequest, financeHttp, getFinanceReceipt } from "@/features/finance/server";
import { financeYear } from "@/features/finance/model";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ year: string; entryId: string; receiptId: string }> };
export async function GET(request: Request, context: Context) {
  let response: Response | undefined;
  const error = await financeHttp(async () => {
    const actor = await authenticateFinanceRequest(request);
    const { year, entryId, receiptId } = await context.params;
    response = await getFinanceReceipt(actor, financeYear(year), entryId, receiptId);
    return null;
  });
  return response ?? error;
}
