/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("../api", () => ({ listPraiseRoster: async () => ({ people: [], semesterHref: null }) }));
import { PraisePeople } from "./PraisePeople";
import { PraiseStage } from "./PraiseStage";
import { PraiseGroups } from "./PraiseGroups";
import { praiseFixture } from "./praiseTestFixtures";
afterEach(cleanup);
describe("찬양팀 편집 초안과 확정", () => {
  it("팀원 검색과 편집 초안을 유지하고 시작 revision으로 저장한다", async () => {
    const view = praiseFixture(); const execute = vi.fn().mockResolvedValue(true);
    const { rerender } = render(<PraisePeople view={view} execute={execute} busy={false} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "팀원 이름 검색" }), { target: { value: "합성학생가" } }); fireEvent.click(screen.getByRole("button", { name: "합성학생가" }));
    fireEvent.change(screen.getByLabelText("이름", { exact: true }), { target: { value: "편집중인학생" } });
    const next = structuredClone(view); next.people[0].revision = 9; next.people[0].name = "원격학생";
    rerender(<PraisePeople view={next} execute={execute} busy={false} />);
    expect(screen.getByLabelText("이름", { exact: true })).toHaveValue("편집중인학생"); expect(screen.getByRole("searchbox", { name: "팀원 이름 검색" })).toHaveValue("합성학생가");
    fireEvent.click(screen.getByRole("button", { name: "팀원 저장" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "person.save", expectedRevision: 1, person: expect.objectContaining({ id: "student-1", name: "편집중인학생" }) })));
  });
  it("조 수동 이동은 원본을 변형하지 않고 현재 초안 전체를 확정 요청한다", async () => {
    const view = praiseFixture(); const execute = vi.fn().mockResolvedValue(true);
    render(<PraiseGroups view={view} execute={execute} busy={false} />);
    fireEvent.click(screen.getByText("학생·담당 스탭 수동 이동"));
    fireEvent.change(screen.getByLabelText("합성학생가 조 이동"), { target: { value: "group-b" } });
    expect(view.groups[0].groups[0].studentIds).toEqual(["student-1"]);
    fireEvent.click(screen.getByLabelText("편성 경고와 담당 스탭을 확인했습니다")); fireEvent.click(screen.getByRole("button", { name: "조편성 확정" }));
    await waitFor(() => expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "groups.confirm", expectedRevision: 1, sourceVersionId: "groups-1", acknowledgeWarnings: true, draft: expect.objectContaining({ groups: [expect.objectContaining({ studentIds: [] }), expect.objectContaining({ studentIds: ["student-2", "student-1"] })] }) })));
  });
  it("등단 생성은 현재 출결 버전을 보내며 조회만으로 생성하지 않는다", () => {
    const view = praiseFixture(); const execute = vi.fn().mockResolvedValue(false);
    render(<PraiseStage view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    expect(execute).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "현재 조건으로 자동 편성" }));
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ type: "stage.generate", inputRevision: "revision-1", meetingId: "meeting-1" }));
  });
  it("멤버는 확정 등단표만 조회하고 편성 버튼을 볼 수 없다", () => {
    const view = praiseFixture(); view.permissions = { read: true, manage: false, stageEdit: false, attendanceAll: false, staffId: "staff-1", role: "member" };
    view.stages = [{ id: "draft", meetingId: "meeting-1", number: 2, kind: "AUTO_DRAFT", createdAt: 1000, createdBy: "actor", inputRevision: "revision-1", worshipDate: "2026-09-06", config: { ...view.policy!.stage, leaderType: "STAFF", leaderId: "staff-1", staffOnly: false }, leaderName: "합성스탭가", services: [], overrides: [], candidates: [], warnings: [], acknowledgedWarnings: false }];
    const execute = vi.fn(); render(<PraiseStage view={view} meeting={view.meetings[0]} execute={execute} busy={false} />);
    expect(screen.getByText("아직 확정된 등단표가 없습니다.")).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "현재 조건으로 자동 편성" })).not.toBeInTheDocument();
    expect(within(screen.getByLabelText("저장된 등단표")).queryByText(/자동 초안/)).not.toBeInTheDocument();
  });
});
