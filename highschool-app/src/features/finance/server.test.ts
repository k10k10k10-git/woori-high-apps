import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), verify: vi.fn(), get: vi.fn(), transaction: vi.fn(), values: new Map<string, unknown>() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/praise/server/supabaseAdmin", async (original) => ({ ...await original<typeof import("@/features/praise/server/supabaseAdmin")>(), getPraiseAdmin: mocks.admin }));
import { authenticateFinanceRequest, executeFinance, financeHttp, financeJson, getFinance, getFinanceHistory, getFinanceReceipt } from "./server";
import { GET, POST } from "@/app/api/finance/[year]/route";
import { GET as RECEIPT } from "@/app/api/finance/[year]/receipts/[entryId]/[receiptId]/route";
import type { PraiseActor } from "@/features/praise/types";
import type { FinanceCommand, FinanceEntryInput } from "./types";
const first = "10000000-0000-4000-8000-000000000001";
const second = "10000000-0000-4000-8000-000000000002";
const third = "10000000-0000-4000-8000-000000000003";
const entryId = `entry_${first}`;
const receiptId = `receipt_${second}`;
const ledgerPath = "financePrivate/2026/ledger";
const actor: PraiseActor = { uid: "synthetic-admin", name: "합성 행정팀", roles: { semester: "adminTeam", retreat: "none" }, teamMemberships: {} };
const entry: FinanceEntryInput = { date: "2026-10-22", type: "expense", category: "주일", description: "합성 지출", amount: 12000, owner: "합성 담당자", ministry: "행정팀", settlement: "pending", receiptExemptReason: "" };
const save = (): FinanceCommand => ({ kind: "entry.save", operationId: first, expectedRevision: 0, entry });
const upload = (): FinanceCommand => ({ kind: "receipt.add", operationId: second, entryId, expectedRevision: 1, file: { name: "증빙.pdf", mimeType: "application/pdf", base64: Buffer.from("%PDF-1.4\nsynthetic").toString("base64") } });
function request(body?: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.test/api/finance/2026", { method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer synthetic-token", "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const context = { params: Promise.resolve({ year: "2026" }) };
const read = (path: string) => structuredClone(mocks.values.get(path) ?? null);
beforeEach(() => {
  vi.resetAllMocks(); mocks.values.clear();
  mocks.verify.mockResolvedValue({ uid: actor.uid, name: actor.name, email: null, supabaseId: "sb-admin", anonymous: false, disabled: false });
  mocks.values.set(`retreatAdmins/${actor.uid}`, { semesterRole: "adminTeam", retreatRole: "none" });
  mocks.get.mockImplementation(async (path: string) => read(path));
  mocks.transaction.mockImplementation(async (path: string, updater: (value: unknown) => unknown) => {
    const value = updater(read(path));
    if (value !== undefined) mocks.values.set(path, structuredClone(value));
    return { committed: value !== undefined, value: read(path) };
  });
  mocks.admin.mockReturnValue({ auth: { verifyAccessToken: mocks.verify }, database: { get: mocks.get, transaction: mocks.transaction } });
});
afterEach(() => vi.useRealTimers());
describe("회계 서버의 권한·조회 경계", () => {
  it("로그인하지 않은 요청과 폐기된 토큰을 원장 조회 전에 거절한다", async () => {
    const denied = await GET(new Request("https://example.test/api/finance/2026"), context);
    expect(denied.status).toBe(401); expect(mocks.get).not.toHaveBeenCalled();
    mocks.verify.mockRejectedValue({ code: "invalid_token" });
    expect((await POST(request(save()), context)).status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.verify).toHaveBeenCalledWith("synthetic-token");
  });
  it.each(["staff", "leader", "barnabas", "worship", "praise", "media", "design", "none"])("중앙 학기 권한이 아닌 %s는 조회·수정·증빙을 모두 거절한다", async (role) => {
    mocks.values.set(`retreatAdmins/${actor.uid}`, { semesterRole: role, retreatRole: "adminTeam" });
    expect((await GET(request(), context)).status).toBe(403);
    expect((await POST(request(save()), context)).status).toBe(403);
    expect((await RECEIPT(request(), { params: Promise.resolve({ year: "2026", entryId, receiptId }) })).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.get.mock.calls.some(([path]) => path.startsWith("financePrivate/"))).toBe(false);
  });
  it.each(["superAdmin", "pastor", "adminTeam"])("현재 학기 %s만 빈 연도를 조회하며 조회로 기록을 만들지 않는다", async (role) => {
    if (role === "superAdmin") mocks.values.set(`admins/${actor.uid}`, true);
    else mocks.values.set(`retreatAdmins/${actor.uid}`, { semesterRole: role, retreatRole: "none" });
    const response = await GET(request(), context);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ year: 2026, entries: [], openingBalance: 0 });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.values.has(ledgerPath)).toBe(false);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("클라이언트 주장의 역할을 쓰지 않고 다음 요청의 회수 상태를 검사한다", async () => {
    expect((await authenticateFinanceRequest(request())).roles.semester).toBe("adminTeam");
    mocks.values.clear();
    expect((await GET(request(), context)).status).toBe(403);
  });
  it("역할 조회·DB 장애는 빈 장부 성공으로 바꾸거나 내부 정보를 노출하지 않는다", async () => {
    mocks.get.mockRejectedValue(new Error("synthetic-private-credential"));
    const response = await GET(request(), context);
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("synthetic-private");
  });
  it("잘못된 JSON·교차 출처·추가 필드는 저장 전에 거절한다", async () => {
    await expect(financeJson(request(save(), { origin: "https://other.test" }), 2026)).rejects.toMatchObject({ status: 403 });
    expect((await POST(request({ ...save(), roles: { semester: "superAdmin" } }), context)).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
describe("회계 원장 저장·보존", () => {
  it("거래·멱등 표식·전후 이력을 한 전용 연도 transaction에 기록한다", async () => {
    const view = await executeFinance(actor, 2026, save());
    expect(view.entries).toHaveLength(1); expect(view.entries[0]).toMatchObject({ id: entryId, revision: 1, amount: 12000 });
    const ledger = mocks.values.get(ledgerPath) as { operations: Record<string, unknown>; history: Record<string, Record<string, unknown>> };
    expect(ledger.operations[first]).toBeDefined(); expect(ledger.history[entryId][first]).toMatchObject({ before: null, after: { amount: 12000 } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1); expect(mocks.transaction.mock.calls[0][0]).toBe(ledgerPath);
    expect([...mocks.get.mock.calls, ...mocks.transaction.mock.calls].every(([path]) => path.startsWith("financePrivate/"))).toBe(true);
  });
  it("재전송은 추가 쓰기 없이 같은 거래를 반환하고 작업 번호 재사용은 거절한다", async () => {
    await executeFinance(actor, 2026, save()); mocks.transaction.mockClear();
    expect((await executeFinance(actor, 2026, save())).entries).toHaveLength(1);
    expect(mocks.transaction).not.toHaveBeenCalled();
    await expect(executeFinance(actor, 2026, { ...save(), entry: { ...entry, amount: 13000 } })).rejects.toMatchObject({ status: 409, code: "operation_conflict" });
  });
  it("동시 수정이 transaction 중 도착하면 원래 값과 audit을 보존한다", async () => {
    await executeFinance(actor, 2026, save());
    mocks.transaction.mockImplementationOnce(async (path, updater) => {
      const concurrent = structuredClone(mocks.values.get(path)) as { entries: Record<string, { revision: number; amount: number }> };
      concurrent.entries[entryId].revision = 2; concurrent.entries[entryId].amount = 15000;
      mocks.values.set(path, concurrent);
      const result = updater(concurrent);
      expect(result).toBeUndefined();
      return { committed: false, value: read(path) };
    });
    await expect(executeFinance(actor, 2026, { kind: "entry.cancel", operationId: second, entryId, expectedRevision: 1, reason: "중복" })).rejects.toMatchObject({ status: 409, code: "revision_conflict" });
    expect((await getFinance(actor, 2026)).entries[0]).toMatchObject({ amount: 15000, cancelledAt: null });
    expect(await getFinanceHistory(actor, 2026, entryId)).toHaveLength(1);
  });
  it("알 수 없는 기존 원장을 덮지 않고 원장·증빙 어느 것도 쓰지 않는다", async () => {
    const unknown = { schemaVersion: 99, imported: "preserve" }; mocks.values.set(ledgerPath, unknown);
    await expect(executeFinance(actor, 2026, save())).rejects.toMatchObject({ status: 409, code: "unknown_schema" });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.values.get(ledgerPath)).toEqual(unknown);
  });
  it("거래 취소 후 원본·증빙·모든 변경 이력을 계속 조회할 수 있다", async () => {
    await executeFinance(actor, 2026, save());
    await executeFinance(actor, 2026, upload());
    await executeFinance(actor, 2026, { kind: "entry.cancel", operationId: third, entryId, expectedRevision: 2, reason: "중복 입력" });
    const view = await getFinance(actor, 2026); expect(view.entries[0]).toMatchObject({ amount: 12000, cancelReason: "중복 입력", revision: 3 });
    expect(view.entries[0].receipts).toHaveLength(1); expect(await getFinanceHistory(actor, 2026, entryId)).toHaveLength(3);
    expect((await getFinanceReceipt(actor, 2026, entryId, receiptId)).status).toBe(200);
  });
});
describe("비공개 증빙", () => {
  it("파일은 전용 별도 경로에 보관하고 허용된 거래 연결로만 내려받는다", async () => {
    await executeFinance(actor, 2026, save());
    const view = await executeFinance(actor, 2026, upload());
    expect(JSON.stringify(view)).not.toContain("base64");
    expect(mocks.values.has(`financePrivate/2026/files/${receiptId}`)).toBe(true);
    const file = await getFinanceReceipt(actor, 2026, entryId, receiptId);
    expect(file.headers.get("content-type")).toBe("application/pdf");
    expect(file.headers.get("content-disposition")).toContain("attachment;"); expect(file.headers.get("cache-control")).toContain("no-store");
    expect(await file.text()).toBe("%PDF-1.4\nsynthetic");
    await expect(getFinanceReceipt(actor, 2026, `entry_${third}`, receiptId)).rejects.toMatchObject({ status: 404 });
  });
  it.each(["text/plain", "image/svg+xml"])("허용하지 않는 MIME %s는 파일 쓰기 전에 거절한다", async (mimeType) => {
    await expect(executeFinance(actor, 2026, { ...upload(), file: { ...(upload() as Extract<FinanceCommand, { kind: "receipt.add" }>).file, mimeType } })).rejects.toMatchObject({ status: 400 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it("MIME 위장·잘못된 base64·초과 파일은 쓰지 않는다", async () => {
    for (const file of [
      { name: "wrong.jpg", mimeType: "image/jpeg", base64: Buffer.from("<script>synthetic</script>").toString("base64") },
      { name: "wrong.pdf", mimeType: "application/pdf", base64: "%%%" },
      { name: "large.pdf", mimeType: "application/pdf", base64: Buffer.alloc(512 * 1024 + 1).toString("base64") },
    ]) await expect(executeFinance(actor, 2026, { ...upload(), file })).rejects.toMatchObject({ status: 400 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0, 0, 0]],
    ["image/png", [137, 80, 78, 71, 13, 10, 26, 10]],
  ] as const)("정상 %s magic은 허용하며 같은 첨부 재전송은 중복되지 않는다", async (mimeType, bytes) => {
    await executeFinance(actor, 2026, save());
    const command = { ...upload(), file: { name: "합성 증빙", mimeType, base64: Buffer.from(bytes).toString("base64") } };
    const view = await executeFinance(actor, 2026, command);
    const operations = mocks.transaction.mock.calls.length;
    const replay = await executeFinance(actor, 2026, command);
    expect(replay).toEqual(view); expect(mocks.transaction).toHaveBeenCalledTimes(operations);
    expect(replay.entries[0].receipts).toHaveLength(1);
  });
  it("네 번째 증빙은 파일 생성 전에 차단하고 기존 세 개를 보존한다", async () => {
    await executeFinance(actor, 2026, save());
    for (let index = 2; index <= 4; index++) {
      await executeFinance(actor, 2026, { ...upload(), operationId: `10000000-0000-4000-8000-00000000000${index}`, expectedRevision: index - 1 });
    }
    const before = mocks.transaction.mock.calls.length;
    await expect(executeFinance(actor, 2026, { ...upload(), operationId: "10000000-0000-4000-8000-000000000005", expectedRevision: 4 })).rejects.toMatchObject({ status: 409, code: "receipt_limit" });
    expect(mocks.transaction).toHaveBeenCalledTimes(before);
    expect((await getFinance(actor, 2026)).entries[0].receipts).toHaveLength(3);
  });
  it("최초 연결 실패는 저장하지 않고 그대로 알린다", async () => {
    mocks.transaction.mockRejectedValueOnce(new Error("synthetic connection failure"));
    await expect(executeFinance(actor, 2026, save())).rejects.toThrow("synthetic connection failure");
    expect(mocks.values.has(ledgerPath)).toBe(false);
  });
  it("응답 없는 저장은 10초 뒤 연결 오류로 끝내고 성공으로 표시하지 않는다", async () => {
    vi.useFakeTimers();
    mocks.transaction.mockImplementationOnce(() => new Promise(() => {}));
    const pending = expect(executeFinance(actor, 2026, save())).rejects.toMatchObject({ status: 503, code: "unavailable" });
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
  });
  it("파일 저장 뒤 원장 충돌은 원장을 보존하고 안전한 미연결 파일만 남긴다", async () => {
    await executeFinance(actor, 2026, save());
    const standardTransaction = mocks.transaction.getMockImplementation()!;
    mocks.transaction.mockImplementation(async (path, updater) => {
      if (path === ledgerPath) {
        const concurrent = structuredClone(mocks.values.get(path)) as { entries: Record<string, { revision: number }> };
        concurrent.entries[entryId].revision = 2; mocks.values.set(path, concurrent);
      }
      return standardTransaction(path, updater);
    });
    await expect(executeFinance(actor, 2026, upload())).rejects.toMatchObject({ code: "revision_conflict" });
    expect(mocks.values.has(`financePrivate/2026/files/${receiptId}`)).toBe(true);
    expect((await getFinance(actor, 2026)).entries[0].receipts).toEqual([]);
    await expect(getFinanceReceipt(actor, 2026, entryId, receiptId)).rejects.toMatchObject({ status: 404 });
  });
  it("파일 변조·SDK 내부 오류는 원문을 노출하지 않는다", async () => {
    await executeFinance(actor, 2026, save()); await executeFinance(actor, 2026, upload());
    const filePath = `financePrivate/2026/files/${receiptId}`;
    mocks.values.set(filePath, { ...(mocks.values.get(filePath) as object), base64: "dGFtcGVy" });
    await expect(getFinanceReceipt(actor, 2026, entryId, receiptId)).rejects.toMatchObject({ status: 503 });
    const response = await financeHttp(async () => { throw new Error("synthetic-secret-key"); });
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("synthetic-secret");
  });
});
