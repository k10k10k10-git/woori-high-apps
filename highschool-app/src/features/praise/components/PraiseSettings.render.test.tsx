/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ accounts: vi.fn(), references: vi.fn() }));
vi.mock("../api", () => ({ listPraiseAccounts: api.accounts, listPraiseReferences: api.references }));
import PraiseSettings from "./PraiseSettings";
import { createFirstMeetingGuide } from "../content/templates";
import { defaultPraisePolicy } from "../defaults";
import type { PraiseCommand, PraiseView } from "../types";

afterEach(cleanup);
beforeEach(() => {
  api.accounts.mockReset().mockResolvedValue({ accounts: [
    { uid: "uid-synthetic", name: "합성 기존 계정", roleLabel: "찬양팀" },
    { uid: "uid-another", name: "합성 새 계정", roleLabel: "찬양팀" },
  ] });
  api.references.mockReset().mockResolvedValue({ semesters: [
    { id: "semester-test", title: "합성 기본 학기", teams: [{ id: "praise", name: "합성 찬양팀" }] },
    { id: "semester-next", title: "합성 다음 학기", teams: [{ id: "praise-next", name: "합성 다음 찬양팀" }] },
  ] });
});
const stamp = { revision: 3, updatedAt: 1000, updatedBy: "synthetic-manager" };
function fixture(): PraiseView {
  return {
    meta: { ...stamp, id: "test-term", name: "합성 학기", startDate: "2026-09-01", endDate: "2026-12-31", mode: "setup", status: "active", semesterId: "semester-test", teamId: "praise" },
    permissions: { read: true, manage: true, stageEdit: true, attendanceAll: true, staffId: "staff-test", role: "manager" },
    people: [{ ...stamp, id: "staff-test", kind: "STAFF", name: "합성 스탭", grade: 0, gender: "UNSPECIFIED", department: "FIRST", team: "SINGER", active: true, isStudentLeader: false, singerCapable: true, groupStaffCapable: true, preferredService: "BOTH", excludeFromAutoSinger: false }],
    meetings: [{ ...stamp, id: "meeting-test", sequence: 1, title: "합성 첫 모임", date: "2026-09-06", worshipDate: "2026-09-06", cancelled: false, temporary: false, linkedSessionId: "session-test", groupVersionId: "group-test" }],
    policy: defaultPraisePolicy(1000, "synthetic-manager"), access: [{ ...stamp, uid: "uid-synthetic", staffId: "staff-test", role: "groupStaff", active: true }],
    guides: [{ ...stamp, meetingId: "meeting-test", published: false, content: createFirstMeetingGuide() }],
    attendance: {}, availability: {}, groups: [], stages: [], audit: [], imports: [], inputRevisions: {},
  };
}
function setup(view = fixture(), execute = vi.fn<(command: PraiseCommand) => Promise<boolean>>().mockResolvedValue(true)) {
  const result = render(<PraiseSettings view={view} execute={execute} busy={false} />);
  return { ...result, view, execute };
}
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

