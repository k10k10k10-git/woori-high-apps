/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";
import type { RetreatProgram } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  retreat: vi.fn(), programs: vi.fn(), groups: vi.fn(), meetings: vi.fn(), mergeCache: vi.fn(), toast: vi.fn(),
  save: vi.fn(), publish: vi.fn(), unpublish: vi.fn(),
  router: { push: vi.fn() }, query: "workspace=programs&program=second&section=overview",
  auth: {
    user: { uid: "fixture-admin", email: "admin@example.test" }, loading: false, roleError: false,
    roles: { semester: "superAdmin", retreat: "superAdmin" } as MinistryRoles,
    retryRoles: vi.fn(), signIn: vi.fn(),
  },
  pin: { lock: null as null | undefined, unlocked: true, lockError: null as string | null, markUnlocked: vi.fn(), retryLock: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "fixture-retreat" }), useRouter: () => mocks.router, useSearchParams: () => new URLSearchParams(mocks.query) }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mocks.toast }) }));
vi.mock("@/features/portal/useRetreatPinGate", () => ({ useRetreatPinGate: () => mocks.pin }));
vi.mock("@/lib/db", () => ({
  subscribeToRetreat: mocks.retreat, subscribeToRetreatPrograms: mocks.programs,
  subscribeToGroups: mocks.groups, subscribeToRetreatProgramMeetings: mocks.meetings,
  updateRetreatProgram: mocks.save, publishRetreatProgramRelease: mocks.publish, unpublishRetreatProgramRelease: mocks.unpublish,
}));
vi.mock("@/lib/retreatWorkspaceCache", () => ({ getRetreatWorkspaceSnapshot: () => null, mergeRetreatWorkspaceSnapshot: mocks.mergeCache }));
vi.mock("./ProgramWorkspaceHeader", () => ({ default: ({ children }: { children: ReactNode }) => <header>{children}</header> }));
vi.mock("../field/RetreatPinGate", () => ({ default: () => <p>PIN 입력</p> }));
vi.mock("./ProgramList", () => ({ default: () => <p>프로그램 목록</p> }));
vi.mock("./ProgramWorkspaceViews", () => ({
  ProgramCatalog: () => <p>프로그램 목록</p>, ProgramCollaborationWorkspace: () => null,
  ProgramResourcesWorkspace: () => null, ProgramScheduleWorkspace: () => null, ProgramSupplyWorkspace: () => null,
}));
// 편집기 내부 기능 대신 실제 부모의 mount·props 계약을 검증한다. local draft가 살아 있는지 관찰한다.
vi.mock("./ProgramEditor", () => ({ default: function EditorFixture({ program, canEdit, meetingsAvailable, onSave, onPublish, onUnpublish }: {
  program: RetreatProgram; canEdit: boolean; meetingsAvailable: boolean;
  onSave: (program: RetreatProgram) => Promise<void>; onPublish: (updatedAt: number) => Promise<void>; onUnpublish: () => Promise<void>;
}) {
  const [draft, setDraft] = useState("");
  return <section>
    <h2>{program.title}</h2>
    <label>작성 중인 초안<input value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
    <button disabled={!canEdit} onClick={() => void onSave(program).catch(() => {})}>초안 저장</button>
    <button disabled={!canEdit} onClick={() => void onPublish(program.updatedAt).catch(() => {})}>현장에 공유</button>
    <button disabled={!canEdit} onClick={() => void onUnpublish().catch(() => {})}>현장 공유 해제</button>
    <span data-testid="meeting-availability">{meetingsAvailable ? "회의 사용 가능" : "회의 사용 불가"}</span>
    <span data-testid="private-meetings">{Object.keys(program.meetings ?? {}).join(",")}</span>
  </section>;
} }));

import ProgramPreparationClient from "./ProgramPreparationClient";

const programs = [
  { id: "first", title: "첫 프로그램", order: 1, kind: "main", status: "draft", createdAt: 1, updatedAt: 1 },
  { id: "second", title: "두 번째 프로그램", order: 2, kind: "post", status: "draft", createdAt: 1, updatedAt: 1 },
];
function deliverPublic() {
  mocks.retreat.mock.calls.at(-1)![1]({ id: "fixture-retreat", name: "가상 수련회" });
  mocks.programs.mock.calls.at(-1)![1](programs);
  mocks.groups.mock.calls.at(-1)![1]([]);
}
function deliverAll() {
  deliverPublic();
  mocks.meetings.mock.calls.at(-1)![1]({});
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { uid: "fixture-admin", email: "admin@example.test" };
  mocks.auth.roles = { semester: "superAdmin", retreat: "superAdmin" };
  mocks.auth.roleError = false;
  mocks.auth.loading = false;
  mocks.pin.lock = null;
  mocks.pin.lockError = null;
  mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.publish.mockReset().mockResolvedValue("fixture-release");
  mocks.unpublish.mockReset().mockResolvedValue(undefined);
  for (const subscribe of [mocks.retreat, mocks.programs, mocks.groups, mocks.meetings]) subscribe.mockReturnValue(() => {});
});
afterEach(cleanup);

