/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Application, AttendanceByScope, Session } from "@/features/semester/types";

vi.mock("@/features/semester/db", () => ({ describeApplicant: () => "1부 · 1학년" }));

import AttendanceGrid from "./AttendanceGrid";

afterEach(cleanup);

const member: Application = {
  id: "application-a",
  studentId: "student-a",
  name: "합성 학생",
  bu: "1부",
  grade: 1,
  class: 1,
  status: "배치",
  createdAt: "2026-09-01",
};
const sessions: Session[] = [{ id: "session-a", date: "2026-09-05", type: "정규" }];

it("저장된 지각을 유지하고 메뉴에서 지각을 명시적으로 선택할 수 있다", () => {
  const onMark = vi.fn();
  const attendanceByScope: AttendanceByScope = {
    team: { "session-a": { "application-a": { s: "지각" } } },
    training: {},
  };
  render(
    <AttendanceGrid
      members={[member]}
      sessions={sessions}
      scope="team"
      attendanceByScope={attendanceByScope}
      completionEligibleByScope={{ team: new Set([member.id]), training: new Set() }}
      canEdit
      completion={{}}
      completionMinRate={0.7}
      onMark={onMark}
      onClear={vi.fn()}
      onToggleCompletion={vi.fn()}
    />,
  );

  const cell = screen.getByRole("button", { name: /출석 상태 \(현재 지각\)/ });
  expect(cell).toHaveTextContent("△");
  fireEvent.click(cell);

  expect(screen.getByRole("menuitem", { name: "△ 지각 (현재)" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "✕ 결석" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("menuitem", { name: "△ 지각 (현재)" }));
  expect(onMark).toHaveBeenCalledWith("application-a", "session-a", "지각");

  fireEvent.click(cell);
  fireEvent.click(screen.getByRole("menuitem", { name: "✕ 결석" }));
  expect(onMark).toHaveBeenCalledWith("application-a", "session-a", "결석");
});
