/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AdminChangesTab } from "./SundayMinistryTabs";
import type { SundayAdminChange } from "./model";

const entry = (id: string, year: string, studentName: string, classKey: string, changedAt: string, action = "학생 정보 수정"): SundayAdminChange => ({
  id, year, studentName, classKey, changedAt, changedAtMs: new Date(changedAt).getTime(), action,
  teacher: "담당 교사", actor: "행정 담당", changeSummary: "보호자 연락처 변경", result: "반영 완료",
});
const changes = [
  entry("past", "2025", "이전 학생", "1-1-1", "2025-10-01T01:00:00Z"),
  entry("one", "2026", "첫째 학생", "1-2-1", "2026-10-20T14:59:59Z"),
  entry("two", "2026", "둘째 학생", "2-2-1", "2026-10-20T15:00:00Z", "반 이동"),
];
afterEach(cleanup);

it("선택 연도에서 이름·부·유형으로 이력을 찾아보고 조건을 초기화한다", () => {
  const view = render(<AdminChangesTab changes={changes} year={2026} />);
  expect(screen.queryByText("이전 학생")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("2026년 2건 / 전체 2건");
  fireEvent.change(screen.getByRole("searchbox", { name: "학생·담당자 검색" }), { target: { value: "첫째학생" } });
  expect(screen.getAllByText("첫째 학생")).toHaveLength(2);
  expect(screen.queryByText("둘째 학생")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "조건 초기화" }));
  fireEvent.change(screen.getByRole("combobox", { name: "부" }), { target: { value: "2" } });
  fireEvent.change(screen.getByRole("combobox", { name: "변동 유형" }), { target: { value: "반 이동" } });
  expect(screen.getAllByText("둘째 학생")).toHaveLength(2);
  expect(screen.queryByText("첫째 학생")).not.toBeInTheDocument();
  view.rerender(<AdminChangesTab changes={changes} year={2025} />);
  expect(screen.getAllByText("이전 학생")).toHaveLength(2);
  expect(screen.getByRole("searchbox")).toHaveValue("");
});

it("한국 날짜의 종료일을 포함하고 잘못된 범위를 안내한다", () => {
  render(<AdminChangesTab changes={changes} year={2026} />);
  fireEvent.change(screen.getByLabelText("수정일 시작"), { target: { value: "2026-10-20" } });
  fireEvent.change(screen.getByLabelText("수정일 종료"), { target: { value: "2026-10-20" } });
  expect(screen.getAllByText("첫째 학생")).toHaveLength(2);
  expect(screen.queryByText("둘째 학생")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("수정일 시작"), { target: { value: "2026-10-21" } });
  expect(screen.getByRole("alert")).toHaveTextContent("종료일을 시작일 이후로 선택");
});

it("긴 변경 내용을 모두 펼칠 수 있고 기존 기록 객체는 수정하지 않는다", () => {
  const summary = "학교 「이전 학교」 → 「현재 학교」 · 보호자 연락처 변경 · 본인 연락처 변경 · 주소 변경";
  const record = { ...changes[1], changeSummary: summary };
  const before = JSON.stringify(record);
  render(<AdminChangesTab changes={[record]} year={2026} />);
  fireEvent.click(screen.getAllByRole("button", { name: "자세히 (4건)" })[0]);
  expect(screen.getByText("학교 「이전 학교」 → 「현재 학교」")).toBeInTheDocument();
  expect(screen.getByText("주소 변경")).toBeInTheDocument();
  expect(JSON.stringify(record)).toBe(before);
});