it("첫 자료 조회 실패를 빈 프로그램과 구분하고 재시도 성공으로 업무를 연다", () => {
  render(<ProgramPreparationClient />);
  expect(screen.queryByText("프로그램 목록")).not.toBeInTheDocument();
  act(() => mocks.programs.mock.calls[0][2](new Error("PERMISSION_DENIED /private/node")));
  expect(screen.getByRole("alert")).toHaveTextContent("프로그램 준비 자료를 불러오지 못했습니다");
  expect(screen.queryByText(/PERMISSION_DENIED|private/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  for (const subscribe of [mocks.retreat, mocks.programs, mocks.groups, mocks.meetings]) expect(subscribe).toHaveBeenCalledTimes(2);
  act(deliverAll);
  expect(screen.getByRole("heading", { name: "두 번째 프로그램" })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("공개 자료 재시도는 선택과 작성 중인 초안을 유지하고 오래된 콜백을 무시한다", () => {
  const stop = vi.fn();
  mocks.programs.mockReturnValue(stop);
  render(<ProgramPreparationClient />);
  act(deliverAll);
  fireEvent.change(screen.getByRole("textbox", { name: "작성 중인 초안" }), { target: { value: "아직 저장하지 않은 기획" } });
  const oldSuccess = mocks.programs.mock.calls[0][1];
  const oldFailure = mocks.programs.mock.calls[0][2];
  act(() => oldFailure(new Error("INTERNAL /programs")));
  expect(screen.getByRole("button", { name: "초안 저장" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.getByRole("textbox", { name: "작성 중인 초안" })).toHaveValue("아직 저장하지 않은 기획");
  act(() => {
    oldSuccess([]);
    oldFailure(new Error("늦은 이전 오류"));
  });
  expect(screen.getByRole("heading", { name: "두 번째 프로그램" })).toBeInTheDocument();
  expect(mocks.mergeCache.mock.calls.filter(([, snapshot]) => snapshot.programs?.length === 0)).toHaveLength(0);
  act(deliverAll);
  expect(screen.getByRole("textbox", { name: "작성 중인 초안" })).toHaveValue("아직 저장하지 않은 기획");
  expect(screen.getByRole("button", { name: "초안 저장" })).not.toBeDisabled();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(mocks.query).toContain("program=second");
});

it("회의 실패는 private 기록을 닫고 본문 초안은 유지하며 실제 재구독으로 회복한다", () => {
  render(<ProgramPreparationClient />);
  act(() => {
    deliverPublic();
    mocks.meetings.mock.calls[0][1]({ second: { "private-fixture": { id: "private-fixture" } } });
  });
  expect(screen.getByTestId("private-meetings")).toHaveTextContent("private-fixture");
  fireEvent.change(screen.getByRole("textbox", { name: "작성 중인 초안" }), { target: { value: "본문 초안" } });
  const oldSuccess = mocks.meetings.mock.calls[0][1];
  const oldFailure = mocks.meetings.mock.calls[0][2];
  act(() => oldFailure(new Error("PERMISSION_DENIED /programMeetings")));
  expect(screen.getByRole("alert")).toHaveTextContent("준비회의 기록을 불러오지 못했습니다");
  expect(screen.getByTestId("private-meetings")).toBeEmptyDOMElement();
  expect(screen.getByTestId("meeting-availability")).toHaveTextContent("회의 사용 불가");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  act(() => oldSuccess({ second: { "obsolete-private": { id: "obsolete-private" } } }));
  expect(screen.getByTestId("private-meetings")).toBeEmptyDOMElement();
  act(deliverAll);
  expect(screen.getByTestId("meeting-availability")).toHaveTextContent("회의 사용 가능");
  expect(screen.getByRole("textbox", { name: "작성 중인 초안" })).toHaveValue("본문 초안");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("각 공개 구독 오류는 해당 성공 응답으로만 해제한다", () => {
  render(<ProgramPreparationClient />);
  act(deliverAll);
  act(() => {
    mocks.programs.mock.calls[0][2](new Error("프로그램 내부 오류"));
    mocks.groups.mock.calls[0][2](new Error("조 내부 오류"));
  });
  expect(screen.getByRole("alert")).toHaveTextContent("프로그램 정보 · 조 편성 정보");
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  act(() => mocks.programs.mock.calls.at(-1)![1](programs));
  expect(screen.getByRole("alert")).toHaveTextContent("조 편성 정보");
  expect(screen.getByRole("button", { name: "초안 저장" })).toBeDisabled();
  act(() => mocks.groups.mock.calls.at(-1)![1]([]));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("PIN 실패를 끝없는 로딩보다 먼저 보여 주고 실제 잠금 재시도를 연결한다", () => {
  mocks.pin.lock = undefined;
  mocks.pin.lockError = "INTERNAL /accessLock";
  render(<ProgramPreparationClient />);
  expect(screen.getByRole("alert")).toHaveTextContent("프로그램 준비 입장 상태를 확인하지 못했습니다");
  expect(screen.queryByText(/INTERNAL|accessLock/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
  expect(mocks.pin.retryLock).toHaveBeenCalledOnce();
});

it("권한 조회 실패와 실제 접근 제한에서는 보호된 자료를 구독하지 않는다", () => {
  mocks.auth.roleError = true;
  const view = render(<ProgramPreparationClient />);
  fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
  expect(mocks.auth.retryRoles).toHaveBeenCalledOnce();
  expect(mocks.programs).not.toHaveBeenCalled();
  mocks.auth.roleError = false;
  mocks.auth.roles = { semester: "none", retreat: "none" };
  view.rerender(<ProgramPreparationClient />);
  expect(screen.getByRole("heading")).toHaveTextContent("프로그램 준비 접근 권한이 필요합니다");
  expect(mocks.retreat).not.toHaveBeenCalled();
  expect(mocks.meetings).not.toHaveBeenCalled();
});

it("계정이 바뀌면 이전 private 기록과 초안을 초기화한다", () => {
  const view = render(<ProgramPreparationClient />);
  act(deliverAll);
  fireEvent.change(screen.getByRole("textbox", { name: "작성 중인 초안" }), { target: { value: "이전 계정 초안" } });
  mocks.auth.user = { uid: "another-admin", email: "another@example.test" };
  view.rerender(<ProgramPreparationClient />);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  act(deliverAll);
  expect(screen.getByRole("textbox", { name: "작성 중인 초안" })).toHaveValue("");
  expect(screen.getByTestId("private-meetings")).toBeEmptyDOMElement();
});

it("저장 기술 오류는 초안 복구 안내로 바꾸고 원문을 표시하지 않는다", async () => {
  mocks.save.mockRejectedValue(new Error("PERMISSION_DENIED /retreats/private"));
  render(<ProgramPreparationClient />);
  act(deliverAll);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "초안 저장" })));
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.toast).toHaveBeenCalledWith("프로그램을 저장하지 못했습니다. 작성 중인 초안은 유지됩니다. 연결 상태를 확인한 뒤 다시 저장해 주세요.", "error");
  expect(mocks.toast.mock.calls.flat().join(" ")).not.toContain("PERMISSION_DENIED");
});

it.each([
  "활동 기록을 남기려면 로그인 상태를 확인해 주세요. 새로고침 후 다시 저장해 주세요.",
  "저장 중 로그인 계정이 변경되었습니다. 새로고침 후 다시 저장해 주세요.",
])("저장 판단에 필요한 계정 안내를 유지한다: %s", async (message) => {
  mocks.save.mockRejectedValue(new Error(message));
  render(<ProgramPreparationClient />);
  act(deliverAll);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "초안 저장" })));
  expect(mocks.toast).toHaveBeenCalledWith(message, "error");
});

it.each([
  "프로그램이 삭제되어 현장에 공유하지 못했습니다.",
  "다른 변경이 먼저 반영되었습니다. 최신 내용을 확인한 뒤 다시 공유해 주세요.",
  "현장 준비와 실행 할 일을 모두 완료한 뒤 공유해 주세요.",
])("현장 공유 실패를 숨기지 않고 판단에 필요한 안내를 유지한다: %s", async (message) => {
  mocks.publish.mockRejectedValue(new Error(message));
  render(<ProgramPreparationClient />);
  act(deliverAll);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "현장에 공유" })));
  expect(mocks.publish).toHaveBeenCalledExactlyOnceWith("fixture-retreat", "second", 1);
  expect(mocks.toast).toHaveBeenCalledWith(message, "error");
});

