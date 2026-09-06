/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PraiseStageVersion } from "../types";
import { PraiseStageHistory } from "./PraiseStageHistory";
import { PraiseStage } from "./PraiseStage";
import { praiseFixture } from "./praiseTestFixtures";

afterEach(() => { cleanup(); vi.useRealTimers(); });
function sourceView() {
  const view = praiseFixture(); view.people[0].name = "현재학생"; view.people[0].active = false;
  const version: PraiseStageVersion = { id: "past-confirmed", meetingId: "meeting-1", number: 2, kind: "CONFIRMED", createdAt: 2000, createdBy: "actor", inputRevision: "revision-1", worshipDate: "2026-09-06", config: { ...view.policy!.stage, leaderType: "STUDENT", leaderId: "student-2", staffOnly: false }, leaderName: "당시인도자", services: [{ department: "FIRST", assignments: [{ personType: "STUDENT", personId: "student-1", name: "당시학생", gender: "FEMALE", role: "SINGER", side: "LEFT", positionOrder: 0, reason: "합성", isManual: false }, { personType: "STUDENT", personId: "removed-student", name: "과거학생", gender: "FEMALE", role: "CHOIR", side: "RIGHT", positionOrder: 0, reason: "합성", isManual: false }] }], candidates: [], overrides: [], warnings: [], acknowledgedWarnings: true };
  view.stages = [version, { ...structuredClone(version), id: "second-confirmed", worshipDate: "2026-09-13", createdAt: 3000, number: 3, services: [], candidates: [{ personId: "student-1", eligible: true, reason: "PRIVATE_SENTINEL" }] }];
  return view;
}
function openHistory() {
  const summary = screen.getByText("학생별 과거 등단 기록"); const details = summary.closest("details")!;
  details.open = true; fireEvent(details, new Event("toggle"));
  return details;
}
function historyTable() { return screen.getByRole("table", { name: /학생별 최신 확정 등단 기록/ }); }

