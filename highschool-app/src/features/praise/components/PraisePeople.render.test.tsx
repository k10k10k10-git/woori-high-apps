/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listPraiseRoster } from "../api";
import type { PraiseView } from "../types";
import { PraisePeople } from "./PraisePeople";
import { praiseFixture } from "./praiseTestFixtures";

vi.mock("../api", () => ({ listPraiseRoster: vi.fn() }));
const loadRoster = vi.mocked(listPraiseRoster);
type RosterResult = Awaited<ReturnType<typeof listPraiseRoster>>;
function sourceRoster(): RosterResult {
  return { semesterHref: "/semester/2026-autumn?tab=%EB%B0%B0%EC%B9%98", people: [
    { applicationKey: "second-student", kind: "STUDENT", name: "합성연결학생", grade: 2, department: "SECOND", rosterLink: { applicationKey: "second-student", personId: "person_student_source_a", studentId: "source-a", year: "2026", classKey: "2-2-1" } },
    { applicationKey: "first-student", kind: "STUDENT", name: "합성연결학생", grade: 1, department: "FIRST", rosterLink: { applicationKey: "first-student", personId: "person_student_source_b", studentId: "source-b", year: "2026", classKey: "1-1-1" } },
    { applicationKey: "staff-source", kind: "STAFF", name: "합성연결스탭", grade: 0, department: "FIRST", rosterLink: { applicationKey: "staff-source", personId: "person_staff_source", staffId: "source-staff", year: "2026" } },
  ] };
}
function setup(view: PraiseView = praiseFixture(), execute = vi.fn().mockResolvedValue(true), busy = false) {
  return { view, execute, ...render(<PraisePeople view={view} execute={execute} busy={busy} />) };
}
function openNew() { fireEvent.click(screen.getByRole("button", { name: "팀원 등록" })); }
async function loaded() { await waitFor(() => expect(screen.queryByText("학기 명단을 불러오는 중입니다.")).not.toBeInTheDocument()); }
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
beforeEach(() => { loadRoster.mockReset().mockResolvedValue(sourceRoster()); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("찬양팀 기존 학기 명단 연결", () => {
  it("관리자가 편집을 열 때만 명단을 조회한다", async () => {
    setup(); expect(loadRoster).not.toHaveBeenCalled(); openNew(); await loaded();
    expect(loadRoster).toHaveBeenCalledWith("synthetic-workspace", expect.any(AbortSignal));
    expect(screen.getByRole("link", { name: "학기 배치 명단 관리 (새 탭)" })).toHaveAttribute("href", sourceRoster().semesterHref);
  });
  it("조회 권한만 있는 사용자는 등록·연결 편집과 명단 조회를 하지 않는다", () => {
    const view = praiseFixture(); view.permissions.manage = false; setup(view);
    expect(screen.queryByRole("button", { name: "팀원 등록" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "합성학생가" })).not.toBeInTheDocument();
    expect(screen.queryByText("학기 명단 미연결")).not.toBeInTheDocument();
    expect(loadRoster).not.toHaveBeenCalled();
  });
  it("동명이인을 부서·학년으로 찾고 직접 선택해야 기본정보와 연결을 저장한다", async () => {
    const { execute } = setup(); openNew(); await loaded();
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SESSION" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "학기 명단 검색" }), { target: { value: "2학년" } });
    expect(screen.getByRole("option", { name: "합성연결학생 · 2부 2학년" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "합성연결학생 · 1부 1학년" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "second-student" } });
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성연결학생");
    expect(screen.getByLabelText("이름", { exact: true })).toHaveAttribute("readonly");
    expect(screen.getByLabelText("학년", { exact: true })).toBeDisabled();
    expect(screen.getByLabelText("예배 부서", { exact: true })).toBeDisabled();
    expect(screen.getByLabelText("편집할 팀원 구분")).toBeDisabled();
    expect(screen.getByLabelText("파트", { exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "person.save", expectedRevision: 0, person: expect.objectContaining({ name: "합성연결학생", kind: "STUDENT", grade: 2, department: "SECOND", team: "SESSION", rosterLink: sourceRoster().people[0].rosterLink }) })));
  });
  it("이름만 같으면 연결하지 않고 수동 등록을 유지한다", async () => {
    const { execute } = setup(); openNew(); await loaded();
    fireEvent.change(screen.getByLabelText("이름", { exact: true }), { target: { value: "합성연결학생" } });
    expect(screen.getByLabelText("연결할 학기 팀원")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute.mock.calls[0][0].person).not.toHaveProperty("rosterLink");
  });
  it("이미 연결된 신청 키는 비활성 팀원까지 중복 선택을 막는다", async () => {
    const view = praiseFixture(); view.people[0].active = false; view.people[0].rosterLink = sourceRoster().people[0].rosterLink;
    setup(view); openNew(); await loaded();
    expect(screen.getByRole("option", { name: "합성연결학생 · 2부 2학년 · 이미 연결됨" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "second-student" } });
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("");
  });
  it("기존 학생을 연결할 때 스탭으로 바꾸지 않는다", async () => {
    setup(); fireEvent.click(screen.getByRole("button", { name: "합성학생가" })); await loaded();
    expect(screen.getByRole("option", { name: "합성연결스탭 · 스탭 · 구분이 다름" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "staff-source" } });
    expect(screen.getByLabelText("편집할 팀원 구분")).toHaveValue("STUDENT");
  });
  it("신규 스탭 선택은 스탭 속성 편집으로 전환한다", async () => {
    const { execute } = setup(); openNew(); await loaded();
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "staff-source" } });
    expect(screen.queryByLabelText("학년", { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("조 담당 가능"));
    fireEvent.change(screen.getByLabelText("선호 예배"), { target: { value: "SECOND" } });
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ person: expect.objectContaining({ kind: "STAFF", grade: 0, groupStaffCapable: true, preferredService: "SECOND", rosterLink: sourceRoster().people[2].rosterLink }) })));
  });
  it("새로 선택한 연결을 직접 등록으로 되돌리면 기본정보 편집이 열린다", async () => {
    const { execute } = setup(); openNew(); await loaded();
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "second-student" } });
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "" } });
    expect(screen.getByLabelText("이름", { exact: true })).not.toHaveAttribute("readonly");
    expect(screen.getByLabelText("학년", { exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
    expect(execute.mock.calls[0][0].person).not.toHaveProperty("rosterLink");
  });
  it("현재 원장에 없는 기존 연결은 기본정보·연결을 유지하며 찬양 속성만 수정한다", async () => {
    const view = praiseFixture(); view.people[0].rosterLink = { applicationKey: "past-application", personId: "past-person" };
    const { execute } = setup(view); fireEvent.click(screen.getByRole("button", { name: "합성학생가" })); await loaded();
    expect(screen.getByText(/현재 배치 명단에서 찾을 수 없는 과거 연결/)).toBeInTheDocument();
    expect(screen.queryByLabelText("연결할 학기 팀원")).not.toBeInTheDocument();
    expect(screen.getByLabelText("이름", { exact: true })).toHaveAttribute("readonly");
    fireEvent.click(screen.getByLabelText("학생 인도자"));
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1, person: expect.objectContaining({ name: "합성학생가", isStudentLeader: true, rosterLink: view.people[0].rosterLink }) })));
  });
  it("원장 기본정보 변경은 명시적으로 가져오며 현재 찬양 속성 초안을 보존한다", async () => {
    const view = praiseFixture(); view.people[0].rosterLink = { ...sourceRoster().people[0].rosterLink, classKey: "2-1-1" };
    const { execute } = setup(view); fireEvent.click(screen.getByRole("button", { name: "합성학생가" })); await loaded();
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성학생가");
    expect(execute).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SESSION" } });
    fireEvent.click(screen.getByRole("button", { name: "최신 기본정보 가져오기" }));
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성연결학생");
    expect(screen.getByLabelText("파트", { exact: true })).toHaveValue("SESSION");
    expect(screen.getByLabelText("학년", { exact: true })).toHaveValue("2");
    expect(execute).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1, person: expect.objectContaining({ name: "합성연결학생", grade: 2, department: "SECOND", team: "SESSION", rosterLink: sourceRoster().people[0].rosterLink }) })));
  });
  it("새로고침에서 사라진 새 연결을 표시하고 다시 선택하기 전 저장을 막는다", async () => {
    setup(); openNew(); await loaded();
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "second-student" } });
    loadRoster.mockResolvedValue({ people: [], semesterHref: sourceRoster().semesterHref });
    fireEvent.click(screen.getByRole("button", { name: "학기 명단 새로고침" })); await loaded();
    expect(screen.getByRole("option", { name: "합성연결학생 · 이전 선택 (명단 확인 필요)" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "팀원 저장" })).toBeDisabled();
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성연결학생");
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "" } });
    expect(screen.getByRole("button", { name: "팀원 저장" })).toBeEnabled();
  });
  it("학기 연결이 없거나 배치 명단이 비었을 때 수동 등록 경로를 설명한다", async () => {
    loadRoster.mockResolvedValue({ people: [], semesterHref: null }); setup(); openNew(); await loaded();
    expect(screen.getByText(/운영 설정에서 학기와 팀을 연결하면/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /학기 배치 명단 관리/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText("이름", { exact: true })).toBeEnabled();
  });
  it("불러오기 실패 시 입력을 유지하고 재시도로 복구한다", async () => {
    const request = deferred<RosterResult>(); loadRoster.mockReturnValueOnce(request.promise);
    setup(); openNew(); fireEvent.change(screen.getByLabelText("이름", { exact: true }), { target: { value: "합성수동학생" } });
    await act(async () => request.reject(new Error("synthetic unavailable")));
    expect(screen.getByRole("alert")).toHaveTextContent("학기 명단을 불러오지 못했습니다.");
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성수동학생");
    fireEvent.click(screen.getByRole("button", { name: "학기 명단 다시 시도" })); await loaded();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "합성연결학생 · 2부 2학년" })).toBeInTheDocument();
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성수동학생");
  });
  it("닫힌 편집기의 늦은 응답을 새 편집기에 적용하지 않는다", async () => {
    const request = deferred<RosterResult>(); loadRoster.mockReturnValueOnce(request.promise);
    setup(); openNew(); const signal = loadRoster.mock.calls[0][1]; fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(signal?.aborted).toBe(true); openNew(); await loaded();
    await act(async () => request.resolve({ people: [], semesterHref: null }));
    expect(screen.getByRole("option", { name: "합성연결학생 · 2부 2학년" })).toBeInTheDocument();
  });
  it("원격 갱신이 입력을 덮지 않으며 편집을 시작한 버전으로 저장한다", async () => {
    const { view, execute, rerender } = setup(); fireEvent.click(screen.getByRole("button", { name: "합성학생가" })); await loaded();
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "second-student" } });
    const next = structuredClone(view); next.people[0].revision = 7; next.people[0].name = "합성원격이름";
    rerender(<PraisePeople view={next} execute={execute} busy={false} />);
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성연결학생");
    expect(screen.getByText(/다른 사람이 이 팀원을 수정했습니다/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 1, person: expect.objectContaining({ id: "student-1", name: "합성연결학생" }) })));
  });
  it("저장 중에는 입력·닫기·팀원 전환·중복 저장을 모두 잠근다", async () => {
    const request = deferred<boolean>(); const execute = vi.fn().mockReturnValue(request.promise);
    setup(praiseFixture(), execute); fireEvent.click(screen.getByRole("button", { name: "합성학생가" })); await loaded();
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SESSION" } });
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    expect(screen.getByLabelText("이름", { exact: true })).toBeDisabled();
    expect(screen.getByLabelText("파트", { exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "닫기" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "합성학생나" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "조편성" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("form", { name: "찬양팀 팀원 편집" }));
    expect(execute).toHaveBeenCalledOnce();
    await act(async () => request.resolve(false));
    expect(screen.getByLabelText("이름", { exact: true })).toBeEnabled();
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성학생가");
  });
  it("기존 팀원은 실제 변경이 생긴 뒤에만 저장할 수 있다", async () => {
    const { execute } = setup(); fireEvent.click(screen.getByRole("button", { name: "합성학생가" })); await loaded();
    const save = screen.getByRole("button", { name: "팀원 저장" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SESSION" } });
    expect(save).toBeEnabled();
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SINGER" } });
    expect(save).toBeDisabled();
    expect(execute).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SESSION" } });
    fireEvent.click(save);
    await waitFor(() => expect(execute).toHaveBeenCalledOnce());
  });
  it("외부 busy도 모든 편집 컨트롤을 잠그고 저장 실패는 초안을 유지한다", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("synthetic failure"));
    const { view, rerender } = setup(praiseFixture(), execute); openNew(); await loaded();
    fireEvent.change(screen.getByLabelText("이름", { exact: true }), { target: { value: "합성새학생" } });
    rerender(<PraisePeople view={view} execute={execute} busy />);
    expect(screen.getByLabelText("이름", { exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "팀원 등록" })).toBeDisabled();
    rerender(<PraisePeople view={view} execute={execute} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("팀원을 저장하지 못했습니다."));
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("합성새학생");
  });
  it("다른 작업 공간으로 이동하면 기존 초안과 이전 요청을 버린다", async () => {
    const request = deferred<RosterResult>(); loadRoster.mockReturnValueOnce(request.promise);
    const { view, execute, rerender } = setup(); openNew(); const signal = loadRoster.mock.calls[0][1];
    fireEvent.change(screen.getByLabelText("이름", { exact: true }), { target: { value: "이전초안" } });
    const next = structuredClone(view); next.meta.id = "other-workspace";
    rerender(<PraisePeople view={next} execute={execute} busy={false} />);
    expect(screen.queryByRole("form", { name: "찬양팀 팀원 편집" })).not.toBeInTheDocument();
    expect(signal?.aborted).toBe(true); await act(async () => request.resolve(sourceRoster()));
    expect(execute).not.toHaveBeenCalled();
  });
  it("팀원 목록은 연결·미연결 상태를 별도로 보여 준다", () => {
    const view = praiseFixture(); view.people[0].rosterLink = sourceRoster().people[0].rosterLink; setup(view);
    const table = screen.getByRole("table");
    expect(within(table).getByText("학기 명단 연결")).toBeInTheDocument();
    expect(within(table).getAllByText("학기 명단 미연결")).toHaveLength(3);
  });
  it("출결에서 요청한 팀원을 바로 열고 통합 명단과 찬양팀 수정 범위를 구분한다", async () => {
    const view = praiseFixture(); view.people[0].rosterLink = sourceRoster().people[0].rosterLink;
    const close = vi.fn();
    render(<PraisePeople view={view} execute={vi.fn()} busy={false} requestedPersonId="student-1" onRequestedPersonClose={close} />);
    expect(await screen.findByRole("heading", { name: "합성학생가 수정" })).toHaveFocus();
    await loaded();
    expect(screen.getByText("통합 명단 기본 정보")).toBeInTheDocument();
    expect(screen.getByText("기본정보는 학기 배치 명단에서 수정합니다.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "찬양팀 세부 설정" })).toBeInTheDocument();
    expect(screen.getByLabelText("이름", { exact: true })).toHaveAttribute("readonly");
    expect(screen.getByLabelText("파트", { exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(close).toHaveBeenCalledOnce();
  });
  it("원본 대조 중에는 기존 팀원 세부 설정과 최초 연결만 저장하고 등록·가져오기는 잠근다", async () => {
    const view = praiseFixture(); view.meta.mode = "shadow";
    const execute = vi.fn().mockResolvedValue(false);
    setup(view, execute);
    expect(screen.getByRole("button", { name: "팀원 등록" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "명단 가져오기" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "합성학생가" })); await loaded();
    expect(screen.getByRole("heading", { name: "합성학생가 수정" })).toBeInTheDocument();
    expect(screen.getByLabelText("파트", { exact: true })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("연결할 학기 팀원"), { target: { value: "second-student" } });
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SESSION" } });
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "person.reconcile", expectedRevision: 1, person: expect.objectContaining({ id: "student-1", team: "SESSION", rosterLink: sourceRoster().people[0].rosterLink }) })));
  });
  it("연결된 스탭은 찬양팀 예배 부서와 선호 예배를 계속 수정한다", async () => {
    const view = praiseFixture(); view.people[2].rosterLink = sourceRoster().people[2].rosterLink;
    setup(view); fireEvent.click(screen.getByRole("button", { name: "합성스탭가" })); await loaded();
    expect(screen.getByLabelText("예배 부서", { exact: true })).toBeEnabled();
    expect(screen.getByLabelText("선호 예배", { exact: true })).toBeEnabled();
  });
  it("존재하지 않는 바로가기 대상은 빈 편집기를 만들지 않고 요청을 정리한다", async () => {
    const close = vi.fn();
    render(<PraisePeople view={praiseFixture()} execute={vi.fn()} busy={false} requestedPersonId="missing-person" onRequestedPersonClose={close} />);
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(screen.queryByRole("form", { name: "찬양팀 팀원 편집" })).not.toBeInTheDocument();
    expect(loadRoster).not.toHaveBeenCalled();
  });
  it("부서·파트·구분·비활성 필터를 이름 검색과 함께 적용하고 닫은 뒤 유지한다", async () => {
    const view = praiseFixture(); view.people[1].department = "SECOND"; view.people[1].team = "SESSION"; view.people[1].active = false;
    setup(view);
    fireEvent.change(screen.getByRole("searchbox", { name: "팀원 이름 검색" }), { target: { value: "합성학생" } });
    fireEvent.change(screen.getByLabelText("팀원 구분"), { target: { value: "STUDENT" } });
    fireEvent.change(screen.getByLabelText("팀원 부서 필터"), { target: { value: "SECOND" } });
    fireEvent.change(screen.getByLabelText("팀원 파트 필터"), { target: { value: "SESSION" } });
    expect(screen.getByText("검색 조건에 맞는 팀원이 없습니다.")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("비활성 포함"));
    const opener = screen.getByRole("button", { name: "합성학생나" }); fireEvent.click(opener); await loaded();
    expect(screen.queryByRole("button", { name: "합성학생가" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "합성학생나 수정" })).toHaveFocus();
    opener.focus(); fireEvent.click(opener);
    expect(screen.getByRole("heading", { name: "합성학생나 수정" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("form", { name: "찬양팀 팀원 편집" }), { key: "Escape" });
    expect(screen.queryByRole("form", { name: "찬양팀 팀원 편집" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(screen.getByRole("searchbox", { name: "팀원 이름 검색" })).toHaveValue("합성학생");
    expect(screen.getByLabelText("팀원 부서 필터")).toHaveValue("SECOND");
    expect(screen.getByLabelText("팀원 파트 필터")).toHaveValue("SESSION");
    expect(screen.getByLabelText("팀원 구분")).toHaveValue("STUDENT");
    expect(screen.getByLabelText("비활성 포함")).toBeChecked();
  });
  it("관리자에게만 스탭 계정 연결·비활성·미연결을 구분하고 UID를 표시하지 않는다", () => {
    const view = praiseFixture();
    view.people.push({ ...view.people[2], id: "staff-3", name: "합성스탭다" });
    const stamp = { revision: 1, updatedAt: 1788656400000, updatedBy: "synthetic-operator" };
    view.access = [
      { ...stamp, uid: "synthetic-private-active-uid", staffId: "staff-1", role: "groupStaff", active: true },
      { ...stamp, uid: "synthetic-private-old-uid", staffId: "staff-1", role: "member", active: false },
      { ...stamp, uid: "synthetic-private-inactive-uid", staffId: "staff-2", role: "member", active: false },
    ];
    const { execute, rerender, container } = setup(view);
    const staffRow = (name: string) => screen.getByRole("button", { name }).closest("tr")!;
    expect(within(staffRow("합성스탭가")).getByText("담당 계정 연결")).toBeInTheDocument();
    expect(within(staffRow("합성스탭나")).getByText("담당 계정 비활성")).toBeInTheDocument();
    expect(within(staffRow("합성스탭다")).getByText("담당 계정 미연결")).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("synthetic-private-");
    const next = structuredClone(view); next.permissions.manage = false;
    rerender(<PraisePeople view={next} execute={execute} busy={false} />);
    expect(screen.queryByRole("columnheader", { name: "담당 계정" })).not.toBeInTheDocument();
    expect(screen.queryByText(/담당 계정 (연결|미연결|비활성)/)).not.toBeInTheDocument();
    expect(loadRoster).not.toHaveBeenCalled();
  });
  it("ESC의 미저장 취소는 초안을 지키고 저장 중에는 닫힘 없이 성공 후 원래 행으로 복귀한다", async () => {
    const request = deferred<boolean>(); const execute = vi.fn().mockReturnValue(request.promise);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    setup(praiseFixture(), execute);
    const opener = screen.getByRole("button", { name: "합성학생가" }); fireEvent.click(opener); await loaded();
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SESSION" } });
    const form = screen.getByRole("form", { name: "찬양팀 팀원 편집" });
    fireEvent.keyDown(form, { key: "Escape" });
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("파트", { exact: true })).toHaveValue("SESSION");
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    fireEvent.keyDown(form, { key: "Escape" });
    expect(confirm).toHaveBeenCalledOnce();
    expect(form).toBeInTheDocument();
    await act(async () => request.resolve(true));
    expect(screen.queryByRole("form", { name: "찬양팀 팀원 편집" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
  it("미저장 ESC 확인은 닫으며 필터로 원래 행이 사라졌으면 검색으로 복귀한다", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { execute } = setup(); fireEvent.click(screen.getByRole("button", { name: "합성학생가" })); await loaded();
    fireEvent.change(screen.getByLabelText("파트", { exact: true }), { target: { value: "SESSION" } });
    const search = screen.getByRole("searchbox", { name: "팀원 이름 검색" });
    fireEvent.change(search, { target: { value: "합성학생나" } });
    fireEvent.keyDown(screen.getByRole("form", { name: "찬양팀 팀원 편집" }), { key: "Escape" });
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.queryByRole("form", { name: "찬양팀 팀원 편집" })).not.toBeInTheDocument();
    expect(search).toHaveFocus(); expect(search).toHaveValue("합성학생나");
    expect(execute).not.toHaveBeenCalled();
  });
});