describe("찬양 운영 설정", () => {
  it("운영 책임자만 편집할 수 있다", () => {
    const view = fixture(); view.permissions.manage = false; view.permissions.role = "editor";
    const { execute } = setup(view);
    expect(screen.getByText("운영 설정은 운영 책임자만 변경할 수 있습니다.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(execute).not.toHaveBeenCalled();
    expect(api.accounts).not.toHaveBeenCalled();
    expect(api.references).not.toHaveBeenCalled();
  });

  it("학기 초안과 기준 버전은 원격 갱신으로 덮지 않는다", async () => {
    const { view, execute, rerender } = setup();
    click("학기 설정 편집");
    fireEvent.change(screen.getByLabelText("학기명"), { target: { value: "작성 중 학기" } });
    rerender(<PraiseSettings view={{ ...view, meta: { ...view.meta, revision: 8, name: "원격 학기" } }} execute={execute} busy={false} />);
    expect(screen.getByLabelText("학기명")).toHaveValue("작성 중 학기");
    fireEvent.change(screen.getByLabelText("운영 모드"), { target: { value: "live" } });
    click("학기 설정 저장");
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "meta.save", expectedRevision: 3, meta: expect.objectContaining({ name: "작성 중 학기", mode: "live" }) })));
    expect(await screen.findByRole("status")).toHaveTextContent("설정을 저장했습니다.");
  });

  it("작업공간을 바꾸면 이전 학기 초안을 제거한다", () => {
    const { view, execute, rerender } = setup(); click("학기 설정 편집");
    fireEvent.change(screen.getByLabelText("학기명"), { target: { value: "이전 초안" } });
    rerender(<PraiseSettings view={{ ...view, meta: { ...view.meta, id: "next-term", name: "다음 학기" } }} execute={execute} busy={false} />);
    expect(screen.queryByLabelText("학기명")).not.toBeInTheDocument();
    click("학기 설정 편집");
    expect(screen.getByLabelText("학기명")).toHaveValue("다음 학기");
  });

  it("학기와 사역팀은 이름으로 선택하며 학기를 바꾸면 기존 팀 선택을 비운다", async () => {
    const view = fixture(); delete view.meetings[0].linkedSessionId;
    const { execute } = setup(view); click("학기 설정 편집");
    await waitFor(() => expect(screen.getByLabelText("연결 학기")).not.toBeDisabled());
    expect(screen.getByRole("option", { name: "합성 기본 학기" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("연결 학기"), { target: { value: "semester-next" } });
    expect(screen.getByLabelText("연결 사역팀")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("연결 사역팀"), { target: { value: "praise-next" } }); click("학기 설정 저장");
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "meta.save", meta: expect.objectContaining({ semesterId: "semester-next", teamId: "praise-next" }) })));
  });

  it("연결 회차가 없을 때 학기 연결 안 함을 선택하면 학기·팀 연결을 함께 비운다", async () => {
    const view = fixture(); delete view.meetings[0].linkedSessionId;
    const { execute } = setup(view); click("학기 설정 편집");
    await waitFor(() => expect(screen.getByLabelText("연결 학기")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("연결 학기"), { target: { value: "" } }); click("학기 설정 저장");
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "meta.save", meta: expect.objectContaining({ semesterId: "", teamId: "" }) })));
  });

  it("공통 출석 연결 회차가 있으면 학기·사역팀 선택을 유지한다", async () => {
    setup(); click("학기 설정 편집");
    await screen.findByRole("option", { name: "합성 기본 학기" });
    expect(screen.getByLabelText("연결 학기")).toBeDisabled();
    expect(screen.getByLabelText("연결 사역팀")).toBeDisabled();
  });

  it("학기 목록 조회 실패 후 다시 불러올 수 있고 작성한 학기명은 보존한다", async () => {
    api.references.mockRejectedValueOnce(new Error("합성 학기 조회 오류"));
    const view = fixture(); delete view.meetings[0].linkedSessionId; setup(view); click("학기 설정 편집");
    fireEvent.change(screen.getByLabelText("학기명"), { target: { value: "보존할 학기명" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("합성 학기 조회 오류");
    expect(screen.getByLabelText("연결 학기")).toBeDisabled(); click("학기·사역팀 다시 불러오기");
    await waitFor(() => expect(screen.getByLabelText("연결 학기")).not.toBeDisabled());
    expect(screen.getByLabelText("학기명")).toHaveValue("보존할 학기명");
  });

  it("회차 수정은 연결된 조 버전을 보존하고 휴강·임시회차를 저장한다", async () => {
    const { execute } = setup(); click("합성 첫 모임 회차 편집");
    fireEvent.click(screen.getByLabelText("휴강")); fireEvent.click(screen.getByLabelText("임시회차"));
    fireEvent.change(screen.getByLabelText("예배일"), { target: { value: "2026-09-13" } }); click("회차 저장");
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "meeting.save", expectedRevision: 3, meeting: expect.objectContaining({ id: "meeting-test", groupVersionId: "group-test", linkedSessionId: "session-test", worshipDate: "2026-09-13", cancelled: true, temporary: true }) })));
  });

  it("새 회차는 고유 ID와 기준 버전 0으로 저장한다", async () => {
    const { execute } = setup(); click("회차 추가");
    fireEvent.change(screen.getByLabelText("회차 제목"), { target: { value: "합성 다음 모임" } }); click("회차 저장");
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "meeting.save", expectedRevision: 0, meeting: expect.objectContaining({ id: expect.stringMatching(/^meeting_/), sequence: 2, title: "합성 다음 모임" }) })));
  });

  it("담당 계정을 UID·스탭·역할로 연결한다", async () => {
    const view = fixture(); view.access = [];
    const { execute } = setup(view); click("담당 계정 추가");
    await waitFor(() => expect(screen.getByLabelText("담당자 계정")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("담당자 계정"), { target: { value: "uid-another" } });
    fireEvent.change(screen.getByLabelText("연결 스탭"), { target: { value: "staff-test" } });
    fireEvent.change(screen.getByLabelText("담당 역할"), { target: { value: "editor" } }); click("담당 계정 저장");
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "access.save", expectedRevision: 0, access: { uid: "uid-another", staffId: "staff-test", role: "editor", active: true } }));
  });

  it("이미 연결된 계정을 신규 계정으로 덮어쓰지 않는다", async () => {
    const { execute } = setup(); click("담당 계정 추가");
    await waitFor(() => expect(screen.getByLabelText("담당자 계정")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("담당자 계정"), { target: { value: "uid-synthetic" } });
    fireEvent.change(screen.getByLabelText("연결 스탭"), { target: { value: "staff-test" } }); click("담당 계정 저장");
    expect(screen.getByRole("alert")).toHaveTextContent("이미 연결된 계정"); expect(execute).not.toHaveBeenCalled();
  });

  it("한 스탭을 활성 담당 계정 두 개에 연결하지 않는다", async () => {
    const { execute } = setup(); click("담당 계정 추가");
    await waitFor(() => expect(screen.getByLabelText("담당자 계정")).not.toBeDisabled());
    fireEvent.change(screen.getByLabelText("담당자 계정"), { target: { value: "uid-another" } });
    fireEvent.change(screen.getByLabelText("연결 스탭"), { target: { value: "staff-test" } }); click("담당 계정 저장");
    expect(screen.getByRole("alert")).toHaveTextContent("다른 담당 계정이 연결"); expect(execute).not.toHaveBeenCalled();
  });

  it("등록 계정 조회 실패를 알리고 다시 불러올 수 있다", async () => {
    api.accounts.mockRejectedValueOnce(new Error("합성 계정 조회 오류"));
    setup(); expect(api.accounts).not.toHaveBeenCalled(); click("담당 계정 추가");
    expect(await screen.findByRole("alert")).toHaveTextContent("합성 계정 조회 오류");
    expect(screen.getByLabelText("담당자 계정")).toBeDisabled(); click("담당 계정 다시 불러오기");
    await waitFor(() => expect(screen.getByLabelText("담당자 계정")).not.toBeDisabled());
    expect(screen.getByRole("option", { name: "합성 새 계정 · 찬양팀" })).toBeInTheDocument();
    expect(screen.queryByText("uid-another")).not.toBeInTheDocument();
  });

  it("계정 편집을 닫은 뒤 도착한 이전 조회 결과는 사용하지 않는다", async () => {
    let finish!: (value: { accounts: { uid: string; name: string; roleLabel: string }[] }) => void;
    api.accounts.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    setup(); click("담당 계정 추가"); click("취소"); click("담당 계정 추가");
    await waitFor(() => expect(screen.getByLabelText("담당자 계정")).not.toBeDisabled());
    await act(async () => finish({ accounts: [{ uid: "stale-account", name: "과거 응답", roleLabel: "찬양팀" }] }));
    expect(screen.queryByRole("option", { name: "과거 응답 · 찬양팀" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "합성 새 계정 · 찬양팀" })).toBeInTheDocument();
  });

  it("등단 정책을 저장할 때 조 편성 정책을 보존한다", async () => {
    const { view, execute } = setup(); click("등단 정책 편집");
    fireEvent.change(screen.getByLabelText("학생 목표 비율(%)"), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText("1부 싱어 목표 인원"), { target: { value: "8" } }); click("등단 정책 저장");
    await waitFor(() => expect(execute).toHaveBeenCalledWith({ type: "policy.save", expectedRevision: view.policy!.revision, policy: { grouping: view.policy!.grouping, rules: view.policy!.rules, stage: { ...view.policy!.stage, studentRatio: .8, first: { ...view.policy!.stage.first, singerTarget: 8 } } } }));
  });

  it("가이드는 회차별 구조화 내용과 게시 여부를 저장한다", async () => {
    const { execute } = setup(); click("가이드 편집");
    expect(screen.getByLabelText("가이드 회차")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("나눔 장소"), { target: { value: "합성 나눔 장소" } });
    fireEvent.change(screen.getByLabelText("준비물·사전 준비 (한 줄에 하나)"), { target: { value: "합성 첫 준비물\n\n합성 둘째 준비물" } });
    fireEvent.click(screen.getByLabelText("가이드 게시")); click("가이드 저장·게시");
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "guide.save", expectedRevision: 3, guide: expect.objectContaining({ meetingId: "meeting-test", published: true, content: expect.objectContaining({ location: "합성 나눔 장소", preparation: ["합성 첫 준비물", "합성 둘째 준비물"] }) }) })));
  });

  it("가이드 게시 전에 장소를 입력하도록 안내한다", () => {
    const { execute } = setup(); click("가이드 편집"); fireEvent.click(screen.getByLabelText("가이드 게시")); click("가이드 저장·게시");
    expect(screen.getByRole("alert")).toHaveTextContent("가이드 제목·나눔 장소·진행 순서"); expect(execute).not.toHaveBeenCalled();
  });

  for (const mode of ["archived", "shadow"] as const) {
    it(`${mode} 상태에서는 학기 설정만 편집할 수 있다`, () => {
      const view = fixture();
      if (mode === "archived") view.meta.status = "archived"; else view.meta.mode = "shadow";
      setup(view); expect(screen.getByRole("button", { name: "회차 추가" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "담당 계정 추가" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "등단 정책 편집" })).toBeDisabled();
      click("학기 설정 편집"); expect(screen.getByLabelText("학기명")).not.toBeDisabled();
    });
  }

  it("템플릿 복제는 먼저 초안만 만들고 원격 갱신에도 수정 내용을 보존한다", async () => {
    const view = fixture(); view.guides[0].content.title = "합성 기존 가이드";
    const { execute, rerender } = setup(view); click("기본 템플릿 복제");
    expect(execute).not.toHaveBeenCalled(); expect(screen.getByLabelText("가이드 제목")).toHaveValue("찬양팀 첫 모임 가이드");
    fireEvent.change(screen.getByLabelText("가이드 제목"), { target: { value: "합성 편집 가이드" } });
    rerender(<PraiseSettings view={{ ...view, guides: [{ ...view.guides[0], revision: 9 }] }} execute={execute} busy={false} />);
    expect(screen.getByLabelText("가이드 제목")).toHaveValue("합성 편집 가이드"); click("가이드 미게시 저장");
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "guide.save", expectedRevision: 3, guide: expect.objectContaining({ content: expect.objectContaining({ title: "합성 편집 가이드" }) }) })));
  });

  it("저장 실패 시 초안을 보존하며 저장 중 중복 실행을 막는다", async () => {
    let finish!: (value: boolean) => void;
    const execute = vi.fn<(command: PraiseCommand) => Promise<boolean>>().mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    setup(fixture(), execute); click("학기 설정 편집");
    fireEvent.change(screen.getByLabelText("학기명"), { target: { value: "실패 보존 초안" } }); click("학기 설정 저장");
    expect(screen.getByLabelText("학기명")).toBeDisabled(); click("학기 설정 저장"); expect(execute).toHaveBeenCalledTimes(1);
    await act(async () => finish(false));
    expect(screen.getByRole("alert")).toHaveTextContent("입력 내용은 유지");
    expect(screen.getByLabelText("학기명")).toHaveValue("실패 보존 초안"); expect(screen.getByLabelText("학기명")).not.toBeDisabled();
  });
});
