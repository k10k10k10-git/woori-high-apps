/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), data: vi.fn(), execute: vi.fn(), refresh: vi.fn() }));
vi.mock("./api", () => ({ listPraiseWorkspaces: mocks.list, createPraiseWorkspace: mocks.create, praiseOperationId: () => "operation-test", listPraiseAccounts: async () => ({ accounts: [] }), listPraiseReferences: async () => ({ semesters: [] }), listPraiseRoster: async () => ({ people: [], semesterHref: null }) }));
vi.mock("./usePraiseData", () => ({ usePraiseData: mocks.data }));
import PraiseWorkspace from "./PraiseWorkspace";
import { praiseFixture } from "./components/praiseTestFixtures";
beforeEach(() => { vi.clearAllMocks(); const view = praiseFixture(); mocks.list.mockResolvedValue({ workspaces: [view.meta], canCreate: true }); mocks.data.mockReturnValue({ view, execute: mocks.execute, refresh: mocks.refresh, busy: false, error: "", notice: "" }); });
afterEach(cleanup);
describe("찬양팀 작업공간", () => {
  it("관리자 다섯 탭과 한국어 초기탭을 연결하고 조회로 저장하지 않는다", async () => {
    render(<PraiseWorkspace workspaceId="synthetic-workspace" initialTab="출결" />);
    await waitFor(() => expect(mocks.list).toHaveBeenCalled());
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    expect(screen.getByRole("tab", { name: "출결" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "모임 출결" })).toBeInTheDocument();
    expect(mocks.execute).not.toHaveBeenCalled(); expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("tab", { name: "출결" }), { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "등단" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "등단" })).toHaveAttribute("aria-selected", "true");
  });
  it("멤버는 본인 참석·확정본·가이드만 보며 관리자 query로 편집탭을 열 수 없다", () => {
    const view = praiseFixture(); view.permissions = { read: true, manage: false, stageEdit: false, attendanceAll: false, role: "member", staffId: "staff-1" };
    mocks.data.mockReturnValue({ view, execute: mocks.execute, refresh: mocks.refresh, busy: false, error: "", notice: "" });
    render(<PraiseWorkspace workspaceId="synthetic-workspace" initialTab="praiseSettings" />);
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["이번 주", "출결", "등단"]);
    expect(screen.queryByRole("button", { name: "팀원 등록" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "이번 주" })).toHaveAttribute("aria-selected", "true");
  });
  it("학기가 없을 때 준비 상태 개설과 운영 이관 안내를 제공한다", async () => {
    mocks.list.mockResolvedValue({ workspaces: [], canCreate: true });
    render(<PraiseWorkspace />);
    expect(await screen.findByRole("heading", { name: "찬양팀 운영을 시작해 주세요" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "운영 학기 개설하기" }));
    expect(screen.getByText(/기존 운영 기록은 별도 이관 절차/)).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

it("서버 연결 전에는 준비 안내와 자료실을 보여주고 개설·재시도를 숨긴다", async () => {
  mocks.list.mockRejectedValue(Object.assign(new Error("서버 구성 없음"), { code: "server_not_configured" }));
  render(<PraiseWorkspace workspaceId="synthetic-workspace" />);
  expect(await screen.findByRole("heading", { name: "찬양팀 운영 연결 준비 중" })).toBeInTheDocument();
  expect(screen.getByText(/기존 사이트에서 입력을 계속/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "다시 불러오기" })).not.toBeInTheDocument();
  expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
  expect(mocks.create).not.toHaveBeenCalled();
});
it("개설 응답을 기다리는 동안 기간·이름·닫기를 잠근다", async () => {
  let resolve!: (value: { workspaceId: string }) => void;
  mocks.list.mockResolvedValue({ workspaces: [], canCreate: true });
  mocks.create.mockImplementation(() => new Promise((done) => { resolve = done; }));
  render(<PraiseWorkspace />);
  fireEvent.click(await screen.findByRole("button", { name: "운영 학기 개설하기" }));
  fireEvent.change(screen.getByLabelText("운영 학기 이름"), { target: { value: "새 학기" } });
  fireEvent.change(screen.getByLabelText("종료일"), { target: { value: "2026-12-31" } });
  fireEvent.click(screen.getByRole("button", { name: "준비 상태로 개설" }));
  expect(screen.getByLabelText("운영 학기 이름")).toBeDisabled();
  expect(screen.getByLabelText("시작일")).toBeDisabled();
  expect(screen.getByLabelText("종료일")).toBeDisabled();
  expect(screen.getByRole("button", { name: "개설 닫기" })).toBeDisabled();
  await act(async () => resolve({ workspaceId: "synthetic-workspace" }));
});
