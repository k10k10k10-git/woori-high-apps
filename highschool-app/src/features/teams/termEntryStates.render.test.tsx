/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Semester, Team } from "@/features/semester/types";

const mocks = vi.hoisted(() => ({ semesters: vi.fn(), teams: vi.fn(), retryRoles: vi.fn(), roleError: false }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { uid: "fixture-user" }, loading: false, roleError: mocks.roleError, retryRoles: mocks.retryRoles, roles: { semester: "superAdmin", retreat: "none" }, teamMemberships: {} }) }));
vi.mock("@/features/semester/db", () => ({ subscribeSemesters: mocks.semesters, subscribeTeams: mocks.teams }));

import TeamWorkspace from "./TeamWorkspace";
import TrainingHome from "@/features/training/TrainingHome";

const past = { id: "past", meta: { title: "지난 훈련 학기", startDate: "2025-01-01", endDate: "2025-06-30" } } as Semester;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.roleError = false;
  mocks.semesters.mockReturnValue(() => {});
  mocks.teams.mockReturnValue(() => {});
});

it("팀 직접 주소에서 역할 조회 실패를 실제 미배정과 구분한다", () => {
  mocks.roleError = true;
  render(<TeamWorkspace teamKey="praise" />);
  expect(screen.getByRole("alert")).toHaveTextContent("담당 팀을 확인하지 못했습니다");
  screen.getByRole("button", { name: "다시 시도" }).click();
  expect(mocks.retryRoles).toHaveBeenCalledOnce();
});
afterEach(cleanup);

it("팀 연결 응답을 기다리는 동안 '연결된 학기 없음'을 표시하지 않는다", () => {
  render(<TeamWorkspace teamKey="praise" />);
  act(() => mocks.semesters.mock.calls[0][0]([past]));
  expect(screen.getByRole("status")).toHaveTextContent("학기 연결을 확인하는 중입니다");
  expect(screen.queryByText("연결된 학기가 없습니다")).not.toBeInTheDocument();
  act(() => mocks.teams.mock.calls[0][1]([{ id: "team", name: "찬양팀", teamKey: "praise" } as Team]));
  expect(screen.getByText("지난 학기")).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: /지난 훈련 학기/ })).toHaveLength(2);
});

it("훈련에 지난 학기만 있을 때 현재 학기로 잘못 표시하지 않는다", () => {
  render(<TrainingHome />);
  act(() => mocks.semesters.mock.calls[0][0]([past]));
  expect(screen.getByText("지난 학기")).toBeInTheDocument();
  expect(screen.queryByText("현재 학기")).not.toBeInTheDocument();
});

it("훈련 목록 조회 오류를 학기 없음으로 안내하지 않는다", () => {
  render(<TrainingHome />);
  act(() => mocks.semesters.mock.calls[0][1](new Error("network unavailable")));
  expect(screen.getByRole("alert")).toHaveTextContent("훈련 정보를 불러오지 못했습니다");
  expect(screen.queryByText("등록된 학기가 없습니다")).not.toBeInTheDocument();
});
