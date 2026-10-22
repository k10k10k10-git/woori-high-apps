/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FinanceEntry, FinanceView } from "./types";

const mocks = vi.hoisted(() => ({ user: { uid: "finance-test-user", displayName: "행정 담당" } as { uid: string; displayName: string } | null, read: vi.fn(), mutate: vi.fn(), history: vi.fn(), download: vi.fn(), toast: vi.fn(), confirm: vi.fn(), writeFile: vi.fn(), loadXlsx: vi.fn(), sheets: [] as Record<string, { v: string | number; t: string; f?: string }>[] }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: mocks.user, memberName: "행정 담당" }) }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mocks.toast, uiConfirm: mocks.confirm }) }));
vi.mock("./client", () => ({ readFinance: mocks.read, mutateFinance: mocks.mutate, readFinanceHistory: mocks.history, downloadFinanceReceipt: mocks.download, FinanceApiError: class extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } } }));
vi.mock("@/lib/exportUtils", () => ({ loadXlsx: mocks.loadXlsx }));
import AnnualFinanceTab from "./AnnualFinanceTab";
import { FinanceApiError } from "./client";

function entry(overrides: Partial<FinanceEntry> = {}): FinanceEntry {
  return { id: "entry_11111111-1111-4111-8111-111111111111", revision: 1, date: "2026-10-18", type: "expense", category: "간식", description: "주일 간식 구입", amount: 30000, owner: "행정 담당", ministry: "주일", settlement: "pending", receiptExemptReason: "", receipts: [], cancelledAt: null, cancelReason: "", createdAt: "2026-10-18T01:00:00Z", updatedAt: "2026-10-18T01:00:00Z", ...overrides };
}
function view(overrides: Partial<FinanceView> = {}): FinanceView {
  return { year: 2026, openingBalance: 100000, openingRevision: 0, canEdit: true, entries: [entry(), entry({ id: "entry_22222222-2222-4222-8222-222222222222", description: "주일 헌금", type: "income", category: "헌금", amount: 50000, settlement: "settled" }), entry({ id: "entry_33333333-3333-4333-8333-333333333333", description: "취소된 교재", amount: 10000, cancelledAt: "2026-10-19T01:00:00Z", cancelReason: "중복 입력" })], ...overrides };
}
async function open() { render(<AnnualFinanceTab year={2026} />); await screen.findByRole("heading", { name: "연간 회계" }); }
function fillEntry() {
  fireEvent.click(screen.getByRole("button", { name: "거래 등록" }));
  fireEvent.change(screen.getByLabelText("거래 내용"), { target: { value: "성경 교재" } });
  fireEvent.change(screen.getByLabelText("금액 (원)"), { target: { value: "12000" } });
  fireEvent.change(screen.getByLabelText("분류", { selector: "input" }), { target: { value: "교재" } });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.user = { uid: "finance-test-user", displayName: "행정 담당" };
  mocks.sheets = [];
  mocks.loadXlsx.mockResolvedValue({ utils: { aoa_to_sheet: (rows: (string | number)[][]) => { const sheet = Object.fromEntries(rows.flatMap((row, index) => row.map((value, column) => [`${column}:${index}`, { v: value, t: typeof value === "string" ? "s" : "n", ...(typeof value === "string" && value.startsWith("=") ? { f: value } : {}) }]))); mocks.sheets.push(sheet); return sheet; }, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: mocks.writeFile });
  mocks.read.mockResolvedValue(view()); mocks.history.mockResolvedValue([]); mocks.confirm.mockResolvedValue(true); mocks.mutate.mockResolvedValue(view());
});
afterEach(cleanup);