describe("학생별 과거 등단 이력표", () => {
  it("이관 등단표는 생성 후 데이터가 바뀌었다고 추정하지 않고 원본 조건 대조 한계를 표시한다", () => {
    const view = sourceView(); const version = view.stages[0];
    version.imported = true; version.inputRevision = "import:synthetic-source-checksum";
    view.stages = [version]; const execute = vi.fn();
    render(<PraiseStage view={view} meeting={view.meetings[0]} execute={execute} busy={true} />);
    expect(screen.getByText(/이관본의 생성 당시 조건은 현재 기록과 자동 대조할 수 없습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/출결·팀원·설정이 초안 생성 이후 바뀌었습니다/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수정 초안 저장" })).toBeDisabled();
    expect(execute).not.toHaveBeenCalled();
  });
  it("현재 사이트에서 생성한 초안의 조건 변경 경고는 유지한다", () => {
    const view = sourceView(); view.stages = [{ ...view.stages[0], inputRevision: "previous-native-revision" }];
    render(<PraiseStage view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={false} />);
    expect(screen.getByText(/출결·팀원·설정이 초안 생성 이후 바뀌었습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/이관본의 생성 당시 조건/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "수정 초안 저장" })).toBeDisabled();
  });
  it("확정 예배가 많으면 8주씩 렌더하고 조건 변경 시 첫 페이지로 이동한다", () => {
    const view = sourceView(); view.stages = Array.from({ length: 9 }, (_, index) => ({ ...view.stages[0], id: `version-${index}`, worshipDate: new Date(Date.UTC(2026, 8, 6 + 7 * index)).toISOString().slice(0, 10) }));
    render(<PraiseStageHistory view={view} />); openHistory();
    expect(within(historyTable()).getAllByRole("columnheader")).toHaveLength(10);
    expect(within(historyTable()).queryByText("2026-09-06")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "이전 기록" }));
    expect(within(historyTable()).getAllByRole("columnheader")).toHaveLength(3);
    expect(within(historyTable()).getByText("2026-09-06")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "이전 기록" })).toBeDisabled();
    fireEvent.change(screen.getByRole("searchbox", { name: "등단 이력 학생 검색" }), { target: { value: "현재학생" } });
    expect(within(historyTable()).getAllByRole("columnheader")).toHaveLength(10);
    expect(screen.getByRole("button", { name: "최근 기록" })).toBeDisabled();
  });
  it("한국 시간으로 지난 예배를 열면 최신 초안 대신 확정본이 선택된다", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T15:00:00Z"));
    const view = sourceView(); view.stages = [view.stages[0], { ...view.stages[0], id: "new-draft", number: 9, createdAt: 9000, kind: "MANUAL_DRAFT" }];
    const execute = vi.fn(); render(<PraiseStage view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    expect(screen.getByLabelText("저장된 등단표")).toHaveValue("past-confirmed");
    expect(execute).not.toHaveBeenCalled();
  });
  it("한국 시간으로 현재 예배는 최신 초안이 기본이며 예배 부서를 전환한다", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-09-06T14:59:59Z"));
    const view = sourceView(); const draft = { ...view.stages[0], id: "new-draft", number: 9, createdAt: 9000, kind: "MANUAL_DRAFT" as const };
    draft.services = [...draft.services, { department: "SECOND", assignments: [] }]; view.stages = [view.stages[0], draft];
    render(<PraiseStage view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={false} />);
    expect(screen.getByLabelText("저장된 등단표")).toHaveValue("new-draft");
    expect(screen.getByRole("button", { name: "1부 예배" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "2부 예배" }));
    expect(screen.getByRole("button", { name: "2부 예배" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "1부 예배" }).closest("section")?.className).toContain("inactiveService");
    expect(screen.getByRole("heading", { name: "2부 예배" }).closest("section")?.className).not.toContain("inactiveService");
  });
  it("상위 탭을 늘리지 않고 펼침을 연 뒤에만 조회 화면을 렌더한다", () => {
    render(<PraiseStageHistory view={sourceView()} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument(); openHistory();
    expect(historyTable()).toBeInTheDocument(); expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "학생별 등단 이력표" })).toHaveAttribute("tabindex", "0");
  });
  it("확정 당시 이름·현재 변경 이름·비활성·명단에서 빠진 학생을 함께 보존한다", () => {
    render(<PraiseStageHistory view={sourceView()} />); openHistory();
    const student = within(historyTable()).getByRole("rowheader", { name: /당시학생 현재 이름: 현재학생 현재 비활성/ });
    const row = within(student.closest("tr")!);
    expect(row.getByText("1부 싱어")).toBeInTheDocument(); expect(row.getByText("반에서 예배하기")).toBeInTheDocument(); expect(row.getByText("1회")).toBeInTheDocument();
    expect(within(historyTable()).getByRole("rowheader", { name: /과거학생 현재 명단에 없음/ })).toBeInTheDocument();
    expect(screen.queryByText("PRIVATE_SENTINEL")).not.toBeInTheDocument();
  });
  it("현재 이름과 저장된 당시 이름 모두 검색하고 검색·기간을 초기화한다", () => {
    render(<PraiseStageHistory view={sourceView()} />); openHistory();
    fireEvent.change(screen.getByRole("searchbox", { name: "등단 이력 학생 검색" }), { target: { value: "현재학생" } });
    expect(within(historyTable()).getAllByRole("rowheader")).toHaveLength(1);
    fireEvent.change(screen.getByRole("searchbox", { name: "등단 이력 학생 검색" }), { target: { value: "없는학생" } });
    expect(screen.getByText("검색한 학생의 등단 이력이 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "검색·기간 초기화" }));
    expect(within(historyTable()).getAllByRole("rowheader")).toHaveLength(3);
  });
  it("역순 날짜는 오류로 표시하고 기간 범위를 바꾸면 저장된 예배일로 필터한다", () => {
    render(<PraiseStageHistory view={sourceView()} />); openHistory();
    fireEvent.change(screen.getByLabelText("등단 이력 시작일"), { target: { value: "2026-09-13" } });
    expect(within(historyTable()).queryByText("2026-09-06")).not.toBeInTheDocument();
    expect(within(historyTable()).getByText("2026-09-13")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("등단 이력 종료일"), { target: { value: "2026-09-06" } });
    expect(screen.getByRole("alert")).toHaveTextContent("시작일이 종료일보다 늦습니다."); expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("기간 내 확정본이 없는 상태와 초안만 있는 상태를 구분한다", () => {
    const view = sourceView(); const { rerender } = render(<PraiseStageHistory view={view} />); openHistory();
    fireEvent.change(screen.getByLabelText("등단 이력 시작일"), { target: { value: "2026-10-01" } });
    expect(screen.getByText("선택한 기간에 확정된 등단표가 없습니다.")).toBeInTheDocument();
    rerender(<PraiseStageHistory view={{ people: view.people, stages: view.stages.map((version) => ({ ...version, kind: "AUTO_DRAFT" })) }} />);
    expect(screen.getByText("확정된 등단 이력이 아직 없습니다.")).toBeInTheDocument();
  });
  it("후보가 생략된 일반 스탭 조회에서는 기록 없음으로 남기고 출석을 추정하지 않는다", () => {
    const view = sourceView(); view.stages = [{ ...view.stages[1], candidates: [], overrides: [], services: [] }];
    render(<PraiseStageHistory view={view} />); openHistory();
    const student = within(historyTable()).getByRole("rowheader", { name: /현재학생/ }).closest("tr")!;
    expect(within(student).getByText("기록 없음")).toBeInTheDocument();
    expect(within(student).queryByText("반에서 예배하기")).not.toBeInTheDocument();
    expect(screen.getByText(/‘기록 없음’은 결석을 뜻하지 않으며/)).toBeInTheDocument();
  });
  it("이관본은 당시 이름이 아닌 내보내기 시점 이름이라는 설명을 표시한다", () => {
    const view = sourceView(); view.stages[0].imported = true; view.stages[0].nameSnapshotAsOf = "2026-09-06T01:00:00.000Z";
    render(<PraiseStageHistory view={view} />); openHistory();
    expect(screen.getByText(/이관본의 이름은 원본을 내보낸 시점의 명단 기준/)).toBeInTheDocument();
    expect(within(historyTable()).getByText("2차 확정 · 이관본")).toBeInTheDocument();
  });
  it("회차가 현재 목록에서 사라져도 기존 등단 화면에서 과거 기록을 펼칠 수 있다", () => {
    const view = sourceView(); const execute = vi.fn(); render(<PraiseStage view={view} meeting={null} execute={execute} busy={false} />); openHistory();
    expect(historyTable()).toBeInTheDocument(); expect(execute).not.toHaveBeenCalled();
  });
  it("원격 새 확정본이 도착해도 사용자 검색·기간을 유지한다", () => {
    const view = sourceView(); const { rerender } = render(<PraiseStageHistory view={view} />); openHistory();
    fireEvent.change(screen.getByRole("searchbox", { name: "등단 이력 학생 검색" }), { target: { value: "현재학생" } });
    fireEvent.change(screen.getByLabelText("등단 이력 종료일"), { target: { value: "2026-09-13" } });
    rerender(<PraiseStageHistory view={{ ...view, stages: [...view.stages, { ...view.stages[0], id: "new", worshipDate: "2026-09-20" }] }} />);
    expect(screen.getByRole("searchbox", { name: "등단 이력 학생 검색" })).toHaveValue("현재학생");
    expect(screen.getByLabelText("등단 이력 종료일")).toHaveValue("2026-09-13");
    expect(within(historyTable()).queryByText("2026-09-20")).not.toBeInTheDocument();
  });
});
