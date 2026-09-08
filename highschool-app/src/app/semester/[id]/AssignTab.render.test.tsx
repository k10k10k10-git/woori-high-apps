/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: vi.fn() }) }));
vi.mock("@/features/semester/EditContext", () => ({ useSemesterCanEdit: () => false }));
vi.mock("@/features/semester/db", () => ({ describeApplicant: () => "1부 2학년", subscribeApplicationsPrivate: vi.fn(), subscribeClassesByYear: vi.fn(), subscribeStaffByYear: vi.fn(), updateApplication: vi.fn() }));
import AssignTab from "./AssignTab";
import type { Team } from "@/features/semester/types";
const teams = [{ id: "praise", name: "찬양팀", color: "bg-green-100" }, { id: "media", name: "미디어팀", color: "bg-blue-100" }] as Team[];
afterEach(cleanup);
it("찬양팀에서 넘어오면 해당 팀에 집중하고 전체 사역팀을 다시 열 수 있다", () => {
  render(<AssignTab sid="2026-2" initialTeamId="praise" teams={teams} applications={[]} trainingClasses={[]} teamById={new Map(teams.map((team) => [team.id, team]))} />);
  expect(screen.getByLabelText("사역팀 보기")).toHaveValue("praise");
  expect(screen.getAllByRole("button", { name: "명단 상세" })).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("사역팀 보기"), { target: { value: "" } });
  expect(screen.getAllByRole("button", { name: "명단 상세" })).toHaveLength(2);
});
it("다른 학기나 삭제된 팀 링크는 빈 배치 화면 대신 전체 팀을 보여 준다", () => {
  render(<AssignTab sid="2026-2" initialTeamId="deleted" teams={teams} applications={[]} trainingClasses={[]} teamById={new Map(teams.map((team) => [team.id, team]))} />);
  expect(screen.getByLabelText("사역팀 보기")).toHaveValue("");
  expect(screen.getAllByRole("button", { name: "명단 상세" })).toHaveLength(2);
});
