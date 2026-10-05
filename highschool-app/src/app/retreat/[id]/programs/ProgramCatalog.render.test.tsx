/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { RetreatProgram } from "@/lib/types";
import ProgramList from "./ProgramList";
import { ProgramCatalog } from "./ProgramWorkspaceViews";

const base: RetreatProgram = { id: "first", title: "첫 프로그램", kind: "main", order: 1, status: "draft", createdAt: 1, updatedAt: 1 };
const callbacks = () => ({ onOpen: vi.fn(), onAdd: vi.fn(), onCreateDefaults: vi.fn(), onMove: vi.fn() });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("전체 준비는 막힌 준비와 기한순 할 일을 모으고 프로그램 선택·생성 목록을 중복하지 않는다", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T03:00:00Z"));
  const onOpenPrograms = vi.fn();
  const onSelect = vi.fn();
  const program: RetreatProgram = { ...base, tasks: {
    later: { id: "later", title: "나중 작업", dueDate: "2026-10-08", assignee: "가상 담당", done: false, createdAt: 1, updatedAt: 1 },
    blocked: { id: "blocked", title: "막힌 작업", status: "blocked", dueDate: "2026-10-05", done: false, createdAt: 2, updatedAt: 2 },
    done: { id: "done", title: "완료 작업", done: true, createdAt: 3, updatedAt: 3 },
  } };
  const view = render(<ProgramList programs={[program]} busy={false} onOpenPrograms={onOpenPrograms} onSelect={onSelect} />);
  expect(screen.getByText("기한 지남")).toHaveTextContent("1 기한 지남");
  expect(screen.getByText("막힌 준비")).toHaveTextContent("1 막힌 준비");
  expect(screen.getByText("담당 없음", { selector: ".program-attention__signals span" })).toHaveTextContent("1 담당 없음");
  const rows = screen.getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("막힌 작업");
  expect(rows[1]).toHaveTextContent("나중 작업");
  expect(screen.queryByText("완료 작업")).not.toBeInTheDocument();
  expect(view.container.querySelector(".program-catalog-row, .program-list-items, .program-template-grid")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "프로그램 준비 열기" }));
  expect(onOpenPrograms).toHaveBeenCalledOnce();
  fireEvent.click(within(rows[0]).getByRole("button"));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("first");
});

it("빈 프로그램 목록에서 진행 형식과 직접 만들기·기본 두 개 생성을 한 곳에서 시작한다", () => {
  const props = callbacks();
  render(<ProgramCatalog programs={[]} canEdit busy={false} {...props} />);
  expect(screen.getByRole("button", { name: /^조별로 장소 이동/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^현재 조대로 진행/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^여러 조를 큰 팀으로/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^말씀·묵상 중심/ })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^여러 형식을 섞어 진행/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^한 장소에서 함께 진행/ }));
  fireEvent.click(screen.getByRole("button", { name: /^직접 만들기/ }));
  expect(props.onAdd.mock.calls).toEqual([["host"], ["blank"]]);
  fireEvent.click(screen.getByRole("button", { name: "직접 작성할 프로그램 2개 만들기" }));
  expect(props.onCreateDefaults).toHaveBeenCalledOnce();
});

it("선택 목록은 프로그램 형식과 작업·현장 진행률을 함께 보여 주고 안내한 다음 행동으로 연다", () => {
  const props = callbacks();
  const program: RetreatProgram = { ...base, lead: "가상 담당", tasks: {
    done: { id: "done", title: "완료", done: true, createdAt: 1, updatedAt: 1 },
    todo: { id: "todo", title: "준비", done: false, createdAt: 2, updatedAt: 2 },
  } };
  render(<ProgramCatalog programs={[program, { ...base, id: "post", title: "코스 프로그램", kind: "post", order: 2 }]} canEdit busy={false} {...props} />);
  const first = within(screen.getByRole("article", { name: "첫 프로그램" }));
  expect(first.getByText("집중형 · 초안")).toBeInTheDocument();
  expect(first.getByText("작업 완료").parentElement).toHaveTextContent("1/2작업 완료");
  expect(first.getByText("현장 점검").parentElement).toHaveTextContent("2/10현장 점검");
  expect(screen.getByText("포스트·코스형 · 초안")).toBeInTheDocument();
  fireEvent.click(first.getByRole("button", { name: /진행 순서를 만들어 주세요/ }));
  expect(props.onOpen).toHaveBeenCalledExactlyOnceWith("first", "posts");
});

