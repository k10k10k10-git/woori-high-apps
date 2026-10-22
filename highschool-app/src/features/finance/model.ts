import type { FinanceCommand, FinanceEntry, FinanceEntryInput, FinanceHistoryItem, FinanceReceipt, FinanceView } from "./types";

export const MAX_RECEIPT_BYTES = 512 * 1024;
export const MAX_FINANCE_AMOUNT = 1_000_000_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^(?:entry|receipt)_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class FinanceError extends Error {
  constructor(public status: number, message: string, public code = "invalid_request") { super(message); this.name = "FinanceError"; }
}
function requireValue(value: unknown, message: string, code = "invalid_request", status = 400): asserts value {
  if (!value) throw new FinanceError(status, message, code);
}
export function financeYear(value: unknown): number {
  const year = typeof value === "string" && /^\d{4}$/.test(value) ? Number(value) : value;
  requireValue(Number.isInteger(year) && (year as number) >= 2000 && (year as number) <= 2100, "회계 연도를 확인해 주세요.");
  return year as number;
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value !== null && typeof value === "object" && !Array.isArray(value), "요청 내용을 확인해 주세요.");
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[]) {
  requireValue(Object.keys(value).every((key) => keys.includes(key)), "지원하지 않는 항목이 포함되어 있습니다.");
}
function text(value: unknown, max: number, optional = false): string {
  requireValue(typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value), "입력한 문구의 길이와 형식을 확인해 주세요.");
  const result = value.trim();
  requireValue(optional || result.length > 0, "필수 항목을 입력해 주세요.");
  return result;
}
function money(value: unknown, signed = false): number {
  requireValue(Number.isSafeInteger(value) && Math.abs(value as number) <= MAX_FINANCE_AMOUNT && (signed || (value as number) > 0), "금액은 허용 범위의 원 단위 정수로 입력해 주세요.");
  return value as number;
}
function revision(value: unknown): number {
  requireValue(Number.isSafeInteger(value) && (value as number) >= 0, "기록 버전을 확인해 주세요.");
  return value as number;
}
export function financeEntryId(value: unknown): string {
  requireValue(typeof value === "string" && ID.test(value) && value.startsWith("entry_"), "거래를 확인해 주세요.");
  return value;
}
export function financeReceiptId(value: unknown): string {
  requireValue(typeof value === "string" && ID.test(value) && value.startsWith("receipt_"), "증빙을 확인해 주세요.");
  return value;
}
function entryInput(value: unknown, year: number): FinanceEntryInput {
  const source = object(value);
  exactKeys(source, ["date", "type", "category", "description", "amount", "owner", "ministry", "settlement", "receiptExemptReason"]);
  const date = source.date;
  const dateValue = typeof date === "string" ? new Date(`${date}T00:00:00Z`) : new Date(NaN);
  requireValue(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) && date.startsWith(`${year}-`) && Number.isFinite(dateValue.getTime()) && dateValue.toISOString().slice(0, 10) === date, "선택한 연도의 올바른 거래일을 입력해 주세요.");
  requireValue(source.type === "income" || source.type === "expense", "수입·지출을 선택해 주세요.");
  requireValue(source.settlement === "pending" || source.settlement === "settled", "정산 상태를 선택해 주세요.");
  return { date, type: source.type, category: text(source.category, 80), description: text(source.description, 400), amount: money(source.amount), owner: text(source.owner, 80), ministry: text(source.ministry, 120, true), settlement: source.settlement, receiptExemptReason: text(source.receiptExemptReason, 300, true) };
}
export function parseFinanceCommand(value: unknown, year: number): FinanceCommand {
  const source = object(value);
  requireValue(typeof source.operationId === "string" && UUID.test(source.operationId), "작업 번호를 확인해 주세요.");
  const base = { operationId: source.operationId, expectedRevision: revision(source.expectedRevision) };
  if (source.kind === "opening.save") {
    exactKeys(source, ["operationId", "kind", "expectedRevision", "amount"]);
    return { ...base, kind: source.kind, amount: money(source.amount, true) };
  }
  if (source.kind === "entry.save") {
    exactKeys(source, ["operationId", "kind", "entryId", "expectedRevision", "entry"]);
    return { ...base, kind: source.kind, ...(source.entryId === undefined ? {} : { entryId: financeEntryId(source.entryId) }), entry: entryInput(source.entry, year) };
  }
  if (source.kind === "entry.cancel") {
    exactKeys(source, ["operationId", "kind", "entryId", "expectedRevision", "reason"]);
    return { ...base, kind: source.kind, entryId: financeEntryId(source.entryId), reason: text(source.reason, 300) };
  }
  requireValue(source.kind === "receipt.add", "지원하지 않는 회계 작업입니다.");
  exactKeys(source, ["operationId", "kind", "entryId", "expectedRevision", "file"]);
  const file = object(source.file);
  exactKeys(file, ["name", "mimeType", "base64"]);
  const name = text(file.name, 120);
  requireValue(!/[\\/]/.test(name), "증빙 파일 이름을 확인해 주세요.");
  requireValue(["image/jpeg", "image/png", "application/pdf"].includes(String(file.mimeType)), "JPG·PNG·PDF 파일만 첨부할 수 있습니다.");
  requireValue(typeof file.base64 === "string" && file.base64.length > 0 && file.base64.length <= Math.ceil(MAX_RECEIPT_BYTES / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64), "512KB 이하의 올바른 증빙 파일을 선택해 주세요.");
  return { ...base, kind: source.kind, entryId: financeEntryId(source.entryId), file: { name, mimeType: file.mimeType as FinanceReceipt["mimeType"], base64: file.base64 } };
}
export interface FinanceLedger {
  schemaVersion: 1;
  year: number;
  openingBalance: number;
  openingRevision: number;
  entries: Record<string, FinanceEntry>;
  operations: Record<string, { digest: string; actorUid: string; target: string; at: string }>;
  history: Record<string, Record<string, FinanceHistoryItem>>;
}
export function emptyFinanceLedger(year: number): FinanceLedger {
  return { schemaVersion: 1, year, openingBalance: 0, openingRevision: 0, entries: {}, operations: {}, history: {} };
}
/** 새 전용 원장의 알 수 없는 형태는 빈 장부로 바꾸지 않는다. */
export function readFinanceLedger(value: unknown, year: number): FinanceLedger {
  if (value === null || value === undefined) return emptyFinanceLedger(year);
  try {
    const source = object(value);
    exactKeys(source, ["schemaVersion", "year", "openingBalance", "openingRevision", "entries", "operations", "history"]);
    requireValue(source.schemaVersion === 1 && source.year === year, "알 수 없는 회계 원장입니다.");
    money(source.openingBalance, true); revision(source.openingRevision);
    const entries = source.entries === undefined ? {} : object(source.entries);
    const operations = source.operations === undefined ? {} : object(source.operations);
    const history = source.history === undefined ? {} : object(source.history);
    for (const [key, raw] of Object.entries(entries)) {
      const entry = object(raw);
      exactKeys(entry, ["id", "revision", "date", "type", "category", "description", "amount", "owner", "ministry", "settlement", "receiptExemptReason", "receipts", "cancelledAt", "cancelReason", "createdAt", "updatedAt"]);
      requireValue(financeEntryId(key) === entry.id && revision(entry.revision) > 0, "거래 원장을 확인해 주세요.");
      entryInput(Object.fromEntries(["date", "type", "category", "description", "amount", "owner", "ministry", "settlement", "receiptExemptReason"].map((field) => [field, entry[field]])), year);
      requireValue(typeof entry.createdAt === "string" && typeof entry.updatedAt === "string" && (entry.cancelledAt === null || entry.cancelledAt === undefined || typeof entry.cancelledAt === "string") && typeof entry.cancelReason === "string", "거래 원장을 확인해 주세요.");
      const receipts = entry.receipts === undefined ? [] : entry.receipts;
      requireValue(Array.isArray(receipts) && receipts.length <= 3, "증빙 원장을 확인해 주세요.");
      requireValue(new Set(receipts.map((receipt) => object(receipt).id)).size === receipts.length, "중복된 증빙 원장입니다.");
      for (const receipt of receipts) {
        const item = object(receipt);
        exactKeys(item, ["id", "name", "mimeType", "size", "createdAt"]);
        financeReceiptId(item.id); text(item.name, 120);
        requireValue(["image/jpeg", "image/png", "application/pdf"].includes(String(item.mimeType)) && Number.isSafeInteger(item.size) && (item.size as number) > 0 && (item.size as number) <= MAX_RECEIPT_BYTES && typeof item.createdAt === "string", "증빙 원장을 확인해 주세요.");
      }
    }
    for (const [key, raw] of Object.entries(operations)) {
      const operation = object(raw);
      exactKeys(operation, ["digest", "actorUid", "target", "at"]);
      requireValue(UUID.test(key) && typeof operation.digest === "string" && /^[0-9a-f]{64}$/.test(operation.digest) && typeof operation.actorUid === "string" && typeof operation.target === "string" && typeof operation.at === "string", "작업 원장을 확인해 주세요.");
      if (operation.target !== "opening") financeEntryId(operation.target);
    }
    const normalizedHistory: FinanceLedger["history"] = {};
    for (const [target, versions] of Object.entries(history)) {
      if (target !== "opening") financeEntryId(target);
      normalizedHistory[target] = {};
      for (const [key, raw] of Object.entries(object(versions))) {
        const audit = object(raw);
        requireValue(UUID.test(key) && audit.operationId === key && ["entry.save", "entry.cancel", "opening.save", "receipt.add"].includes(String(audit.kind)) && typeof audit.actorUid === "string" && typeof audit.actorName === "string" && typeof audit.at === "string", "변경 이력을 확인해 주세요.");
        const normalizeVersion = (version: unknown) => {
          if (version === null || version === undefined) return null;
          if (target === "opening") return money(version, true);
          const entry = object(version);
          requireValue(entry.id === target && revision(entry.revision) > 0, "변경 이력을 확인해 주세요.");
          return { ...entry, receipts: entry.receipts ?? [], cancelledAt: entry.cancelledAt ?? null } as unknown as FinanceEntry;
        };
        const after = normalizeVersion(audit.after);
        requireValue(after !== null, "변경 후 이력이 없습니다.");
        normalizedHistory[target][key] = { ...audit, before: normalizeVersion(audit.before), after } as unknown as FinanceHistoryItem;
      }
    }
    // 빈 배열·null은 RTDB에서 생략되므로 응답 경계에서만 복원한다.
    return { ...source, entries: Object.fromEntries(Object.entries(entries).map(([key, raw]) => [key, { ...(raw as FinanceEntry), receipts: (raw as FinanceEntry).receipts ?? [], cancelledAt: (raw as FinanceEntry).cancelledAt ?? null }])), operations, history: normalizedHistory } as FinanceLedger;
  } catch {
    throw new FinanceError(409, "현재 회계 원장 형식을 확인해야 합니다. 기존 기록을 변경하지 않았습니다.", "unknown_schema");
  }
}
export function financeView(ledger: FinanceLedger): FinanceView {
  return { year: ledger.year, openingBalance: ledger.openingBalance, openingRevision: ledger.openingRevision, entries: Object.values(ledger.entries).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)), canEdit: true };
}
export function financeSummary(entries: FinanceEntry[], openingBalance: number) {
  const active = entries.filter((entry) => !entry.cancelledAt);
  const income = active.filter((entry) => entry.type === "income").reduce((sum, entry) => sum + entry.amount, 0);
  const expense = active.filter((entry) => entry.type === "expense").reduce((sum, entry) => sum + entry.amount, 0);
  return { income, expense, balance: openingBalance + income - expense, pending: active.filter((entry) => entry.settlement === "pending").length, missingEvidence: active.filter((entry) => entry.type === "expense" && !entry.receipts.length && !entry.receiptExemptReason).length };
}
export function applyFinanceCommand(ledger: FinanceLedger, command: FinanceCommand, actor: { uid: string; name?: string }, at: string, digest: string, receipt?: FinanceReceipt): FinanceLedger {
  const previousOperation = ledger.operations[command.operationId];
  if (previousOperation) {
    requireValue(previousOperation.digest === digest && previousOperation.actorUid === actor.uid, "이미 사용된 작업 번호입니다. 최신 장부를 불러와 주세요.", "operation_conflict", 409);
    return ledger;
  }
  const next = structuredClone(ledger);
  let before: FinanceEntry | number | null;
  let after: FinanceEntry | number;
  let target: string;
  if (command.kind === "opening.save") {
    requireValue(command.expectedRevision === ledger.openingRevision, "이월금이 변경되었습니다. 최신 장부를 확인해 주세요.", "revision_conflict", 409);
    before = ledger.openingBalance; after = command.amount; target = "opening";
    next.openingBalance = command.amount; next.openingRevision++;
  } else {
    target = command.kind === "entry.save" ? command.entryId ?? `entry_${command.operationId}` : command.entryId;
    const current = ledger.entries[target];
    requireValue(command.expectedRevision === (current?.revision ?? 0), "다른 사용자가 이 거래를 수정했습니다. 최신 장부를 확인해 주세요.", "revision_conflict", 409);
    requireValue(!current?.cancelledAt, "취소된 거래는 변경할 수 없습니다.", "cancelled_entry", 409);
    before = current ?? null;
    if (command.kind === "entry.save") {
      requireValue(!command.entryId || current, "수정할 거래가 없습니다.", "not_found", 404);
      after = { ...command.entry, id: target, revision: (current?.revision ?? 0) + 1, receipts: current?.receipts ?? [], cancelledAt: null, cancelReason: "", createdAt: current?.createdAt ?? at, updatedAt: at };
    } else {
      requireValue(current, "거래가 없습니다.", "not_found", 404);
      if (command.kind === "entry.cancel") after = { ...current, revision: current.revision + 1, cancelledAt: at, cancelReason: command.reason, updatedAt: at };
      else {
        requireValue(receipt && current.receipts.length < 3, "증빙은 거래당 3개까지 첨부할 수 있습니다.", "receipt_limit", 409);
        after = { ...current, revision: current.revision + 1, receipts: [...current.receipts, receipt], updatedAt: at };
      }
    }
    next.entries[target] = after;
  }
  next.operations[command.operationId] = { digest, actorUid: actor.uid, target, at };
  next.history[target] = { ...next.history[target], [command.operationId]: { operationId: command.operationId, kind: command.kind, actorUid: actor.uid, actorName: actor.name ?? "담당자", at, before, after } };
  const totals = financeSummary(Object.values(next.entries), next.openingBalance);
  requireValue([totals.income, totals.expense, totals.balance].every(Number.isSafeInteger), "연간 집계 금액의 허용 범위를 초과했습니다.", "amount_limit", 409);
  return next;
}
