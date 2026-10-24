/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HomeStart } from "./HomeStart";

const entry = { href: "/teams/praise", title: "찬양팀 업무 시작", description: "팀 현황과 기록을 확인합니다." };
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("홈은 사용 안내를 펼치지 않고 담당 업무를 바로 연다", () => {
  const storageRead = vi.spyOn(Storage.prototype, "getItem");
  const storageWrite = vi.spyOn(Storage.prototype, "setItem");
  const { container } = render(<HomeStart roleLabel="스탭" entry={entry} />);
  expect(screen.getByRole("link", { name: "업무 열기" })).toHaveAttribute("href", "/teams/praise");
  expect(container.querySelector("details")).toBeNull();
  expect(screen.queryByRole("link", { name: "사이트 사용법 보기" })).not.toBeInTheDocument();
  expect(storageRead).not.toHaveBeenCalled();
  expect(storageWrite).not.toHaveBeenCalled();
});

it("홈 조회자는 권한 상태를 짧게 표시하고 같은 담당 업무로 이동한다", () => {
  render(<HomeStart roleLabel="찬양팀" entry={entry} viewOnly />);
  expect(screen.getByText("찬양팀 · 팀 기록 조회 전용")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "업무 열기" })).toHaveAttribute("href", "/teams/praise");
});

it("담당 업무가 없으면 로그인 계정과 팀 연결 문의 경로를 제공한다", () => {
  render(<HomeStart roleLabel="스탭" entry={null} accountEmail="staff@example.test" />);
  expect(screen.getByRole("heading", { name: "담당 팀 연결이 필요합니다" })).toBeInTheDocument();
  expect(screen.getByText("로그인 계정 · staff@example.test")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "팀 연결 문의하기" })).toHaveAttribute("href", "/help/feedback");
  expect(screen.queryByRole("link", { name: "업무 열기" })).not.toBeInTheDocument();
});