it("최초 조회는 기록을 생성하지 않고 취소 거래를 제외해 연간 잔액을 표시한다", async () => {
  await open();
  expect(mocks.read).toHaveBeenCalledWith(2026, expect.any(AbortSignal));
  const balance = screen.getByText("장부 잔액").closest("div")!;
  expect(within(balance).getByText("120,000원")).toBeInTheDocument();
  expect(screen.queryByText("취소된 교재")).not.toBeInTheDocument();
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("상태"), { target: { value: "cancelled" } });
  expect(screen.getAllByText("취소된 교재")).toHaveLength(2);
  expect(screen.queryByText("주일 간식 구입")).not.toBeInTheDocument();
});

it("정산 대기와 증빙 필요가 실제 거래 필터로 연결된다", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "증빙 필요 1건" }));
  expect(screen.getByLabelText("상태")).toHaveValue("missing");
  expect(screen.getAllByText("주일 간식 구입")).toHaveLength(2);
  expect(screen.queryByText("주일 헌금")).not.toBeInTheDocument();
});

it("저장 요청은 선택 연도와 거래 항목을 보내며 실패한 동일 요청은 같은 작업 번호로 확인한다", async () => {
  mocks.mutate.mockRejectedValueOnce(new Error("연결이 끊겼습니다.")).mockResolvedValueOnce(view());
  const busy = vi.fn(); render(<AnnualFinanceTab year={2026} onBusyChange={busy} />); await screen.findByRole("heading", { name: "연간 회계" }); fillEntry();
  fireEvent.click(screen.getByRole("button", { name: "거래 저장" }));
  await screen.findByText("연결이 끊겼습니다.");
  const first = mocks.mutate.mock.calls[0];
  expect(first[0]).toBe(2026);
  expect(first[1]).toEqual(expect.objectContaining({ kind: "entry.save", expectedRevision: 0, operationId: expect.any(String), entry: expect.objectContaining({ description: "성경 교재", amount: 12000, category: "교재", owner: "행정 담당" }) }));
  // 응답을 잃으면 입력·닫기·상위 이동을 잠그고 첫 초안을 그대로 보존한다.
  expect(screen.getByLabelText("금액 (원)")).toBeDisabled();
  expect(screen.getByLabelText("금액 (원)")).toHaveValue(12000);
  expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "새로고침" })).toBeDisabled();
  expect(busy).toHaveBeenLastCalledWith(true);
  const leave = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(leave);
  expect(leave.defaultPrevented).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "거래 저장" }));
  expect(mocks.mutate).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "저장 결과 확인" }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
  expect(mocks.mutate.mock.calls[1]).toEqual(first);
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(busy).toHaveBeenLastCalledWith(false);
});

