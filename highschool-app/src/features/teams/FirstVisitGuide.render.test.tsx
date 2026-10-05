/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FirstVisitGuide } from "./FirstVisitGuide";

const steps = [{ title: "팀 현황 확인", description: "학생·스탭과 다음 모임을 확인하세요.", href: "/teams/praise", action: "현황 보기" }];
const guide = (userId: string, teamKey: "praise" | "worship" = "praise") => <FirstVisitGuide userId={userId} teamKey={teamKey} teamLabel={teamKey === "praise" ? "찬양팀" : "예배팀"} roleLabel="스탭" steps={steps} />;

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("첫 접속은 자동으로 열고 닫은 안내를 재접속에서는 접는다", () => {
  const first = render(guide("first-visit"));
  expect(screen.getByRole("region", { name: "찬양팀, 이렇게 시작해요" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
  expect(localStorage.getItem("woori-team-guide:v1:first-visit:praise")).toBe("done");
  first.unmount();
  render(guide("first-visit"));
  expect(screen.queryByRole("region", { name: "찬양팀, 이렇게 시작해요" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "사용 안내 열기" })).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "사용 안내 열기" }));
  expect(screen.getByRole("region", { name: "찬양팀, 이렇게 시작해요" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "사이트 사용법 보기" })).toHaveAttribute("href", "/library/help");
});

it("완료 기록을 계정과 팀별로 분리한다", () => {
  const first = render(guide("account-one"));
  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
  first.unmount();
  const second = render(guide("account-two"));
  expect(screen.getByRole("region", { name: "찬양팀, 이렇게 시작해요" })).toBeInTheDocument();
  second.unmount();
  render(guide("account-one", "worship"));
  expect(screen.getByRole("region", { name: "예배팀, 이렇게 시작해요" })).toBeInTheDocument();
});

it("브라우저 저장소가 차단돼도 안내를 닫고 다시 열 수 있다", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("storage blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage blocked"); });
  const first = render(guide("storage-failure"));
  expect(screen.getByRole("region", { name: "찬양팀, 이렇게 시작해요" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
  expect(screen.queryByRole("region", { name: "찬양팀, 이렇게 시작해요" })).not.toBeInTheDocument();
  first.unmount();
  render(guide("storage-failure"));
  expect(screen.queryByRole("region", { name: "찬양팀, 이렇게 시작해요" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "사용 안내 열기" }));
  expect(screen.getByRole("region", { name: "찬양팀, 이렇게 시작해요" })).toBeInTheDocument();
});
