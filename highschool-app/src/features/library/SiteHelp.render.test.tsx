/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const navigation = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
import SiteHelp from "./SiteHelp";
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); window.history.replaceState(null, "", "/"); });

describe("신규 스탭 업무별 사용법", () => {
  it("방문 이력이 있으면 이전 화면으로 돌아간다", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(2);
    render(<SiteHelp />);
    fireEvent.click(screen.getByRole("button", { name: "이전 화면으로" }));
    expect(navigation.back).toHaveBeenCalledOnce();
    expect(navigation.push).not.toHaveBeenCalled();
  });
  it("직접 열어 방문 이력이 없으면 팀 선택으로 이동한다", () => {
    vi.spyOn(window.history, "length", "get").mockReturnValue(1);
    render(<SiteHelp />);
    fireEvent.click(screen.getByRole("button", { name: "이전 화면으로" }));
    expect(navigation.push).toHaveBeenCalledWith("/teams");
    expect(navigation.back).not.toHaveBeenCalled();
  });
  it.each(["출석 삭제", "출석삭제", "출석 수정"])("사용자가 쓰는 말 '%s'로 출결 변경 안내를 찾는다", (query) => {
    render(<SiteHelp />);
    fireEvent.change(screen.getByRole("searchbox", { name: "사용법 검색" }), { target: { value: query } });
    expect(screen.getByText("출결은 어떻게 저장하나요? 실수로 잘못 입력했어요.")).toBeVisible();
  });
  it.each(["권한 오류", "로그인 오류", "접속오류"])("접속 문제 표현 '%s'에 재시도와 문의 안내를 제공한다", (query) => {
    render(<SiteHelp />);
    fireEvent.change(screen.getByRole("searchbox", { name: "사용법 검색" }), { target: { value: query } });
    expect(screen.getByText("불러오지 못했다는 안내가 계속 나와요.")).toBeVisible();
  });
  it.each([
    ["학생 안 보여요", "담당 조나 학생이 보이지 않아요."],
    ["학생안보여요", "담당 조나 학생이 보이지 않아요."],
    ["권한 없어요", "로그인했는데 접근 승인이 필요하다고 나와요."],
    ["저장이 안 돼요", "저장이 안 돼요. 무엇을 확인해야 하나요?"],
    ["저장이안돼요", "저장이 안 돼요. 무엇을 확인해야 하나요?"],
  ])("일상 표현 '%s'로 필요한 도움말을 펼친다", (query, title) => {
    render(<SiteHelp />);
    fireEvent.change(screen.getByRole("searchbox", { name: "사용법 검색" }), { target: { value: query } });
    expect(screen.getByText(title).closest("details")).toHaveAttribute("open");
  });
  it("저장 도움말은 실제 자동·명시 저장 방식과 실패 후 재시도를 안내한다", () => {
    render(<SiteHelp />);
    fireEvent.change(screen.getByRole("searchbox", { name: "사용법 검색" }), { target: { value: "저장이 안 돼요" } });
    expect(screen.getByText(/커리큘럼은 입력 칸을 벗어나면 자동 저장/)).toBeVisible();
    expect(screen.getByText(/학기 자료는 파일 저장·링크 저장 버튼/)).toBeVisible();
    expect(screen.getByRole("link", { name: "저장 문제 제보하기" })).toHaveAttribute("href", "/help/feedback");
  });
  it("권한 오류 화면의 직접 링크는 해당 사용법을 펼쳐 보여준다", () => {
    window.history.replaceState(null, "", "/library/help#access");
    render(<SiteHelp />);
    expect(screen.getByText("로그인했는데 접근 승인이 필요하다고 나와요.").closest("details")).toHaveAttribute("id", "access");
    expect(screen.getByText("로그인했는데 접근 승인이 필요하다고 나와요.").closest("details")).toHaveAttribute("open");
  });
  it("출결과 권한 검색으로 실제 업무 안내와 문의 경로를 찾는다", () => {
    render(<SiteHelp />);
    fireEvent.change(screen.getByRole("searchbox", { name: "사용법 검색" }), { target: { value: "출결 저장" } });
    expect(screen.getByText("출결은 어떻게 저장하나요? 실수로 잘못 입력했어요.")).toBeInTheDocument();
    expect(screen.getByText(/기록 지우기는 출석·결석을 미입력으로/)).toBeVisible();
    fireEvent.change(screen.getByRole("searchbox", { name: "사용법 검색" }), { target: { value: "승인" } });
    expect(screen.getByText("로그인했는데 접근 승인이 필요하다고 나와요.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "사용법 문의·문제 제보" })).toHaveAttribute("href", "/help/feedback");
  });
  it("빈 검색 결과에서 검색어와 업무 필터를 함께 초기화한다", () => {
    render(<SiteHelp />);
    fireEvent.change(screen.getByRole("combobox", { name: "업무 종류" }), { target: { value: "접속·권한" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "사용법 검색" }), { target: { value: "없는사용법XYZ" } });
    expect(screen.getByText(/검색 결과가 없습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "검색 초기화" }));
    expect(screen.getByRole("combobox", { name: "업무 종류" })).toHaveValue("전체");
    expect(screen.getByRole("searchbox", { name: "사용법 검색" })).toHaveValue("");
    expect(screen.getByRole("status")).toHaveTextContent("10개의 안내");
  });
});
