import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initializeApp, deleteApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getDatabase, type Database } from "firebase-admin/database";
vi.mock("server-only", () => ({}));
const holder = vi.hoisted(() => ({ database: null as Database | null, auth: null as Auth | null, app: null as App | null, admin: null as PraiseAdmin | null }));
vi.mock("@/features/praise/server/supabaseAdmin", async (original) => ({ ...await original<typeof import("@/features/praise/server/supabaseAdmin")>(), getPraiseAdmin: () => holder.admin }));
import type { PraiseAdmin } from "@/features/praise/server/supabaseAdmin";
import { firebaseEmulatorAdmin } from "@/features/praise/server/firebaseEmulatorAdmin.testkit";
import { GET, POST } from "@/app/api/finance/[year]/route";
import { GET as RECEIPT } from "@/app/api/finance/[year]/receipts/[entryId]/[receiptId]/route";
import type { FinanceEntryInput, FinanceView } from "./types";
const enabled = process.env.PRAISE_CONTRACTS === "1";
const suite = enabled ? describe : describe.skip;
const first = "10000000-0000-4000-8000-000000000001";
const second = "10000000-0000-4000-8000-000000000002";
const third = "10000000-0000-4000-8000-000000000003";
const fourth = "10000000-0000-4000-8000-000000000004";
const entryId = `entry_${first}`;
const entry: FinanceEntryInput = { date: "2026-10-22", type: "expense", category: "행정", description: "합성 에뮬레이터 지출", amount: 15000, owner: "합성 담당자", ministry: "행정팀", settlement: "pending", receiptExemptReason: "" };
const save = (operationId = first) => ({ kind: "entry.save", operationId, expectedRevision: 0, entry });
const context = { params: Promise.resolve({ year: "2026" }) };
let app: App;
let account: { idToken: string; localId: string };
async function signup(email: string) {
  const response = await fetch("http://127.0.0.1:19098/identitytoolkit.googleapis.com/v1/accounts:signUp?key=synthetic-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password: "synthetic-password-123", returnSecureToken: true }) });
  expect(response.ok).toBe(true);
  return response.json() as Promise<{ idToken: string; localId: string }>;
}
function request(body?: unknown, suffix = "") {
  return new Request(`http://localhost/api/finance/2026${suffix}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${account.idToken}`, "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function view() { const response = await GET(request(), context); expect(response.status).toBe(200); return response.json() as Promise<FinanceView>; }
suite("회계 실제 Auth·RTDB 원장 보존·Rules 계약", () => {
  beforeAll(async () => {
    if (process.env.FIREBASE_DATABASE_EMULATOR_HOST !== "127.0.0.1:19016" || process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:19098") throw new Error("합성 에뮬레이터 주소가 아닙니다.");
    app = initializeApp({ projectId: "demo-praise", databaseURL: "http://127.0.0.1:19016/?ns=demo-praise-default-rtdb", credential: { getAccessToken: async () => ({ access_token: "owner", expires_in: 3600 }) } }, "finance-contracts");
    holder.database = getDatabase(app); holder.auth = getAuth(app); holder.app = app; holder.admin = firebaseEmulatorAdmin(app);
    account = await signup("finance-contract@example.test");
    await holder.database.ref().set({ retreatAdmins: { [account.localId]: { semesterRole: "adminTeam", retreatRole: "none" } }, classes: { preserve: { value: "학적 보존" } }, attendance: { preserve: { value: "출석 보존" } }, retreats: { preserve: { value: "수련회 보존" } } });
  });
  beforeEach(async () => { await holder.database!.ref("financePrivate").remove(); });
  afterAll(async () => { if (app) await deleteApp(app); });
  it("인증된 빈 연도 조회는 원장·파일을 생성하지 않는다", async () => {
    expect(await view()).toEqual({ year: 2026, openingBalance: 0, openingRevision: 0, entries: [], canEdit: true });
    expect((await holder.database!.ref("financePrivate").get()).exists()).toBe(false);
  });
  it("등록·조회·재전송에서 RTDB null·빈 배열 생략을 복원하고 이력을 보존한다", async () => {
    const created = await POST(request(save()), context); expect(created.status).toBe(200);
    const raw = (await holder.database!.ref(`financePrivate/2026/ledger/entries/${entryId}`).get()).val();
    expect(raw.receipts).toBeUndefined(); expect(raw.cancelledAt).toBeUndefined();
    const loaded = await view(); expect(loaded.entries[0]).toMatchObject({ receipts: [], cancelledAt: null, revision: 1, amount: 15000 });
    const before = (await holder.database!.ref("financePrivate/2026").get()).val();
    expect((await POST(request(save()), context)).status).toBe(200);
    expect((await holder.database!.ref("financePrivate/2026").get()).val()).toEqual(before);
    const historyResponse = await GET(request(undefined, `?history=${entryId}`), context);
    expect(await historyResponse.json()).toMatchObject([{ before: null, after: { receipts: [], cancelledAt: null, amount: 15000 } }]);
  });
  it("서로 다른 거래의 동시 저장은 보존하고 같은 거래의 오래된 버전은 거절한다", async () => {
    const separate = await Promise.all([POST(request(save()), context), POST(request(save(second)), context)]);
    expect(separate.map((response) => response.status)).toEqual([200, 200]); expect((await view()).entries).toHaveLength(2);
    const concurrent = await Promise.all([
      POST(request({ kind: "entry.save", operationId: third, entryId, expectedRevision: 1, entry: { ...entry, amount: 17000 } }), context),
      POST(request({ kind: "entry.cancel", operationId: fourth, entryId, expectedRevision: 1, reason: "합성 취소" }), context),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([200, 409]);
    expect((await view()).entries.find((item) => item.id === entryId)?.revision).toBe(2);
  });
  it("증빙 분리·실제 다운로드와 취소 이력을 보존한다", async () => {
    expect((await POST(request(save()), context)).status).toBe(200);
    const content = "%PDF-1.4\nsynthetic-finance";
    const attachment = { kind: "receipt.add", operationId: second, entryId, expectedRevision: 1, file: { name: "합성 영수증.pdf", mimeType: "application/pdf", base64: Buffer.from(content).toString("base64") } };
    expect((await POST(request(attachment), context)).status).toBe(200);
    const loaded = await view(); expect(loaded.entries[0].receipts).toHaveLength(1); expect(JSON.stringify(loaded)).not.toContain("base64");
    const receiptId = `receipt_${second}`;
    const receipt = await RECEIPT(request(), { params: Promise.resolve({ year: "2026", entryId, receiptId }) });
    expect(receipt.status).toBe(200); expect(await receipt.text()).toBe(content);
    expect((await POST(request({ kind: "entry.cancel", operationId: third, entryId, expectedRevision: 2, reason: "합성 정정" }), context)).status).toBe(200);
    expect((await view()).entries[0]).toMatchObject({ amount: 15000, cancelReason: "합성 정정", revision: 3 });
    expect((await holder.database!.ref(`financePrivate/2026/files/${receiptId}`).get()).exists()).toBe(true);
    expect(Object.keys((await holder.database!.ref(`financePrivate/2026/ledger/history/${entryId}`).get()).val())).toHaveLength(3);
  });
  it("일반·행정·통합관리자 클라이언트는 전용 경로를 직접 읽거나 쓸 수 없다", async () => {
    const ordinary = await signup("finance-ordinary@example.test");
    const platform = await signup("finance-platform@example.test");
    await holder.database!.ref(`admins/${platform.localId}`).set(true);
    for (const token of [null, ordinary.idToken, account.idToken, platform.idToken]) for (const path of ["financePrivate/2026/ledger", "financePrivate/2026/files/receipt"]) for (const method of ["GET", "PUT"]) {
      const url = new URL(`http://127.0.0.1:19016/${path}.json`); url.searchParams.set("ns", "demo-praise-default-rtdb"); if (token) url.searchParams.set("auth", token);
      const response = await fetch(url, { method, ...(method === "PUT" ? { body: JSON.stringify({ synthetic: true }) } : {}) });
      expect(response.status).toBe(401);
    }
    const ordinaryRequest = new Request("http://localhost/api/finance/2026", { headers: { Authorization: `Bearer ${ordinary.idToken}` } });
    expect((await GET(ordinaryRequest, context)).status).toBe(403);
  });
  it("다른 원장을 변경하지 않고 권한 회수를 다음 요청부터 반영한다", async () => {
    expect((await POST(request(save()), context)).status).toBe(200);
    for (const [path, value] of [["classes", "학적 보존"], ["attendance", "출석 보존"], ["retreats", "수련회 보존"]]) expect((await holder.database!.ref(`${path}/preserve/value`).get()).val()).toBe(value);
    await holder.database!.ref(`retreatAdmins/${account.localId}`).remove();
    expect((await GET(request(), context)).status).toBe(403);
    expect((await POST(request(save(second)), context)).status).toBe(403);
  });
});
