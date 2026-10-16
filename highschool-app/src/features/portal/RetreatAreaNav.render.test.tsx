/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ prefetch: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)} /> }));
import RetreatAreaNav from "./RetreatAreaNav";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("현장 역할도 세 영역을 모두 보지만 행정·준비 화면은 prefetch하지 않는다", () => {
  render(<RetreatAreaNav retreatId="fixture/id" current="field" adminAllowed={false} fieldAllowed />);
  expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "현장 업무(이가드)" })).toHaveAttribute("href", "/events/fixture%2Fid/field");
  expect(screen.getByRole("link", { name: "현장 업무(이가드)" })).toHaveAttribute("aria-current", "page");
  const admin = screen.getByRole("link", { name: "행정 권한 필요" });
  const programs = screen.getByRole("link", { name: "프로그램 준비 권한 필요" });
  fireEvent.pointerEnter(admin);
  fireEvent.focus(admin);
  fireEvent.pointerEnter(programs);
  fireEvent.focus(programs);
  expect(router.prefetch.mock.calls).toEqual([["/events/fixture%2Fid/field"]]);
  expect(admin).toHaveAttribute("data-prefetch", "false");
  fireEvent.click(admin);
  expect(router.push).toHaveBeenCalledWith("/events/fixture%2Fid/administration");
});

it("모든 영역에 권한이 없어도 링크를 유지하고 어떤 목적지도 prefetch하지 않는다", () => {
  render(<RetreatAreaNav retreatId="fixture" current="field" adminAllowed={false} fieldAllowed={false} />);
  for (const link of screen.getAllByRole("link")) {
    expect(link).toHaveTextContent("권한 필요");
    fireEvent.pointerEnter(link);
    fireEvent.focus(link);
  }
  expect(router.prefetch).not.toHaveBeenCalled();
});

it("권한 있는 영역은 미리 준비하되 미저장 초안 확인 콜백을 거쳐 이동한다", () => {
  const onNavigate = vi.fn();
  render(<RetreatAreaNav retreatId="fixture" current="programs" adminAllowed fieldAllowed onNavigate={onNavigate} />);
  expect(router.prefetch).toHaveBeenCalledWith("/events/fixture/administration");
  expect(router.prefetch).toHaveBeenCalledWith("/events/fixture/programs");
  expect(router.prefetch).toHaveBeenCalledWith("/events/fixture/field");
  fireEvent.click(screen.getByRole("link", { name: "행정" }));
  expect(onNavigate).toHaveBeenCalledWith("/events/fixture/administration");
  expect(router.push).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("link", { name: "프로그램 준비" }));
  expect(onNavigate).toHaveBeenCalledOnce();
});
