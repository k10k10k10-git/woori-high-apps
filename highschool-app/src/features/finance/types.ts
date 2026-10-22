export type FinanceEntryType = "income" | "expense";
export type FinanceSettlement = "pending" | "settled";
export interface FinanceReceipt {
  id: string;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  size: number;
  createdAt: string;
}
export interface FinanceEntryInput {
  date: string;
  type: FinanceEntryType;
  category: string;
  description: string;
  amount: number;
  owner: string;
  ministry: string;
  settlement: FinanceSettlement;
  receiptExemptReason: string;
}
export interface FinanceEntry extends FinanceEntryInput {
  id: string;
  revision: number;
  receipts: FinanceReceipt[];
  cancelledAt: string | null;
  cancelReason: string;
  createdAt: string;
  updatedAt: string;
}
export interface FinanceView {
  year: number;
  openingBalance: number;
  openingRevision: number;
  entries: FinanceEntry[];
  canEdit: boolean;
}
export interface FinanceHistoryItem {
  operationId: string;
  kind: FinanceCommand["kind"];
  actorUid: string;
  actorName: string;
  at: string;
  before: FinanceEntry | number | null;
  after: FinanceEntry | number;
}
export type FinanceCommand = { operationId: string } & (
  | { kind: "entry.save"; entryId?: string; expectedRevision: number; entry: FinanceEntryInput }
  | { kind: "entry.cancel"; entryId: string; expectedRevision: number; reason: string }
  | { kind: "opening.save"; expectedRevision: number; amount: number }
  | { kind: "receipt.add"; entryId: string; expectedRevision: number; file: { name: string; mimeType: FinanceReceipt["mimeType"]; base64: string } }
);
