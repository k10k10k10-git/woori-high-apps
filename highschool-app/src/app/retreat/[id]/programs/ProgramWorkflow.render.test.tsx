/** @vitest-environment jsdom */
import type { ReactNode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { programReadiness } from "@/lib/programPreparation";
import type { RetreatProgram } from "@/lib/types";
import ProgramPublicationPanel from "./ProgramPublicationPanel";
import ProgramMeetingMode from "./ProgramMeetingMode";
import { ProgramItemsSection, ProgramRolesSection } from "./ProgramSections";

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast }) }));
vi.mock("@/components/OverlayShell", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const prepared: RetreatProgram = {
  id: "program", title: "합성 공동체 프로그램", order: 1, kind: "main", status: "confirmed", createdAt: 1, updatedAt: 1,
  date: "2026-10-22", startTime: "14:00", place: "합성 장소", lead: "합성 담당자", objective: "서로 협력", flow: "소개 후 진행", briefing: "순서와 역할 안내",
  posts: { activity: { id: "activity", order: 1, name: "소개", activityType: "briefing", operationMode: "whole", rules: "진행 순서", testStatus: "notNeeded", createdAt: 1, updatedAt: 1 } },
  roles: { role: { id: "role", order: 1, postId: "activity", role: "진행", assignee: "합성 스탭", createdAt: 1, updatedAt: 1 } },
};

it("첫 현장 공유도 미저장 초안이 있으면 막고 저장 후에만 기존 공유 요청을 연다", () => {
  const onRequestPublish = vi.fn();
  const props = { program: prepared, groups: [], readiness: programReadiness(prepared), canEdit: true, busy: false, onRequestPublish, onRequestUnpublish: vi.fn() };
  expect(props.readiness.percent).toBe(100);
  const view = render(<ProgramPublicationPanel {...props} hasUnsavedChanges />);
  expect(screen.getByRole("button", { name: "현장에 공유" })).toBeDisabled();
  expect(screen.getByText(/먼저 초안을 저장한 뒤 현장에 공유/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "현장에 공유" }));
  expect(onRequestPublish).not.toHaveBeenCalled();
  view.rerender(<ProgramPublicationPanel {...props} hasUnsavedChanges={false} />);
  fireEvent.click(screen.getByRole("button", { name: "현장에 공유" }));
  expect(onRequestPublish).toHaveBeenCalledOnce();
});

it.each(["role", "item"])("%s 추가가 실패하면 입력을 보존하고 한 번의 재시도로 성공했을 때만 지운다", async (kind) => {
  let reject!: (reason: Error) => void;
  const onCreate = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
  const callbacks = { canEdit: true, onCreate, onUpdate: vi.fn(), onDelete: vi.fn(), onRestore: vi.fn() };
  if (kind === "role") render(<ProgramRolesSection {...callbacks} groups={[]} />);
  else render(<ProgramItemsSection {...callbacks} groups={[]} />);
  const input = screen.getByRole("textbox", { name: kind === "role" ? "프로그램 전체 역할" : "프로그램 공통 물품" });
  fireEvent.change(input, { target: { value: "합성 준비 항목" } });
  fireEvent.click(screen.getByRole("button", { name: "추가" }));
  expect(input).toBeDisabled();
  expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
  await act(async () => reject(new Error("저장 실패")));
  expect(input).toHaveValue("합성 준비 항목");
  expect(input).not.toBeDisabled();
  expect(toast).toHaveBeenCalledOnce();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "추가" })));
  expect(onCreate).toHaveBeenCalledTimes(2);
  expect(onCreate).toHaveBeenLastCalledWith("합성 준비 항목", 1);
  expect(input).toHaveValue("");
});


it("공유 해제도 미저장 본문이 있으면 막아 수정 내용을 저장된 것으로 처리하지 않는다", () => {
  const onRequestUnpublish = vi.fn();
  const props = { program: { ...prepared, status: "published" as const }, groups: [], readiness: programReadiness(prepared), canEdit: true, busy: false, onRequestPublish: vi.fn(), onRequestUnpublish };
  const view = render(<ProgramPublicationPanel {...props} hasUnsavedChanges />);
  expect(screen.getByRole("button", { name: "공유 해제" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "공유 해제" }));
  expect(onRequestUnpublish).not.toHaveBeenCalled();
  view.rerender(<ProgramPublicationPanel {...props} hasUnsavedChanges={false} />);
  fireEvent.click(screen.getByRole("button", { name: "공유 해제" }));
  expect(onRequestUnpublish).toHaveBeenCalledOnce();
});

const meetingProgram = {
  ...prepared,
  meetings: {
    old: { id: "old", title: "합성 이전 회의", date: "2026-10-01", closed: true, notes: "이전 논의", createdAt: 1, updatedAt: 1 },
    latest: { id: "latest", title: "합성 현재 회의", date: "2026-10-20", notes: "현재 논의", createdAt: 2, updatedAt: 2 },
  },
};
const meetingCallbacks = { onClose: vi.fn(), onCreateMeeting: vi.fn(), onUpdateMeeting: vi.fn(), onCreateDecision: vi.fn(), onUpdateDecision: vi.fn(), onConvertDecision: vi.fn() };

it("회의록에서 지정한 과거 회의를 열어 진행 중인 다른 회의와 혼동하지 않는다", () => {
  render(<ProgramMeetingMode program={meetingProgram} posts={[]} canEdit initialMeetingId="old" {...meetingCallbacks} />);
  expect(screen.getByRole("textbox", { name: "합성 이전 회의 논의 메모" })).toHaveValue("이전 논의");
  expect(screen.queryByRole("textbox", { name: "합성 현재 회의 논의 메모" })).not.toBeInTheDocument();
});

it("찾을 수 없는 회의 링크는 다른 기록을 임의로 열지 않고 선택할 수 있는 목록을 남긴다", () => {
  render(<ProgramMeetingMode program={meetingProgram} posts={[]} canEdit initialMeetingId="missing" {...meetingCallbacks} />);
  expect(screen.getByRole("heading", { name: "연결된 회의를 찾을 수 없습니다" })).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "합성 현재 회의 논의 메모" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /합성 이전 회의/ }));
  expect(screen.getByRole("textbox", { name: "합성 이전 회의 논의 메모" })).toHaveValue("이전 논의");
});
