/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraiseAttendance } from "./PraiseAttendance";
import { praiseFixture } from "./praiseTestFixtures";
afterEach(cleanup);
describe("찬양팀 출결 권한과 명시 입력", () => {
  it("일반 스탭도 본인 참석만 기록하고 미입력 행만 찾을 수 있다", () => {
    const view = praiseFixture(); view.permissions = { ...view.permissions, manage: false, stageEdit: false, attendanceAll: false, role: "member" };
    const execute = vi.fn(); const { rerender } = render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    expect(screen.getByText("합성스탭가")).toBeInTheDocument(); expect(screen.queryByText("합성스탭나")).not.toBeInTheDocument(); expect(screen.queryByText("합성학생가")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "출석" })); expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "availability.set", personId: "staff-1", present: true }));
    view.availability = { "meeting-1": { "staff-1": { revision: 1, updatedAt: 1000, updatedBy: "actor", present: true, role: "SINGER" } } };
    rerender(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />); fireEvent.click(screen.getByLabelText("미입력만 보기")); expect(screen.queryByText("합성스탭가")).not.toBeInTheDocument();
  });
  it("첫 조회에서 출석을 자동 입력하지 않고 명시 선택만 저장한다", () => {
    const view = praiseFixture(); const execute = vi.fn().mockResolvedValue(true);
    render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    expect(execute).not.toHaveBeenCalled();
    const group = screen.getByRole("group", { name: "합성학생가 출결" });
    expect(within(group).getByRole("button", { name: "출석" })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(within(group).getByRole("button", { name: "출석" }));
    expect(execute).toHaveBeenCalledWith({ type: "attendance.set", meetingId: "meeting-1", personId: "student-1", status: "PRESENT", expectedRevision: 0 });
  });
  it("조 담당자와 등단 담당자는 자신의 조 출결만 보고 수정한다", () => {
    const view = praiseFixture(); view.permissions = { ...view.permissions, manage: false, stageEdit: false, attendanceAll: false, role: "groupStaff" };
    const execute = vi.fn(); const { rerender } = render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    expect(screen.getByText("합성학생가")).toBeInTheDocument(); expect(screen.queryByText("합성학생나")).not.toBeInTheDocument();
    view.permissions = { ...view.permissions, stageEdit: true, role: "editor" };
    rerender(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    expect(screen.queryByRole("group", { name: "합성학생나 출결" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("group", { name: "합성학생가 출결" })).getByRole("button", { name: "출석" })).not.toBeDisabled();
  });
  it("검색어가 원격 갱신으로 사라지지 않고 미입력 복원은 기존 revision을 보낸다", () => {
    const view = praiseFixture(); const execute = vi.fn().mockResolvedValue(true);
    const { rerender } = render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "출결 이름 검색" }), { target: { value: "합성학생가" } });
    view.attendance = { "meeting-1": { "student-1": { revision: 5, updatedAt: 1000, updatedBy: "actor", groupVersionId: "groups-1", status: "PRESENT" } } };
    rerender(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    expect(screen.getByRole("searchbox", { name: "출결 이름 검색" })).toHaveValue("합성학생가"); expect(screen.queryByText("합성학생나")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "합성학생가 출결 지우기" }));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ status: null, expectedRevision: 5 }));
  });
  it("스탭 미입력 복원과 휴강 주일 스탭 참석 입력을 지원한다", () => {
    const view = praiseFixture(); view.availability = { "meeting-1": { "staff-1": { revision: 4, updatedAt: 1000, updatedBy: "actor", present: true, role: "SINGER" } } };
    const execute = vi.fn(); const { rerender } = render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "스탭" })); fireEvent.click(screen.getByRole("button", { name: "합성스탭가 출결 지우기" }));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "availability.set", present: null, expectedRevision: 4 }));
    rerender(<PraiseAttendance view={view} meeting={{ ...view.meetings[0], cancelled: true }} execute={execute} busy={false} />);
    expect(within(screen.getByRole("group", { name: "합성스탭나 출결" })).getByRole("button", { name: "출석" })).not.toBeDisabled();
  });
});

