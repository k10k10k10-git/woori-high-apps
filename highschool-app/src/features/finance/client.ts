import { auth } from "@/lib/firebase";
import type { FinanceCommand, FinanceHistoryItem, FinanceReceipt, FinanceView } from "./types";

export class FinanceApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = "FinanceApiError"; }
}
async function financeRequest(path: string, options: RequestInit = {}): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new FinanceApiError("로그인 후 다시 시도해 주세요.", 401);
  const token = await user.getIdToken().catch(() => { throw new FinanceApiError("로그인 상태를 확인하지 못했습니다. 다시 로그인해 주세요.", 401); });
  if (auth.currentUser?.uid !== user.uid) throw new FinanceApiError("로그인 계정이 바뀌었습니다. 다시 불러와 주세요.", 401);
  const response = await fetch(path, { ...options, cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` } }).catch((error: unknown) => {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new FinanceApiError("회계 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.", 503);
  });
  if (auth.currentUser?.uid !== user.uid) throw new FinanceApiError("로그인 계정이 바뀌었습니다. 다시 불러와 주세요.", 401);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new FinanceApiError(typeof body?.error === "string" ? body.error : "회계 기록을 불러오지 못했습니다. 다시 시도해 주세요.", response.status, body?.code);
  }
  return response;
}
async function financeJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const uid = auth.currentUser?.uid;
  const body = await (await financeRequest(path, options)).json();
  if (auth.currentUser?.uid !== uid) throw new FinanceApiError("로그인 계정이 바뀌었습니다. 다시 불러와 주세요.", 401);
  return body as T;
}
export async function readFinance(year: number, signal?: AbortSignal): Promise<FinanceView> {
  return financeJson(`/api/finance/${year}`, { signal });
}
export async function mutateFinance(year: number, command: FinanceCommand): Promise<FinanceView> {
  return financeJson(`/api/finance/${year}`, { method: "POST", body: JSON.stringify(command) });
}
export async function readFinanceHistory(year: number, entryId: string, signal?: AbortSignal): Promise<FinanceHistoryItem[]> {
  return financeJson(`/api/finance/${year}?history=${encodeURIComponent(entryId)}`, { signal });
}
export async function downloadFinanceReceipt(year: number, entryId: string, receipt: FinanceReceipt): Promise<void> {
  const uid = auth.currentUser?.uid;
  const response = await financeRequest(`/api/finance/${year}/receipts/${encodeURIComponent(entryId)}/${encodeURIComponent(receipt.id)}`);
  const blob = await response.blob();
  if (auth.currentUser?.uid !== uid) throw new FinanceApiError("로그인 계정이 바뀌었습니다. 다시 불러와 주세요.", 401);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = receipt.name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
