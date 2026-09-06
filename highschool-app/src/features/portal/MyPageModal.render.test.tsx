/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Link from "next/link";
import type { MinistryRoles } from "./accessPolicy";
import MyPageModal from "./MyPageModal";

const auth = vi.hoisted(() => ({ user: { uid: "admin", displayName: "테스트 이름" }, memberName: "김교사", roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("./AdminDashboardPanel", () => ({ default: () => <p>운영 요약 내용</p> }));
vi.mock("./RoleDashboardPanel", () => ({ default: () => <p>개인 요약 내용</p> }));
vi.mock("./MyMinistryPanel", () => ({ default: () => <div><p>나의 사역 내용</p><Link href="/">학기 열기</Link><a href="#attachment" download>첨부 저장</a></div> }));
vi.mock("./MyRequestsPanel", () => ({ default: () => <input aria-label="내 요청 검색" /> }));
vi.mock("./TeamModal", () => ({ default: () => <p>팀원 관리 내용</p> }));
vi.mock("./SiteRequestsPanel", () => ({ default: () => <p>관리 요청 내용</p> }));
vi.mock("./ActivityLogPanel", () => ({ default: () => <p>활동 로그 내용</p> }));

beforeEach(() => {
  auth.user = { uid: "admin", displayName: "테스트 이름" };
  auth.roles = { semester: "superAdmin", retreat: "superAdmin" };
  vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([{ width: 1, height: 1 }] as unknown as DOMRectList);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function menu() { return within(screen.getByRole("tablist", { name: "마이페이지 메뉴" })); }

describe("마이페이지 작업 화면", () => {
  it("관리자는 여섯 메뉴와 연결된 대시보드를 본다", async () => {
    render(<MyPageModal onClose={vi.fn()} />);
    expect(menu().getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["대시보드", "내 사역", "내 요청", "팀원 관리", "요청사항", "활동 로그"]);
    expect(await screen.findByText("운영 요약 내용")).toBeInTheDocument();
    const selected = menu().getByRole("tab", { selected: true });
    const panel = screen.getByRole("tabpanel", { name: "대시보드" });
    expect(selected).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-labelledby", selected.id);
  });

  it.each(["team", "requests", "activity"] as const)("일반 사용자의 금지 초기 메뉴 %s는 개인 대시보드로 돌아간다", async (initialTab) => {
    auth.roles = { semester: "staff", retreat: "fieldStaff" };
    render(<MyPageModal onClose={vi.fn()} initialTab={initialTab} />);
    expect(menu().getAllByRole("tab")).toHaveLength(3);
    expect(await screen.findByText("개인 요약 내용")).toBeInTheDocument();
    expect(screen.queryByText("팀원 관리 내용")).not.toBeInTheDocument();
    expect(screen.queryByText("관리 요청 내용")).not.toBeInTheDocument();
    expect(screen.queryByText("활동 로그 내용")).not.toBeInTheDocument();
  });

  it("방향키와 Home/End로 메뉴·포커스가 함께 이동한다", async () => {
    render(<MyPageModal onClose={vi.fn()} />);
    const first = menu().getByRole("tab", { name: "대시보드" });
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(menu().getByRole("tab", { name: "내 사역" })).toHaveFocus();
    expect(await screen.findByText("나의 사역 내용")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(menu().getByRole("tab", { name: "활동 로그" })).toHaveFocus();
    expect(await screen.findByText("활동 로그 내용")).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(menu().getByRole("tab", { name: "활동 로그" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(first).toHaveFocus();
    expect(menu().getAllByRole("tab").filter((item) => item.tabIndex === 0)).toEqual([first]);
  });

  it("열린 중 권한을 회수하면 관리 내용과 선택 상태를 폐기한다", async () => {
    const { rerender } = render(<MyPageModal onClose={vi.fn()} initialTab="team" />);
    expect(await screen.findByText("팀원 관리 내용")).toBeInTheDocument();
    auth.roles = { semester: "staff", retreat: "none" };
    rerender(<MyPageModal onClose={vi.fn()} initialTab="team" />);
    expect(await screen.findByText("개인 요약 내용")).toBeInTheDocument();
    expect(screen.queryByText("팀원 관리 내용")).not.toBeInTheDocument();
    expect(menu().getByRole("tab", { selected: true })).toHaveTextContent("대시보드");
  });

  it("다른 계정에는 이전 패널 입력 상태를 넘기지 않는다", async () => {
    const { rerender } = render(<MyPageModal onClose={vi.fn()} initialTab="myRequests" />);
    fireEvent.change(await screen.findByLabelText("내 요청 검색"), { target: { value: "이전 계정 메모" } });
    auth.user = { uid: "another", displayName: "다른 이름" };
    rerender(<MyPageModal onClose={vi.fn()} initialTab="myRequests" />);
    expect(await screen.findByLabelText("내 요청 검색")).toHaveValue("");
  });

  it("활동 로그를 연 뒤 통합관리자 권한이 사라지면 내용을 즉시 폐기한다", async () => {
    const { rerender } = render(<MyPageModal onClose={vi.fn()} initialTab="activity" />);
    expect(await screen.findByText("활동 로그 내용")).toBeInTheDocument();
    auth.roles = { semester: "pastor", retreat: "pastor" };
    rerender(<MyPageModal onClose={vi.fn()} initialTab="activity" />);
    expect(screen.queryByText("활동 로그 내용")).not.toBeInTheDocument();
    expect(menu().queryByRole("tab", { name: "활동 로그" })).not.toBeInTheDocument();
    expect(await screen.findByText("개인 요약 내용")).toBeInTheDocument();
  });

  it("모바일의 마지막 초기 탭을 수평 메뉴 안으로 드러낸다", async () => {
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scroll });
    try {
      render(<MyPageModal onClose={vi.fn()} initialTab="activity" />);
      expect(await screen.findByText("활동 로그 내용")).toBeInTheDocument();
      expect(scroll).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
      expect(scroll.mock.instances).toContain(menu().getByRole("tab", { name: "활동 로그" }));
    } finally {
      if (original) Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
      else Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("동일 경로 바로가기도 닫지만 새 탭·첨부 다운로드는 유지한다", async () => {
    const onClose = vi.fn();
    render(<MyPageModal onClose={onClose} initialTab="ministry" />);
    const link = await screen.findByRole("link", { name: "학기 열기" });
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(screen.getByRole("link", { name: "첨부 저장" }));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(link);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ESC와 닫기 버튼이 작동하고 해제 뒤 진입점에 포커스를 돌린다", async () => {
    const entry = document.createElement("button");
    document.body.append(entry); entry.focus();
    const onClose = vi.fn();
    const { unmount } = render(<MyPageModal onClose={onClose} />);
    await screen.findByText("운영 요약 내용");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "마이페이지 닫기" }));
    expect(onClose).toHaveBeenCalledTimes(2);
    unmount();
    await waitFor(() => expect(entry).toHaveFocus());
    entry.remove();
  });
});
