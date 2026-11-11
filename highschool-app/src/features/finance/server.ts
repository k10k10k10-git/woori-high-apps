import "server-only";
import { createHash } from "node:crypto";
import { canManageAnnualFinance } from "@/features/portal/accessPolicy";
import type { PraiseActor } from "@/features/praise/types";
import { getPraiseAdmin, PraiseRequestError } from "@/features/praise/server/supabaseAdmin";
import { authenticatePraiseRequest } from "@/features/praise/server/httpAuth";
import { praiseJson, praiseResponse } from "@/features/praise/server/http";
import { PraiseDomainError } from "@/features/praise/server/validation";
import { financeFilePath, financeLedgerPath } from "@/lib/paths";
import { applyFinanceCommand, FinanceError, financeEntryId, financeReceiptId, financeView, financeYear, MAX_RECEIPT_BYTES, parseFinanceCommand, readFinanceLedger } from "./model";
import type { FinanceCommand, FinanceHistoryItem, FinanceReceipt } from "./types";

export async function authenticateFinanceRequest(request: Request): Promise<PraiseActor> {
  const actor = await authenticatePraiseRequest(request);
  if (!canManageAnnualFinance(actor.roles)) throw new FinanceError(403, "연간 회계는 교역자·행정팀·통합관리자만 이용할 수 있습니다.", "forbidden");
  return actor;
}
export async function financeHttp(action: () => Promise<unknown>): Promise<Response> {
  try { return praiseResponse(await action()); }
  catch (error) {
    if (error instanceof FinanceError || error instanceof PraiseDomainError || error instanceof PraiseRequestError) {
      return praiseResponse({ error: error.status === 503 ? "회계 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요." : error.message, code: error.code }, error.status);
    }
    return praiseResponse({ error: "회계 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", code: "unavailable" }, 503);
  }
}
export async function financeJson(request: Request, year: number): Promise<FinanceCommand> {
  return parseFinanceCommand(await praiseJson(request), year);
}
function database() { return getPraiseAdmin().database; }
/** 서버 transaction 은 실제 저장값(hash)에서 시작한다. 응답이 늦으면 10초 뒤 연결 오류로 끝낸다. */
async function transact(path: string, update: (value: unknown) => unknown) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      database().transaction(path, update),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new FinanceError(503, "회계 연결을 확인해 주세요.", "unavailable")), 10_000); }),
    ]);
  } finally { clearTimeout(timer); }
}
function assertActor(actor: PraiseActor) {
  if (!canManageAnnualFinance(actor.roles)) throw new FinanceError(403, "연간 회계 이용 권한이 없습니다.", "forbidden");
}
export async function getFinance(actor: PraiseActor, year: number) {
  assertActor(actor); financeYear(year);
  const ledger = readFinanceLedger(await database().get(financeLedgerPath(year)), year);
  return financeView(ledger);
}
export async function getFinanceHistory(actor: PraiseActor, year: number, target: string): Promise<FinanceHistoryItem[]> {
  assertActor(actor); financeYear(year);
  if (target !== "opening") financeEntryId(target);
  const ledger = readFinanceLedger(await database().get(financeLedgerPath(year)), year);
  return Object.values(ledger.history[target] ?? {}).sort((a, b) => b.at.localeCompare(a.at));
}
interface StoredReceipt extends FinanceReceipt { schemaVersion: 1; sha256: string; base64: string }
function sha256(value: string | Buffer) { return createHash("sha256").update(value).digest("hex"); }
function validFileMagic(bytes: Buffer, mime: FinanceReceipt["mimeType"]) {
  return mime === "application/pdf" ? bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))
    : mime === "image/png" ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}