it("미확정 저장의 재확인 중 권한 오류가 나도 작업 번호와 잠금을 유지한다", async () => {
  mocks.mutate.mockRejectedValueOnce(new Error("응답 유실")).mockRejectedValueOnce(new FinanceApiError("다시 로그인해야 합니다.", 401)).mockResolvedValueOnce(view());
  const busy = vi.fn(); render(<AnnualFinanceTab year={2026} onBusyChange={busy} />); await screen.findByRole("heading", { name: "연간 회계" }); fillEntry();
  fireEvent.click(screen.getByRole("button", { name: "거래 저장" })); await screen.findByText("응답 유실");
  const original = mocks.mutate.mock.calls[0];
  fireEvent.click(screen.getByRole("button", { name: "저장 결과 확인" })); await screen.findByText("다시 로그인해야 합니다.");
  expect(screen.getByLabelText("금액 (원)")).toBeDisabled(); expect(busy).toHaveBeenLastCalledWith(true);
  fireEvent.click(screen.getByRole("button", { name: "저장 결과 확인" }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(3));
  expect(mocks.mutate.mock.calls[1]).toEqual(original); expect(mocks.mutate.mock.calls[2]).toEqual(original);
});

it("미확정 저장 중 상단 내부 링크와 뒤로가기를 막고 동일 작업의 복구를 유지한다", async () => {
  window.history.replaceState({ finance: "current" }, "", "/teams/admin/ongoing?tab=finance");
  const href = window.location.href;
  mocks.mutate.mockRejectedValueOnce(new Error("저장 응답 유실")).mockResolvedValueOnce(view());
  await open(); fillEntry(); fireEvent.click(screen.getByRole("button", { name: "거래 저장" }));
  await screen.findByText("저장 응답 유실");
  const original = mocks.mutate.mock.calls[0];
  const anchor = document.createElement("a"); anchor.href = "/teams/praise/ongoing"; anchor.textContent = "찬양팀으로 이동"; document.body.appendChild(anchor);
  const click = new MouseEvent("click", { bubbles: true, cancelable: true });
  act(() => { anchor.dispatchEvent(click); });
  expect(click.defaultPrevented).toBe(true);
  expect(mocks.toast).toHaveBeenCalledWith("저장 결과를 확인한 뒤 화면을 이동할 수 있습니다.", "warning");
  const nextListener = vi.fn(); window.addEventListener("popstate", nextListener);
  act(() => { window.history.replaceState({ previous: true }, "", "/teams/praise/ongoing"); window.dispatchEvent(new PopStateEvent("popstate", { state: { previous: true } })); });
  expect(window.location.href).toBe(href); expect(window.history.state).toEqual({ finance: "current" }); expect(nextListener).not.toHaveBeenCalled();
  expect(screen.getByLabelText("금액 (원)")).toHaveValue(12000);
  fireEvent.click(screen.getByRole("button", { name: "저장 결과 확인" }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(2));
  expect(mocks.mutate.mock.calls[1]).toEqual(original);
  anchor.remove(); window.removeEventListener("popstate", nextListener);
});

it("조회 실패를 빈 장부로 표시하지 않고 재조회할 수 있다", async () => {
  mocks.read.mockRejectedValueOnce(new Error("회계 조회 권한이 없습니다.")).mockResolvedValueOnce(view());
  render(<AnnualFinanceTab year={2026} />);
  await screen.findByRole("alert");
  expect(screen.queryByText("등록된 거래가 없습니다.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  await screen.findByRole("heading", { name: "연간 회계" });
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it("거래 취소는 사유와 확인을 요구하고 기존 거래 ID와 버전을 유지한다", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "주일 간식 구입 상세 보기" }));
  fireEvent.click(screen.getByRole("button", { name: "거래 취소" }));
  fireEvent.change(screen.getByLabelText("취소 사유"), { target: { value: "중복 입력 확인" } });
  mocks.confirm.mockResolvedValueOnce(false);
  fireEvent.click(screen.getByRole("button", { name: "취소 사유를 남기고 거래 취소" }));
  await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "취소 사유를 남기고 거래 취소" }));
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
  expect(mocks.mutate.mock.calls[0]).toEqual([2026, expect.objectContaining({ kind: "entry.cancel", entryId: entry().id, expectedRevision: 1, reason: "중복 입력 확인" })]);
});

it("증빙이 허용 크기를 넘는 PDF이면 원장을 변경하지 않는다", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "주일 간식 구입 상세 보기" }));
  const file = new File([new Uint8Array(513 * 1024)], "증빙.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText(/영수증 첨부/), { target: { files: [file] } });
  await screen.findByText("PDF는 512KB 이하로 줄인 뒤 첨부해 주세요.");
  expect(mocks.mutate).not.toHaveBeenCalled();
});

it("다른 연도나 계정으로 바뀐 뒤 이전 조회 응답이 새 화면에 남지 않는다", async () => {
  let finish!: (value: FinanceView) => void;
  mocks.read.mockImplementationOnce(() => new Promise<FinanceView>((resolve) => { finish = resolve; })).mockResolvedValueOnce(view({ year: 2025, entries: [] }));
  const { rerender } = render(<AnnualFinanceTab year={2026} />);
  rerender(<AnnualFinanceTab year={2025} />);
  await screen.findByRole("heading", { name: "연간 회계" });
  await act(async () => finish(view()));
  expect(screen.getByRole("region", { name: "2025년 연간 회계" })).toBeInTheDocument();
  expect(screen.queryByText("주일 간식 구입")).not.toBeInTheDocument();
  mocks.user = null; rerender(<AnnualFinanceTab year={2025} />);
  expect(screen.getByText("로그인 후 회계 기록을 확인할 수 있습니다.")).toBeInTheDocument();
  expect(screen.queryByText("등록된 거래가 없습니다.")).not.toBeInTheDocument();
});

