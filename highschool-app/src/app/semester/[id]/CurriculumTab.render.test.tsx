/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Team } from "@/features/semester/types";

const mock = vi.hoisted(() => ({ goal: vi.fn(), plan: vi.fn(), toast: vi.fn(), subscribe: vi.fn() }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mock.toast }) }));
vi.mock("@/features/semester/db", () => ({
  subscribeCurriculum: mock.subscribe,
  updateTeam: mock.goal, updateCurriculumEntry: mock.plan,
}));
import CurriculumTab from "./CurriculumTab";
import { SemesterEditProvider } from "@/features/semester/EditContext";
const team: Team = { id: "team", name: "합성 팀", color: "", order: 1, goal: "기존 목표" };
const props = { sid: "2026-2", teams: [team], trainingClasses: [], sessions: [{ id: "meeting", date: "2026-09-12", type: "정규" as const }] };
beforeEach(() => {
  mock.subscribe.mockImplementation((_sid: string, _team: string, receive: (value: unknown) => void) => { receive({ meeting: { plan: "기존 계획" } }); return () => {}; });
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });

it.each([undefined, "/operations/semesters/2026-2"])("회차가 없으면 권한에 맞는 실제 학기 설정 경로를 안내한다 (%s)", (operationsBaseHref) => {
  render(<CurriculumTab {...props} sessions={[]} operationsBaseHref={operationsBaseHref} />);
  if (operationsBaseHref) expect(screen.getByRole("link", { name: "학기 운영 설정 열기" })).toHaveAttribute("href", "/operations/semesters/2026-2/settings");
  else {
    expect(screen.getByText(/담당 교역자 또는 행정팀에 이 학기의 회차 등록을 요청/)).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  }
  expect(screen.queryByText(/설정 탭/)).not.toBeInTheDocument();
});

it.each(["team", "training"] as const)("%s 구분이 비어 있으면 조회자에게 직접 설정을 요구하지 않는다", (lockedScope) => {
  render(<SemesterEditProvider canEdit={false}><CurriculumTab {...props} teams={[]} lockedScope={lockedScope} /></SemesterEditProvider>);
  expect(screen.getByText(/담당 교역자 또는 행정팀에 학기 설정을 확인/)).toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByText(/설정 탭/)).not.toBeInTheDocument();
});

it("빈 훈련반의 운영 담당자는 선택한 학기 설정으로 이동한다", () => {
  render(<CurriculumTab {...props} lockedScope="training" operationsBaseHref="/operations/semesters/2026-2" />);
  expect(screen.getByRole("link", { name: "학기 운영 설정 열기" })).toHaveAttribute("href", "/operations/semesters/2026-2/settings");
});

