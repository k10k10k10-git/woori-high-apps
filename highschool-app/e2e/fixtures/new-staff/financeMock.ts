import { applyFinanceCommand, emptyFinanceLedger, financeView } from "@/features/finance/model";
import type { FinanceCommand, FinanceReceipt } from "@/features/finance/types";
import { qa } from "./qaState";

// 브라우저 QA 전용 메모리 원장. 실제 인증·API·Firebase는 로드하지 않는다.
const ledgers = new Map<number, ReturnType<typeof emptyFinanceLedger>>();
export class FinanceApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}
function ledger(year: number) {
  if (!ledgers.has(year)) ledgers.set(year, emptyFinanceLedger(year));
  return ledgers.get(year)!;
}
export async function readFinance(year: number) { return financeView(ledger(year)); }
export async function mutateFinance(year: number, command: FinanceCommand) {
  qa.writes.push(command);
  const receipt: FinanceReceipt | undefined = command.kind === "receipt.add" ? {
    id: `receipt_${command.operationId}`, name: command.file.name, mimeType: command.file.mimeType,
    size: atob(command.file.base64).length, createdAt: new Date().toISOString(),
  } : undefined;
  const next = applyFinanceCommand(ledger(year), command, { uid: "synthetic-admin", name: "합성 행정" }, new Date().toISOString(), JSON.stringify(command), receipt);
  ledgers.set(year, next);
  return financeView(next);
}
export async function readFinanceHistory(year: number, entryId: string) { return Object.values(ledger(year).history[entryId] ?? {}); }
export async function downloadFinanceReceipt() { qa.writes.push({ kind: "synthetic-download" }); }