function semesterFixture() {
  const view = praiseFixture();
  view.meetings = [view.meetings[0], { ...view.meetings[0], id: "meeting-2", date: "2026-09-12", worshipDate: "2026-09-13", sequence: 2, title: "두 번째 모임" }, { ...view.meetings[0], id: "meeting-3", date: "2026-09-19", worshipDate: "2026-09-20", sequence: 3, title: "쉬는 모임", cancelled: true }];
  view.attendance = {
    "meeting-1": { "student-1": { revision: 1, updatedAt: 1000, updatedBy: "actor", groupVersionId: "groups-1", status: "PRESENT" }, "student-2": { revision: 1, updatedAt: 1000, updatedBy: "actor", groupVersionId: "groups-1", status: "ABSENT" } },
    "meeting-2": { "student-2": { revision: 2, updatedAt: 2000, updatedBy: "actor", groupVersionId: "groups-1", status: "PRESENT" } },
  };
  return view;
}
describe("학기 전체 출결 표", () => {
  it("날짜 순서·출석·결석·미입력·휴강을 구분하고 검색한 셀에서 기존 회차 입력으로 이동한다", () => {
    const view = semesterFixture(); const execute = vi.fn(); const select = vi.fn();
    const { rerender } = render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} onSelectMeeting={select} />);
    expect(screen.getByRole("heading", { name: "모임 출결" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "출결 이름 검색" }), { target: { value: "합성학생가" } });
    fireEvent.click(screen.getByRole("button", { name: "학기 전체 표" }));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((header) => header.textContent)).toEqual(["이름", "2026-09-05합성 모임", "2026-09-12두 번째 모임", "2026-09-19쉬는 모임 · 학생 휴강"]);
    expect(within(table).getByText("출석")).toBeInTheDocument(); expect(within(table).getByText("미입력")).toBeInTheDocument(); expect(within(table).getByText("휴강")).toBeInTheDocument();
    expect(within(table).queryByText("합성학생나")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "학기 전체 출결 표 가로 스크롤" })).toHaveAttribute("tabindex", "0");
    fireEvent.click(within(table).getByRole("button", { name: "합성학생가 2026-09-12 미입력 · 모임별 입력 열기" }));
    expect(select).toHaveBeenCalledWith("meeting-2"); expect(execute).not.toHaveBeenCalled();
    rerender(<PraiseAttendance view={view} meeting={view.meetings[1]} execute={execute} busy={false} onSelectMeeting={select} />);
    expect(screen.getByRole("heading", { name: "모임 출결" })).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "출결 이름 검색" })).toHaveValue("합성학생가");
    expect(screen.getByText("2026-09-12 · 두 번째 모임")).toBeInTheDocument();
  });
  it("미입력 검색은 휴강을 결석·미입력으로 세지 않고 학생과 스탭 전환에도 유지한다", () => {
    const view = semesterFixture(); render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "학기 전체 표" }));
    expect(within(screen.getByRole("table")).getByText("결석")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("미입력만 보기"));
    expect(within(screen.getByRole("table")).getByText("합성학생가")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("합성학생나")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "스탭" }));
    expect(screen.getByLabelText("미입력만 보기")).toBeChecked();
    expect(within(screen.getByRole("table")).getAllByText("미입력")).toHaveLength(6);
    expect(within(screen.getByRole("table")).queryByText("휴강")).not.toBeInTheDocument();
  });
  it("담당자는 저장 당시 조의 기록만 읽고 누락된 다른 조를 미입력이나 결석으로 추정하지 않는다", () => {
    const view = semesterFixture(); view.permissions = { ...view.permissions, manage: false, stageEdit: false, attendanceAll: false, role: "groupStaff" };
    const old = view.groups[0];
    view.groups.push({ ...old, id: "groups-2", number: 2, groups: [{ ...old.groups[0], studentIds: ["student-2"] }, { ...old.groups[1], studentIds: ["student-1"] }] });
    view.meta.activeGroupVersionId = "groups-2";
    view.meetings[0].groupVersionId = "groups-2";
    view.meetings[1].groupVersionId = "groups-2";
    view.attendance = { "meeting-1": { "student-1": view.attendance["meeting-1"]["student-1"] } };
    render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={false} onSelectMeeting={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "학기 전체 표" }));
    const row = screen.getByRole("row", { name: /합성학생가/ });
    expect(within(row).getByText("출석")).toBeInTheDocument();
    expect(within(row).getAllByText("담당 범위 밖")).toHaveLength(2);
    expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    const currentRow = screen.getByRole("row", { name: /합성학생나/ });
    expect(within(currentRow).getAllByText("확인할 기록 없음")).toHaveLength(2);
    expect(within(currentRow).queryByText("미입력")).not.toBeInTheDocument();
    expect(within(currentRow).queryByText("결석")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("미입력만 보기"));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
  it("조 필터는 각 회차의 저장 당시 조에 적용되고 일반 멤버는 본인 스탭 참석만 본다", () => {
    const view = semesterFixture(); const { rerender } = render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "학기 전체 표" }));
    fireEvent.change(screen.getByLabelText("출결 조 선택"), { target: { value: "group-a" } });
    expect(within(screen.getByRole("table")).getByText("합성학생가")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).queryByText("합성학생나")).not.toBeInTheDocument();
    view.permissions = { ...view.permissions, manage: false, stageEdit: false, attendanceAll: false, role: "member" };
    rerender(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={false} />);
    const table = screen.getByRole("table");
    expect(within(table).getByText("합성스탭가")).toBeInTheDocument();
    expect(within(table).queryByText("합성스탭나")).not.toBeInTheDocument();
    expect(within(table).queryByText("합성학생가")).not.toBeInTheDocument();
    expect(within(table).getByText("2026-09-20")).toBeInTheDocument();
  });
  it("저장 중 표의 회차 이동을 잠그고 비활성 팀원의 과거 기록은 남긴다", () => {
    const view = semesterFixture(); view.people[0].active = false; const select = vi.fn();
    render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={true} onSelectMeeting={select} />);
    fireEvent.click(screen.getByRole("button", { name: "학기 전체 표" }));
    expect(screen.getByRole("row", { name: /합성학생가 · 비활성/ })).toBeInTheDocument();
    const header = screen.getByRole("button", { name: "2026-09-12 두 번째 모임 모임별 입력 열기" });
    expect(header).toBeDisabled(); fireEvent.click(header); expect(select).not.toHaveBeenCalled();
  });
});