it("공유·해제 기술 오류는 친절한 업무 안내로 바꾸고 중복 DB 요청을 하지 않는다", async () => {
  mocks.publish.mockRejectedValue(new Error("UNAVAILABLE /releases"));
  mocks.unpublish.mockRejectedValue(new Error("PERMISSION_DENIED /programs"));
  render(<ProgramPreparationClient />);
  act(deliverAll);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "현장에 공유" })));
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "현장 공유 해제" })));
  expect(mocks.publish).toHaveBeenCalledOnce();
  expect(mocks.unpublish).toHaveBeenCalledExactlyOnceWith("fixture-retreat", "second");
  expect(mocks.toast).toHaveBeenCalledWith("프로그램을 현장에 공유하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", "error");
  expect(mocks.toast).toHaveBeenCalledWith("현장 공유 상태를 변경하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", "error");
  expect(mocks.toast.mock.calls.flat().join(" ")).not.toMatch(/UNAVAILABLE|PERMISSION_DENIED/);
});

it("업무 저장 후 로그 실패는 다시 저장하라는 안내로 바꾸지 않는다", async () => {
  mocks.publish.mockRejectedValue(Object.assign(new Error("internal log failure"), { businessCommitted: true }));
  render(<ProgramPreparationClient />);
  act(deliverAll);
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "현장에 공유" })));
  expect(mocks.toast).toHaveBeenCalledWith("업무는 저장됐으나 활동 로그 저장에 실패했습니다. 새로고침 후 확인해 주세요.", "error");
  expect(mocks.publish).toHaveBeenCalledOnce();
});
