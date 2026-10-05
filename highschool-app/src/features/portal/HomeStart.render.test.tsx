/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { HomeStart } from "./HomeStart";
import { FirstVisitGuide } from "@/features/teams/FirstVisitGuide";

const entry = { href: "/teams/praise", title: "찬양팀 업무 시작", description: "팀 현황과 기록을 확인합니다.", steps: ["팀 전체 현황 확인", "모임 날짜 확인", "담당 기록 확인"] };
beforeEach(() => localStorage.clear());
afterEach(cleanup);

it("홈에 머무는 신규 계정은 첫 사용 안내를 자동으로 보고 닫은 상태를 기억한다", () => {
  const first = render(<HomeStart userId="home-first" roleLabel="조회자" entry={entry} />);
  const details = screen.getByText("처음이라면 내 업무부터 확인하세요").closest("details")!;
  expect(details).toHaveAttribute("open");
  details.open = false;
  fireEvent(details, new Event("toggle"));
  expect(localStorage.getItem("woori-team-guide:v1:home-first:home:praise")).toBe("done");
  first.unmount();
  render(<HomeStart userId="home-first" roleLabel="조회자" entry={entry} />);
  expect(screen.getByText("처음이라면 내 업무부터 확인하세요").closest("details")).not.toHaveAttribute("open");
});

it("홈의 짧은 안내를 닫아도 팀의 첫 상세 안내를 자동으로 제공한다", () => {
  const home = render(<HomeStart userId="home-team-shared" roleLabel="스탭" entry={entry} />);
  const details = screen.getByText("처음이라면 내 업무부터 확인하세요").closest("details")!;
  details.open = false;
  fireEvent(details, new Event("toggle"));
  home.unmount();
  render(<FirstVisitGuide userId="home-team-shared" teamKey="praise" teamLabel="찬양팀" roleLabel="스탭" steps={[]} />);
  expect(screen.getByRole("region", { name: "찬양팀, 이렇게 시작해요" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "안내 닫기" })).toBeInTheDocument();
});

it("홈 조회자는 출결 입력·등단 저장 대신 확인과 문의 안내를 본다", () => {
  render(<HomeStart userId="home-viewer" roleLabel="찬양팀" entry={{ ...entry, steps: ["출결 입력", "등단 저장"] }} viewOnly />);
  expect(screen.getByText("학기 명단·연락처와 기존 기록 조회")).toBeInTheDocument();
  expect(screen.getByText("찬양팀 · 팀 기록 조회 전용")).toBeInTheDocument();
  expect(screen.queryByText("출결 입력")).not.toBeInTheDocument();
  expect(screen.queryByText("등단 저장")).not.toBeInTheDocument();
});

it("같은 홈에서 계정을 바꾸면 이전 계정의 닫기 상태를 물려주지 않는다", () => {
  const view = render(<HomeStart userId="home-old" roleLabel="스탭" entry={entry} />);
  const details = screen.getByText("처음이라면 내 업무부터 확인하세요").closest("details")!;
  details.open = false;
  fireEvent(details, new Event("toggle"));
  view.rerender(<HomeStart userId="home-new" roleLabel="스탭" entry={entry} />);
  expect(screen.getByText("처음이라면 내 업무부터 확인하세요").closest("details")).toHaveAttribute("open");
});
