import { describe, expect, it } from "vitest";
import { applyFinanceCommand, emptyFinanceLedger, financeSummary, financeView, financeYear, parseFinanceCommand, readFinanceLedger } from "./model";
import type { FinanceCommand, FinanceEntryInput } from "./types";

const first = "10000000-0000-4000-8000-000000000001";
const second = "10000000-0000-4000-8000-000000000002";
const third = "10000000-0000-4000-8000-000000000003";
const at = "2026-10-22T10:00:00.000Z";
const actor = { uid: "synthetic-admin", name: "테스트 행정팀" };
const entry: FinanceEntryInput = { date: "2026-10-22", type: "expense", category: "행사", description: "합성 지출", amount: 12000, owner: "담당자", ministry: "수련회", settlement: "pending", receiptExemptReason: "" };
const save = (operationId = first): FinanceCommand => ({ kind: "entry.save", operationId, expectedRevision: 0, entry });
const apply = (state = emptyFinanceLedger(2026), command = save(), digest = "a".repeat(64)) => applyFinanceCommand(state, command, actor, at, digest);
// RTDB의 null·빈 배열·빈 객체 생략을 재현한다.
const stored = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.length ? value.map(stored) : undefined;
  if (value === null) return undefined;
  if (value && typeof value === "object") {
    const result = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, stored(child)]).filter(([, child]) => child !== undefined));
    return Object.keys(result).length ? result : undefined;
  }
  return value;
};
describe("연간 회계 원장", () => {
  it("없는 연도는 쓰기 계획 없는 빈 조회이며 생략된 RTDB 목록을 복원한다", () => {
    expect(financeView(readFinanceLedger(null, 2026))).toEqual({ year: 2026, openingBalance: 0, openingRevision: 0, entries: [], canEdit: true });
    const original = apply();
    const restored = readFinanceLedger(stored(original), 2026);
    expect(restored).toEqual(original);
    expect(restored.history[`entry_${first}`][first].before).toBeNull();
  });
  it("등록·수정·취소 전후 이력과 기존 거래 키를 보존한다", () => {
    const original = apply();
    const changed = apply(original, { kind: "entry.save", operationId: second, entryId: `entry_${first}`, expectedRevision: 1, entry: { ...entry, amount: 20000, settlement: "settled" } });
    const cancelled = apply(changed, { kind: "entry.cancel", operationId: third, entryId: `entry_${first}`, expectedRevision: 2, reason: "중복 등록" });
    expect(original.entries[`entry_${first}`].amount).toBe(12000);
    expect(cancelled.entries[`entry_${first}`]).toMatchObject({ amount: 20000, revision: 3, cancelReason: "중복 등록", cancelledAt: at });
    expect(cancelled.history[`entry_${first}`][second]).toMatchObject({ before: { amount: 12000 }, after: { amount: 20000 }, actorName: actor.name });
    expect(Object.keys(cancelled.history[`entry_${first}`])).toEqual([first, second, third]);
    expect(() => apply(cancelled, { kind: "entry.save", operationId: "10000000-0000-4000-8000-000000000004", entryId: `entry_${first}`, expectedRevision: 3, entry })).toThrow("취소된 거래");
  });
  it("같은 작업의 재전송은 중복 기록을 만들지 않고 다른 본문·계정은 거절한다", () => {
    const state = apply();
    expect(apply(state)).toBe(state);
    expect(() => apply(state, save(), "b".repeat(64))).toThrow("이미 사용된 작업 번호");
    expect(() => applyFinanceCommand(state, save(), { uid: "other" }, at, "a".repeat(64))).toThrow("이미 사용된 작업 번호");
  });
  it("거래와 이월금의 동시 변경은 각 revision으로 거절한다", () => {
    const state = apply();
    expect(() => apply(state, { kind: "entry.cancel", operationId: second, entryId: `entry_${first}`, expectedRevision: 0, reason: "취소" })).toThrow("다른 사용자");
    const opened = apply(state, { kind: "opening.save", operationId: second, expectedRevision: 0, amount: -5000 });
    expect(opened.openingBalance).toBe(-5000); expect(opened.openingRevision).toBe(1);
    expect(() => apply(opened, { kind: "opening.save", operationId: third, expectedRevision: 0, amount: 10 })).toThrow("이월금이 변경");
    expect(opened.history.opening[second]).toMatchObject({ before: 0, after: -5000 });
  });
  it("현금 장부 집계는 정산 전 내역도 포함하고 취소 건은 제외한다", () => {
    const expense = apply();
    const state = apply(expense, { ...save(second), entry: { ...entry, type: "income", amount: 30000, receiptExemptReason: "헌금" } } as FinanceCommand);
    expect(financeSummary(Object.values(state.entries), 1000)).toEqual({ income: 30000, expense: 12000, balance: 19000, pending: 2, missingEvidence: 1 });
    const cancelled = apply(state, { kind: "entry.cancel", operationId: third, entryId: `entry_${first}`, expectedRevision: 1, reason: "중복" });
    expect(financeSummary(Object.values(cancelled.entries), 1000)).toMatchObject({ expense: 0, balance: 31000, pending: 1, missingEvidence: 0 });
  });
  it("증빙을 붙이면서 거래 금액·기존 증빙과 이력을 보존한다", () => {
    const state = apply();
    const command: FinanceCommand = { kind: "receipt.add", operationId: second, expectedRevision: 1, entryId: `entry_${first}`, file: { name: "receipt.pdf", mimeType: "application/pdf", base64: "JVBERi0=" } };
    const receipt = { id: `receipt_${second}`, name: "receipt.pdf", mimeType: "application/pdf" as const, size: 5, createdAt: at };
    const next = applyFinanceCommand(state, command, actor, at, "b".repeat(64), receipt);
    expect(next.entries[`entry_${first}`]).toMatchObject({ amount: 12000, revision: 2, receipts: [receipt] });
    expect(financeSummary(Object.values(next.entries), 0).missingEvidence).toBe(0);
  });
  it.each([{}, { schemaVersion: 2 }, { ...emptyFinanceLedger(2026), year: 2025 }, { ...emptyFinanceLedger(2026), futureField: {} }, { ...emptyFinanceLedger(2026), history: { opening: "damaged" } }])("모르는 기존 형식은 빈 장부로 덮어쓰지 않는다", (value) => {
    expect(() => readFinanceLedger(value, 2026)).toThrow("기존 기록을 변경하지 않았습니다");
  });
});
describe("회계 입력 경계", () => {
  it.each(["../2026", 1999, 2101, "2026.0", "", null])("잘못된 연도는 거절한다", (year) => { expect(() => financeYear(year)).toThrow(); });
  it.each(["2026-02-30", "2026-13-01", "2026-00-10", "2025-12-31", "2026-10-22T00:00:00Z"]) ("잘못된 날짜는 400으로 거절한다", (date) => {
    try { parseFinanceCommand({ ...save(), entry: { ...entry, date } }, 2026); throw new Error("must reject"); } catch (error) { expect(error).toMatchObject({ status: 400 }); }
  });
  it.each([0, -1, 1.5, Number.NaN, 1_000_000_000_001, "1000"]) ("지출 금액은 양의 원 단위 정수다", (amount) => {
    expect(() => parseFinanceCommand({ ...save(), entry: { ...entry, amount } }, 2026)).toThrow();
  });
  it("경로·권한 주입, 추가 필드, 잘못된 파일·작업 ID를 거절한다", () => {
    expect(() => parseFinanceCommand({ ...save(), roles: { semester: "superAdmin" } }, 2026)).toThrow();
    expect(() => parseFinanceCommand({ ...save(), entry: { ...entry, rawSource: "비공개" } }, 2026)).toThrow();
    expect(() => parseFinanceCommand({ ...save(), entryId: "../classes" }, 2026)).toThrow();
    expect(() => parseFinanceCommand({ ...save(), operationId: "constructor" }, 2026)).toThrow();
    expect(() => parseFinanceCommand({ kind: "receipt.add", operationId: second, expectedRevision: 1, entryId: `entry_${first}`, file: { name: "../a.pdf", mimeType: "application/pdf", base64: "JVBERi0=" } }, 2026)).toThrow();
  });
});