function prepareReceipt(command: Extract<FinanceCommand, { kind: "receipt.add" }>, at: string): StoredReceipt {
  const bytes = Buffer.from(command.file.base64, "base64");
  const mime = command.file.mimeType;
  if (!bytes.length || bytes.length > MAX_RECEIPT_BYTES || bytes.toString("base64") !== command.file.base64 || !validFileMagic(bytes, mime)) throw new FinanceError(400, "실제 파일 형식이 JPG·PNG·PDF인지, 크기가 512KB 이하인지 확인해 주세요.", "invalid_file");
  return { schemaVersion: 1, id: `receipt_${command.operationId}`, name: command.file.name, mimeType: mime, size: bytes.length, createdAt: at, sha256: sha256(bytes), base64: command.file.base64 };
}
export async function executeFinance(actor: PraiseActor, year: number, value: unknown) {
  assertActor(actor); financeYear(year);
  const command = parseFinanceCommand(value, year);
  const at = new Date().toISOString();
  const digest = sha256(JSON.stringify(command));
  const file = command.kind === "receipt.add" ? prepareReceipt(command, at) : undefined;
  const receipt: FinanceReceipt | undefined = file ? { id: file.id, name: file.name, mimeType: file.mimeType, size: file.size, createdAt: file.createdAt } : undefined;
  const db = database();
  const ledgerPath = financeLedgerPath(year);
  // 파일을 만들기 전에 원장 형태·버전·기존 멱등 작업을 확인한다.
  const current = readFinanceLedger(await db.get(ledgerPath), year);
  const preview = applyFinanceCommand(current, command, actor, at, digest, receipt);
  if (preview === current) return financeView(current);
  if (file) {
    let conflict = false;
    const stored = await transact(financeFilePath(year, file.id), (value) => {
      const existing = value as StoredReceipt | null;
      if (existing === null) return file;
      if (existing?.schemaVersion === 1 && existing.id === file.id && existing.sha256 === file.sha256 && existing.base64 === file.base64 && existing.name === file.name && existing.mimeType === file.mimeType && existing.size === file.size && typeof existing.createdAt === "string" && Number.isFinite(Date.parse(existing.createdAt))) return existing;
      conflict = true; return undefined;
    });
    if (conflict || !stored.committed) throw new FinanceError(409, "이미 사용된 증빙 작업 번호입니다. 다시 파일을 선택해 주세요.", "operation_conflict");
    // 재시도의 증빙 생성 시각은 최초 저장본을 유지한다.
    if (receipt) receipt.createdAt = (stored.value as StoredReceipt).createdAt;
  }
  let domainError: FinanceError | undefined;
  const result = await transact(ledgerPath, (raw) => {
    try { return applyFinanceCommand(readFinanceLedger(raw, year), command, actor, at, digest, receipt); }
    catch (error) {
      if (error instanceof FinanceError) { domainError = error; return undefined; }
      throw error;
    }
  });
  if (!result.committed) throw domainError ?? new FinanceError(409, "장부가 변경되었습니다. 다시 불러온 뒤 확인해 주세요.", "revision_conflict");
  return financeView(readFinanceLedger(result.value, year));
}
export async function getFinanceReceipt(actor: PraiseActor, year: number, entryId: string, receiptId: string): Promise<Response> {
  assertActor(actor); financeYear(year); financeEntryId(entryId); financeReceiptId(receiptId);
  const db = database();
  const ledger = readFinanceLedger(await db.get(financeLedgerPath(year)), year);
  const expected = ledger.entries[entryId]?.receipts.find((receipt) => receipt.id === receiptId);
  if (!expected) throw new FinanceError(404, "이 거래에 연결된 증빙이 없습니다.", "not_found");
  const file = await db.get(financeFilePath(year, receiptId)) as StoredReceipt | null;
  if (!file || file.schemaVersion !== 1 || file.id !== expected.id || file.mimeType !== expected.mimeType || file.size !== expected.size || typeof file.base64 !== "string" || file.base64.length > Math.ceil(MAX_RECEIPT_BYTES / 3) * 4) throw new FinanceError(503, "증빙 파일을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.", "receipt_unavailable");
  const bytes = Buffer.from(file.base64, "base64");
  if (bytes.length !== expected.size || sha256(bytes) !== file.sha256 || bytes.toString("base64") !== file.base64 || !validFileMagic(bytes, expected.mimeType)) throw new FinanceError(503, "증빙 파일을 확인하지 못했습니다.", "receipt_unavailable");
  const encodedName = encodeURIComponent(expected.name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": expected.mimeType, "Content-Length": String(bytes.length), "Content-Disposition": `attachment; filename="receipt${expected.mimeType === "application/pdf" ? ".pdf" : expected.mimeType === "image/png" ? ".png" : ".jpg"}"; filename*=UTF-8''${encodedName}`, "Cache-Control": "private, no-store", Vary: "Authorization", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
}
