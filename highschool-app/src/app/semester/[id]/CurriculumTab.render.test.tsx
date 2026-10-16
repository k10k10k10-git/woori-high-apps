/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Team } from "@/features/semester/types";

const mock = vi.hoisted(() => ({ goal: vi.fn(), plan: vi.fn(), toast: vi.fn() }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mock.toast }) }));
vi.mock("@/features/semester/db", () => ({
  subscribeCurriculum: (_sid: string, _team: string, receive: (value: unknown) => void) => { receive({ meeting: { plan: "기존 계획" } }); return () => {}; },
  updateTeam: mock.goal, updateCurriculumEntry: mock.plan,
}));
import CurriculumTab from "./CurriculumTab";
const team: Team = { id: "team", name: "합성 팀", color: "", order: 1, goal: "기존 목표" };
const props = { sid: "2026-2", teams: [team], trainingClasses: [], sessions: [{ id: "meeting", date: "2026-09-12", type: "정규" as const }] };
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it("목표는 칸을 벗어나 저장하며 실패한 입력을 보존하고 재시도할 수 있다", async () => {
  let reject!: (error: Error) => void;
  mock.goal.mockImplementationOnce(() => new Promise<void>((_resolve, no) => { reject = no; })).mockResolvedValue(undefined);
  render(<CurriculumTab {...props} />);
  const input = screen.getByRole("textbox", { name: "합성 팀 이번 학기 목표" });
  fireEvent.change(input, { target: { value: "새 목표" } });
  expect(screen.getByRole("status")).toHaveTextContent("미저장");
  expect(mock.goal).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(screen.getByRole("status")).toHaveTextContent("저장 중");
  await act(async () => reject(new Error("합성 저장 오류")));
  expect(screen.getByRole("status")).toHaveTextContent("저장 실패");
  expect(input).toHaveValue("새 목표");
  fireEvent.blur(input);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("저장 완료"));
  expect(mock.goal).toHaveBeenLastCalledWith("2026-2", "team", { goal: "새 목표" });
});

it("기존 값으로 되돌린 계획은 저장 요청과 잘못된 미저장 표시를 남기지 않는다", () => {
  render(<CurriculumTab {...props} />);
  const input = screen.getByRole("textbox", { name: "2026-09-12 계획" });
  fireEvent.change(input, { target: { value: "수정한 계획" } });
  expect(screen.getByRole("status")).toHaveTextContent("미저장");
  fireEvent.change(input, { target: { value: "기존 계획" } });
  fireEvent.blur(input);
  expect(mock.plan).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("팀 전환 뒤 이전 목표 저장이 끝나도 새 팀의 작성 중인 목표를 지우지 않는다", async () => {
  let resolve!: () => void;
  mock.goal.mockImplementation(() => new Promise<void>((yes) => { resolve = yes; }));
  const second = { ...team, id: "second", name: "두 번째 팀" };
  const { rerender } = render(<CurriculumTab {...props} teams={[team, second]} lockedTeamId="team" />);
  const firstInput = screen.getByRole("textbox", { name: "합성 팀 이번 학기 목표" });
  fireEvent.change(firstInput, { target: { value: "첫 팀 목표" } }); fireEvent.blur(firstInput);
  rerender(<CurriculumTab {...props} teams={[team, second]} lockedTeamId="second" />);
  const secondInput = screen.getByRole("textbox", { name: "두 번째 팀 이번 학기 목표" });
  fireEvent.change(secondInput, { target: { value: "새 팀 목표" } });
  await act(async () => resolve());
  expect(secondInput).toHaveValue("새 팀 목표");
  expect(screen.getByRole("status")).toHaveTextContent("미저장");
});