it("서버가 읽기 전용으로 응답하면 거래·이월금 편집을 열지 않는다", async () => {
  mocks.read.mockResolvedValueOnce(view({ canEdit: false }));
  await open();
  expect(screen.queryByRole("button", { name: "거래 등록" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "이월금 수정" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "주일 간식 구입 상세 보기" }));
  expect(screen.queryByLabelText(/영수증 첨부/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "거래 수정" })).not.toBeInTheDocument();
});

it("이월금 변경 이력은 담당자와 한국어 전후 금액만 보여준다", async () => {
  mocks.history.mockResolvedValueOnce([{ operationId: "test-opening-operation", kind: "opening.save", actorUid: "secret-internal-uid", actorName: "행정 담당", at: "2026-10-18T01:00:00Z", before: 50000, after: 100000 }]);
  await open(); fireEvent.click(screen.getByRole("button", { name: "변경 이력" }));
  await screen.findByText("이월금: 50,000원 → 100,000원");
  expect(mocks.history).toHaveBeenCalledWith(2026, "opening", expect.any(AbortSignal));
  expect(document.body.textContent).not.toContain("secret-internal-uid");
});

it("증빙 파일은 해당 거래에만 첨부하고 진행 중에는 상위 화면 이동 잠금을 알린다", async () => {
  let finish!: (value: FinanceView) => void;
  mocks.mutate.mockImplementationOnce(() => new Promise<FinanceView>((resolve) => { finish = resolve; }));
  const busy = vi.fn();
  render(<AnnualFinanceTab year={2026} onBusyChange={busy} />);
  await screen.findByRole("heading", { name: "연간 회계" });
  fireEvent.click(screen.getByRole("button", { name: "주일 간식 구입 상세 보기" }));
  fireEvent.change(screen.getByLabelText(/영수증 첨부/), { target: { files: [new File(["%PDF-1.7\n영수증"], "주일 영수증.pdf", { type: "application/pdf" })] } });
  await waitFor(() => expect(mocks.mutate).toHaveBeenCalledTimes(1));
  expect(mocks.mutate.mock.calls[0]).toEqual([2026, expect.objectContaining({ kind: "receipt.add", entryId: entry().id, expectedRevision: 1, file: { name: "주일 영수증.pdf", mimeType: "application/pdf", base64: expect.any(String) } })]);
  expect(busy).toHaveBeenLastCalledWith(true);
  expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
  await act(async () => finish(view()));
  expect(busy).toHaveBeenLastCalledWith(false);
});

it("엑셀은 검색된 거래와 연간·월별 집계를 담고 사용자 문구를 수식으로 내보내지 않는다", async () => {
  mocks.read.mockResolvedValueOnce(view({ entries: [entry({ description: "=SUM(1,2)" }), entry({ id: "entry_22222222-2222-4222-8222-222222222222", description: "다른 거래" })] }));
  await open();
  fireEvent.change(screen.getByLabelText("거래 검색"), { target: { value: "SUM" } });
  fireEvent.click(screen.getByRole("button", { name: "엑셀 내보내기" }));
  await waitFor(() => expect(mocks.writeFile).toHaveBeenCalledTimes(1));
  expect(mocks.writeFile.mock.calls[0][1]).toBe("2026년_고등부_회계.xlsx");
  const cells = Object.values(mocks.sheets[0]);
  expect(cells.find((cell) => cell.v === "=SUM(1,2)")).toEqual({ v: "=SUM(1,2)", t: "s" });
  expect(cells.find((cell) => cell.v === "다른 거래")).toBeUndefined();
  expect(mocks.sheets[1]).toBeDefined();
});