it("검색 후에도 원래 전체 순번과 경계를 유지하며 앞뒤 이동은 전체 목록 기준으로 요청한다", () => {
  const props = callbacks();
  const programs = Array.from({ length: 5 }, (_, index) => ({ ...base, id: `program-${index + 1}`, title: `프로그램 ${index + 1}`, order: index + 1 }));
  render(<ProgramCatalog programs={programs} canEdit busy={false} {...props} />);
  const search = screen.getByRole("textbox", { name: "프로그램 찾기" });
  fireEvent.change(search, { target: { value: "프로그램 3" } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  expect(screen.getByText("03")).toBeInTheDocument();
  const middle = within(screen.getByRole("group", { name: "프로그램 3 순서 변경" }));
  expect(middle.getByRole("button", { name: "앞으로 이동" })).not.toBeDisabled();
  expect(middle.getByRole("button", { name: "뒤로 이동" })).not.toBeDisabled();
  fireEvent.click(middle.getByRole("button", { name: "앞으로 이동" }));
  fireEvent.click(middle.getByRole("button", { name: "뒤로 이동" }));
  expect(props.onMove.mock.calls).toEqual([["program-3", -1], ["program-3", 1]]);
  fireEvent.change(search, { target: { value: "프로그램 5" } });
  expect(screen.getByText("05")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "앞으로 이동" })).not.toBeDisabled();
  expect(screen.getByRole("button", { name: "뒤로 이동" })).toBeDisabled();
  fireEvent.change(search, { target: { value: "프로그램 1" } });
  expect(screen.getByRole("button", { name: "앞으로 이동" })).toBeDisabled();
});

it("조회 전용 사용자는 선택만 가능하며 생성·순서 변경을 노출하지 않는다", () => {
  const props = callbacks();
  const view = render(<ProgramCatalog programs={[base, { ...base, id: "second", title: "두 번째", order: 2 }]} canEdit={false} busy={false} {...props} />);
  expect(screen.queryByRole("group")).not.toBeInTheDocument();
  expect(screen.queryByText("새 프로그램 만들기")).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("article", { name: "첫 프로그램" })).getByRole("button"));
  expect(props.onOpen).toHaveBeenCalledOnce();
  view.rerender(<ProgramCatalog programs={[]} canEdit={false} busy={false} {...props} />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByText("프로그램이 없습니다")).toBeInTheDocument();
});

it("검색 중 실시간 목록이 네 개로 줄어도 검색창을 유지해 필터를 해제할 수 있다", () => {
  const props = callbacks();
  const programs = Array.from({ length: 5 }, (_, index) => ({ ...base, id: `program-${index + 1}`, title: `프로그램 ${index + 1}`, order: index + 1 }));
  const view = render(<ProgramCatalog programs={programs} canEdit busy={false} {...props} />);
  fireEvent.change(screen.getByRole("textbox", { name: "프로그램 찾기" }), { target: { value: "프로그램 5" } });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  view.rerender(<ProgramCatalog programs={programs.slice(0, 4)} canEdit busy={false} {...props} />);
  expect(screen.getByText("검색 결과가 없습니다")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "프로그램 찾기" })).toHaveValue("프로그램 5");
  fireEvent.change(screen.getByRole("textbox", { name: "프로그램 찾기" }), { target: { value: "" } });
  expect(screen.getAllByRole("article")).toHaveLength(4);
  expect(screen.queryByText("검색 결과가 없습니다")).not.toBeInTheDocument();
});

it("처리 중에는 선택·추가·순서 변경의 중복 요청을 막는다", () => {
  const props = callbacks();
  const view = render(<ProgramCatalog programs={[base, { ...base, id: "second", title: "두 번째", order: 2 }]} canEdit busy {...props} />);
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  view.rerender(<ProgramCatalog programs={[]} canEdit busy {...props} />);
  for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
});