it("목표는 칸을 벗어나 저장하며 실패한 입력을 보존하고 재시도할 수 있다", async () => {
  let reject!: (error: Error) => void;
  mock.goal.mockImplementationOnce(() => new Promise<void>((_resolve, no) => { reject = no; })).mockResolvedValue(undefined);
  render(<CurriculumTab {...props} />);
  const input = screen.getByRole("textbox", { name: "합성 팀 이번 학기 목표" });
  fireEvent.change(input, { target: { value: "새 목표" } });
  expect(screen.getByRole("status")).toHaveTextContent("미저장");
  expect(mock.goal).not.toHaveBeenCalled();
  fireEvent.blur(input);
  expect(input).toBeDisabled();
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

it("실패한 계획과 목표는 다른 팀으로 이동했다 돌아와도 남고 버튼으로 다시 저장한다", async () => {
  mock.goal.mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValue(undefined);
  mock.plan.mockRejectedValueOnce(new Error("저장 실패")).mockResolvedValue(undefined);
  const second = { ...team, id: "second", name: "다른 팀" };
  render(<CurriculumTab {...props} teams={[team, second]} />);
  fireEvent.change(screen.getByRole("textbox", { name: "합성 팀 이번 학기 목표" }), { target: { value: "보존할 목표" } });
  fireEvent.blur(screen.getByRole("textbox", { name: "합성 팀 이번 학기 목표" }));
  fireEvent.change(screen.getByRole("textbox", { name: "2026-09-12 계획" }), { target: { value: "보존할 계획" } });
  fireEvent.blur(screen.getByRole("textbox", { name: "2026-09-12 계획" }));
  await screen.findByRole("button", { name: "2026-09-12 계획 다시 저장" });
  fireEvent.click(screen.getByRole("tab", { name: "다른 팀" }));
  fireEvent.click(screen.getByRole("tab", { name: "합성 팀" }));
  expect(screen.getByRole("textbox", { name: "합성 팀 이번 학기 목표" })).toHaveValue("보존할 목표");
  expect(screen.getByRole("textbox", { name: "2026-09-12 계획" })).toHaveValue("보존할 계획");
  fireEvent.click(screen.getByRole("button", { name: "팀 목표 다시 저장" }));
  fireEvent.click(screen.getByRole("button", { name: "2026-09-12 계획 다시 저장" }));
  await waitFor(() => expect(screen.queryByText(/저장 실패/)).not.toBeInTheDocument());
  expect(mock.plan).toHaveBeenLastCalledWith("2026-2", "team", "meeting", { plan: "보존할 계획" });
});

it("새 반의 응답 전에는 이전 계획을 숨기고, 해제된 구독 응답도 무시한다", () => {
  const receivers: Record<string, (value: unknown) => void> = {};
  mock.subscribe.mockImplementation((_sid: string, id: string, receive: (value: unknown) => void) => {
    receivers[id] = receive;
    if (id === "first") receive({ meeting: { plan: "첫 반 계획" } });
    return () => {};
  });
  render(<CurriculumTab {...props} lockedScope="training" trainingClasses={[
    { id: "first", name: "첫 반", order: 1, color: "" }, { id: "second", name: "둘째 반", order: 2, color: "" },
  ]} />);
  expect(screen.getByRole("textbox")).toHaveValue("첫 반 계획");
  fireEvent.click(screen.getByRole("tab", { name: "둘째 반" }));
  expect(screen.getByRole("textbox")).toHaveValue("");
  expect(screen.getByRole("textbox")).toBeDisabled();
  act(() => receivers.first({ meeting: { plan: "늦게 온 첫 반" } }));
  expect(screen.getByRole("textbox")).toHaveValue("");
  act(() => receivers.second({ meeting: { plan: "둘째 반 계획" } }));
  expect(screen.getByRole("textbox")).toHaveValue("둘째 반 계획");
  expect(screen.getByRole("textbox")).toBeEnabled();
  expect(mock.plan).not.toHaveBeenCalled();
});

it("읽기 실패는 기술 원문 대신 복구 버튼을 보여주고 재구독한다", () => {
  mock.subscribe.mockImplementationOnce((_sid, _id, _receive, fail) => { fail(new Error("PERMISSION_DENIED/private-path")); return () => {}; });
  render(<CurriculumTab {...props} />);
  expect(screen.getByRole("textbox", { name: "2026-09-12 계획" })).toBeDisabled();
  expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(mock.subscribe).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "2026-09-12 계획" })).toBeEnabled();
});

it("로컬 구독에 먼저 보였다가 저장이 거절돼 되돌아와도 실패 초안을 유지한다", async () => {
  let receive!: (value: unknown) => void;
  mock.subscribe.mockImplementation((_sid, _id, callback) => { receive = callback; receive({ meeting: { plan: "원래 계획" } }); return () => {}; });
  mock.plan.mockImplementation(async () => {
    receive({ meeting: { plan: "지킬 초안" } });
    await Promise.resolve();
    receive({ meeting: { plan: "원래 계획" } });
    throw new Error("서버 거절");
  });
  render(<CurriculumTab {...props} />);
  const input = screen.getByRole("textbox", { name: "2026-09-12 계획" });
  fireEvent.change(input, { target: { value: "지킬 초안" } });
  fireEvent.blur(input);
  await screen.findByRole("button", { name: "2026-09-12 계획 다시 저장" });
  expect(input).toHaveValue("지킬 초안");
});