it("모임별 입력도 비관리자의 누락 기록을 미입력으로 단정하지 않고 명시된 빈 기록만 필터링한다", () => {
  const view = praiseFixture(); view.permissions = { ...view.permissions, manage: false, stageEdit: false, attendanceAll: false, role: "groupStaff" };
  const execute = vi.fn(); const { rerender } = render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
  expect(screen.getByText(/확인할 기록 없음 · 이전 담당 조 기록/)).toBeInTheDocument();
  expect(screen.queryByText("아직 입력하지 않았습니다")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "합성학생가 출결 확인 필요" })).toBeDisabled();
  expect(execute).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText("미입력만 보기"));
  expect(screen.queryByRole("group", { name: "합성학생가 출결" })).not.toBeInTheDocument();
  view.attendance = { "meeting-1": { "student-1": { status: null, groupVersionId: "groups-1", revision: 2, updatedAt: 1000, updatedBy: "actor" } } };
  rerender(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
  expect(screen.getByRole("group", { name: "합성학생가 출결" })).toBeInTheDocument();
  expect(screen.queryByText(/확인할 기록 없음 · 이전 담당 조 기록/)).not.toBeInTheDocument();
});
it("비활성 학생의 과거 출석은 보존하되 빈 회차를 미입력 작업으로 포함하지 않는다", () => {
  const view = semesterFixture(); view.people[0].active = false;
  render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={false} />);
  fireEvent.change(screen.getByRole("searchbox", { name: "출결 이름 검색" }), { target: { value: "합성학생가" } });
  fireEvent.click(screen.getByRole("button", { name: "학기 전체 표" }));
  const row = screen.getByRole("row", { name: /합성학생가 · 비활성/ });
  expect(within(row).getByText("출석")).toBeInTheDocument();
  expect(within(row).getAllByText("기록 없음")).toHaveLength(2);
  expect(within(row).queryByText("미입력")).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("미입력만 보기"));
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});
it("스탭 참석 표의 주일 날짜·접근성 이름·이동 후 제목은 같고 저장 대상은 원래 meetingId이다", () => {
  const view = semesterFixture(); const execute = vi.fn(); const select = vi.fn();
  const { rerender } = render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={execute} busy={false} onSelectMeeting={select} />);
  fireEvent.click(screen.getByRole("button", { name: "스탭" }));
  expect(screen.getByText("2026-09-06 · 주일 스탭 참석 · 합성 모임")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "학기 전체 표" }));
  expect(screen.getByRole("button", { name: "2026-09-13 두 번째 모임 모임별 입력 열기" })).toHaveTextContent("2026-09-13");
  fireEvent.click(screen.getByRole("button", { name: "합성스탭가 2026-09-13 미입력 · 모임별 입력 열기" }));
  expect(select).toHaveBeenCalledWith("meeting-2");
  rerender(<PraiseAttendance view={view} meeting={view.meetings[1]} execute={execute} busy={false} onSelectMeeting={select} />);
  expect(screen.getByText("2026-09-13 · 주일 스탭 참석 · 두 번째 모임")).toBeInTheDocument();
  fireEvent.click(within(screen.getByRole("group", { name: "합성스탭가 출결" })).getByRole("button", { name: "출석" }));
  expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "availability.set", meetingId: "meeting-2", personId: "staff-1", present: true }));
});


it("과거 조로 찾은 기록을 열 때 현재 회차에서 학생을 숨기는 필터를 해제한다", () => {
  const view = semesterFixture();
  const old = view.groups[0];
  view.groups.push({ ...old, id: "new-version", number: 2, groups: old.groups.map((group) => ({ ...group, id: `new-${group.id}` })) });
  view.meta.activeGroupVersionId = "new-version";
  view.meetings[0].groupVersionId = "new-version";
  const select = vi.fn();
  render(<PraiseAttendance view={view} meeting={view.meetings[0]} execute={vi.fn()} busy={false} onSelectMeeting={select} />);
  fireEvent.change(screen.getByLabelText("출결 이름 검색"), { target: { value: "합성학생가" } });
  fireEvent.click(screen.getByRole("button", { name: "학기 전체 표" }));
  fireEvent.change(screen.getByLabelText("출결 조 선택"), { target: { value: "group-a" } });
  fireEvent.click(screen.getByRole("button", { name: "합성학생가 2026-09-05 출석 · 모임별 입력 열기" }));
  expect(select).toHaveBeenCalledWith("meeting-1");
  expect(screen.getByLabelText("출결 조 선택")).toHaveValue("");
  expect(screen.getByLabelText("미입력만 보기")).not.toBeChecked();
  expect(screen.getByRole("group", { name: "합성학생가 출결" })).toBeInTheDocument();
  expect(screen.getByLabelText("출결 이름 검색")).toHaveValue("합성학생가");
});
