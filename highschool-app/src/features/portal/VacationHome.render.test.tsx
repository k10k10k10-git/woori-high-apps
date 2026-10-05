/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Retreat } from "@/lib/types";

const state = vi.hoisted(() => ({ isMobileView: false, push: vi.fn(), prefetch: vi.fn(), onSelect: vi.fn(), onDelete: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => state }));
vi.mock("next/link", () => ({ default: ({ prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => <a {...props} data-prefetch={prefetch === false ? "false" : "default"} /> }));
vi.mock("@/context/ViewModeContext", () => ({ useViewMode: () => state }));
vi.mock("@/app/RetreatCalendarPanel", () => ({ default: ({ retreat, canEditPeriods }: { retreat?: Retreat; canEditPeriods: boolean }) => <div data-testid="calendar" data-retreat={retreat?.id} data-can-edit={String(canEditPeriods)} /> }));
vi.mock("./NewRetreatButton", () => ({ default: () => <button type="button">새 수련회</button> }));
import VacationHome from "./VacationHome";

const retreats = [{ id: "fixture/id", name: "합성 수련회", year: 2026 }, { id: "other", name: "다른 합성 수련회", year: 2027 }] as Retreat[];
beforeEach(() => { vi.clearAllMocks(); state.isMobileView = false; });
afterEach(cleanup);

it.each([
  ["admin", false], ["program", false], ["field", false],
  ["admin", true], ["program", true], ["field", true],
] as const)("%s 모드의 모바일=%s에서도 선택 수련회의 세 업무 링크를 모두 유지한다", (mode, mobile) => {
  state.isMobileView = mobile;
  render(<VacationHome mode={mode} roles={{ semester: "none", retreat: "none" }} retreats={retreats} selectedId="fixture/id" onSelect={state.onSelect} onDelete={state.onDelete} />);
  const links = within(screen.getByRole("navigation", { name: "수련회 업무 영역" })).getAllByRole("link");
  expect(links).toHaveLength(3);
  for (const [index, area] of ["administration", "programs", "field"].entries()) {
    expect(links[index]).toHaveTextContent("권한 필요");
    expect(links[index]).toHaveAttribute("href", `/events/fixture%2Fid/${area}`);
    expect(links[index]).toHaveAttribute("data-prefetch", "false");
    expect(links[index]).not.toHaveAttribute("aria-current");
    fireEvent.click(links[index]);
    expect(state.push).toHaveBeenLastCalledWith(`/events/fixture%2Fid/${area}`);
  }
  expect(state.prefetch).not.toHaveBeenCalled();
  expect(state.onSelect).not.toHaveBeenCalled();
  expect(state.onDelete).not.toHaveBeenCalled();
  expect(screen.getByTestId("calendar")).toHaveAttribute("data-retreat", "fixture/id");
  expect(screen.getByTestId("calendar")).toHaveAttribute("data-can-edit", "false");
});

it.each([false, true])("현장 역할의 모바일=%s에서도 행정·준비 안내와 기존 현장 업무를 유지한다", (mobile) => {
  state.isMobileView = mobile;
  render(<VacationHome mode="field" roles={{ semester: "none", retreat: "fieldStaff" }} retreats={retreats} selectedId="fixture/id" onSelect={state.onSelect} />);
  const nav = within(screen.getByRole("navigation", { name: "수련회 업무 영역" }));
  expect(nav.getByRole("link", { name: "행정 권한 필요" })).toBeInTheDocument();
  expect(nav.getByRole("link", { name: "프로그램 준비 권한 필요" })).toBeInTheDocument();
  expect(nav.getByRole("link", { name: "이가드" })).toBeInTheDocument();
  expect(state.prefetch.mock.calls).toEqual([["/events/fixture%2Fid/field"]]);
  if (mobile) {
    expect(screen.getByRole("button", { name: "개인 큐카드 열기" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "현장 바로가기" })).toBeInTheDocument();
  }
});

it("수련회를 바꾸면 세 업무 링크도 새 선택으로 바뀐다", () => {
  state.isMobileView = true;
  const props = { mode: "field" as const, roles: { semester: "none" as const, retreat: "fieldStaff" as const }, retreats, onSelect: state.onSelect };
  const { rerender } = render(<VacationHome {...props} selectedId="fixture/id" />);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "other" } });
  expect(state.onSelect).toHaveBeenCalledWith("other");
  rerender(<VacationHome {...props} selectedId="other" />);
  const nav = within(screen.getByRole("navigation", { name: "수련회 업무 영역" }));
  expect(nav.getByRole("link", { name: "프로그램 준비 권한 필요" })).toHaveAttribute("href", "/events/other/programs");
  expect(screen.getByTestId("calendar")).toHaveAttribute("data-retreat", "other");
});
