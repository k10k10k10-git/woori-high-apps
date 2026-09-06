/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PraiseAuditList } from "./PraiseAuditList";
import type { PraiseView } from "../types";
import { praiseFixture } from "./praiseTestFixtures";

afterEach(cleanup);

function view(manage = true): PraiseView {
  const source = praiseFixture();
  return { ...source, permissions: { ...source.permissions, manage }, audit: [
    { id: "a", at: 1788652800000, actor: { uid: "operator", name: "담당 스탭" }, action: "attendance.set", label: "2026-09-05 학생 가 출결 변경", changes: [{ field: "출결", before: "미입력", after: "출석" }] },
    { id: "b", at: 1788652800001, actor: { uid: "operator" }, action: "groups.confirm", label: "조 확정", changes: [] },
    { id: "c", at: 1788652800002, actor: { uid: "supabase:old", name: "과거 작성자" }, historical: true, action: "attendance.set", label: "외부 학생 나 출결", changes: [] },
  ] };
}

describe("찬양팀 최근 감사 목록", () => {
  it("출결에서 출결 변경만 보여주고 검색해 이전 값과 새 값을 확인한다", () => {
    render(<PraiseAuditList view={view()} attendanceOnly />);
    fireEvent.click(screen.getByText("최근 출결 변경"));
    expect(screen.queryByText("조 확정")).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "활동 기록 검색" }), { target: { value: "학생가" } });
    expect(screen.getByText("출결: 미입력 → 출석")).toBeTruthy();
    expect(screen.queryByText("외부 학생 나 출결")).toBeNull();
  });
  it("이관 기록을 현재 입력 계정의 행위로 표시하지 않는다", () => {
    render(<PraiseAuditList view={view()} />);
    fireEvent.click(screen.getByText("최근 운영 활동"));
    expect(screen.getByText(/외부 사이트 이관 기록/)).toBeTruthy();
    expect(screen.queryByText(/과거 작성자/)).toBeNull();
    expect(screen.getByText(/이전 기록 전체를 뜻하지 않습니다/)).toBeTruthy();
  });
  it("담당자에게 본인 기록 범위를 안내하고 없는 검색 결과를 표시한다", () => {
    render(<PraiseAuditList view={view(false)} />);
    fireEvent.click(screen.getByText("내 최근 활동"));
    expect(screen.getByText(/본인이 남긴 최근 활동/)).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "활동 기록 검색" }), { target: { value: "없는 기록" } });
    expect(screen.getByText("검색 조건에 맞는 기록이 없습니다.")).toBeTruthy();
  });
});
