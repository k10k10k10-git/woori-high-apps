/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MinistryRoles } from "@/features/portal/accessPolicy";

const mocks = vi.hoisted(() => ({
  auth: {
    user: { uid: "fixture-staff", email: "staff@example.test", displayName: "가상 스탭" } as { uid: string; email: string; displayName: string } | null,
    loading: false, roleError: false, roles: { semester: "none", retreat: "none" } as MinistryRoles,
    retryRoles: vi.fn(), signIn: vi.fn(), signOut: vi.fn(),
  },
  retreats: vi.fn(), periods: vi.fn(), locks: vi.fn(), pending: vi.fn(), request: vi.fn(), semesters: vi.fn(), toast: vi.fn(),
}));

vi.mock("@/context/AuthContext", () => ({ useAuth: () => mocks.auth }));
vi.mock("@/context/UIContext", () => ({ useUI: () => ({ toast: mocks.toast }) }));
vi.mock("@/features/iguard/lib/db", () => ({
  subscribeToRetreats: mocks.retreats, subscribeToIguardAccessLocks: mocks.locks,
  getMyIguardPending: mocks.pending, requestIguardAccess: mocks.request,
}));
vi.mock("@/lib/db", () => ({ subscribeToAllRetreatPeriods: mocks.periods }));
vi.mock("@/features/semester/db", () => ({ subscribeSemesters: mocks.semesters }));
vi.mock("@/components/CenterSpinner", () => ({ default: () => <p role="status">계정 확인 중</p> }));
vi.mock("@/components/LoginButton", () => ({ default: ({ signIn }: { signIn: () => void }) => <button onClick={signIn}>Google로 로그인</button> }));
vi.mock("@/app/RetreatsHome", () => ({ default: () => <p>수련회 행정 목록</p> }));
vi.mock("@/app/field/AdminModal", () => ({ default: () => null }));
vi.mock("@/features/portal/VacationHome", () => ({ default: ({ retreats, loadError, onRetry, selectedId, onSelect }: { retreats: Array<{ id: string; name: string }>; loadError: string | null; onRetry: () => void; selectedId: string | null; onSelect: (id: string) => void }) => <main>
  <h1>수련회 현장 목록</h1>
  {loadError && <div role="alert">{loadError}<button onClick={onRetry}>다시 불러오기</button></div>}
  <output data-testid="selected-retreat">{selectedId}</output>
  {retreats.map((retreat) => <div key={retreat.id}><p>{retreat.name}</p><button aria-label={`${retreat.name} 선택`} onClick={() => onSelect(retreat.id)}>선택</button></div>)}
</main> }));

import EventsHome from "./EventsHome";
import FieldHomeClient from "@/app/field/FieldHomeClient";
import { TeamAccessState } from "@/features/teams/TeamAccessState";
import TrainingAccessState from "@/features/training/TrainingAccessState";
import TrainingHome from "@/features/training/TrainingHome";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.user = { uid: "fixture-staff", email: "staff@example.test", displayName: "가상 스탭" };
  mocks.auth.roles = { semester: "none", retreat: "none" };
  mocks.auth.loading = false;
  mocks.auth.roleError = false;
  mocks.auth.signIn.mockResolvedValue(undefined);
  mocks.auth.signOut.mockResolvedValue(undefined);
  mocks.pending.mockResolvedValue(false);
  mocks.request.mockResolvedValue(undefined);
  mocks.retreats.mockReturnValue(() => {});
  mocks.periods.mockReturnValue(() => {});
  mocks.locks.mockReturnValue(() => {});
  mocks.semesters.mockReturnValue(() => {});
});
afterEach(cleanup);

describe("행사 권한 조회 복구", () => {
  it.each([EventsHome, FieldHomeClient])("연결 실패를 미승인으로 판정하거나 요청 원장을 조회하지 않는다", (Entry) => {
    mocks.auth.roleError = true;
    render(<Entry />);
    expect(screen.getByRole("alert")).toHaveTextContent("행사 이용 권한을 확인하지 못했습니다");
    expect(screen.queryByText("수련회 현장 접근 승인이 필요합니다.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /접근 요청 보내기/ })).not.toBeInTheDocument();
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.retreats).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mocks.auth.retryRoles).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "접속 문제 도움말" })).toHaveAttribute("href", "/library/help#connection");
  });

  it("인증 조회 중에는 미승인 안내도 pending 읽기도 하지 않는다", () => {
    mocks.auth.loading = true;
    render(<FieldHomeClient />);
    expect(screen.getByRole("status")).toHaveTextContent("계정 확인 중");
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.retreats).not.toHaveBeenCalled();
  });

  it("승인된 행정 역할은 기존 행정 화면으로 연결한다", () => {
    mocks.auth.roles = { semester: "none", retreat: "adminTeam" };
    render(<EventsHome />);
    expect(screen.getByText("수련회 행정 목록")).toBeInTheDocument();
    expect(mocks.pending).not.toHaveBeenCalled();
  });

  it("미로그인은 등록 계정 안내와 공용 로그인 버튼을 제공한다", () => {
    mocks.auth.user = null;
    render(<FieldHomeClient />);
    expect(screen.getByText("수련회 현장 업무를 보려면 로그인해 주세요.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Google로 로그인" }));
    expect(mocks.auth.signIn).toHaveBeenCalledOnce();
    expect(mocks.pending).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("이미 요청했다면 중복 요청 대신 승인 확인과 담당자 안내를 제공한다", async () => {
    mocks.pending.mockResolvedValue(true);
    render(<FieldHomeClient />);
    expect(await screen.findByRole("button", { name: "승인 여부 다시 확인" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /접근 요청 보내기/ })).not.toBeInTheDocument();
    expect(screen.getByText(/로그인한 계정:/)).toHaveTextContent("staff@example.test");
    expect(screen.getByRole("link", { name: "계정 확인·담당자 문의 방법" })).toHaveAttribute("href", "/library/help#access");
    fireEvent.click(screen.getByRole("button", { name: "승인 여부 다시 확인" }));
    expect(mocks.auth.retryRoles).toHaveBeenCalledOnce();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("요청 상태 조회가 실패하면 중복 전송을 막고 실제로 상태를 다시 읽는다", async () => {
    mocks.pending.mockRejectedValueOnce(new Error("PERMISSION_DENIED /private/db/node")).mockResolvedValue(true);
    render(<FieldHomeClient />);
    expect(await screen.findByRole("alert")).toHaveTextContent("접근 요청 상태를 확인하지 못했습니다");
    expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /접근 요청 보내기/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "요청 상태 다시 확인" }));
    expect(await screen.findByRole("button", { name: "승인 여부 다시 확인" })).toBeInTheDocument();
    expect(mocks.pending).toHaveBeenCalledTimes(2);
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("요청은 명시적으로 눌렀을 때만 한 번 전송하고 저장 결과를 알린다", async () => {
    render(<FieldHomeClient />);
    const button = await screen.findByRole("button", { name: "수련회 현장 접근 요청 보내기" });
    expect(mocks.request).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(await screen.findByRole("button", { name: "승인 여부 다시 확인" })).toBeInTheDocument();
    expect(mocks.request).toHaveBeenCalledOnce();
    expect(mocks.request).toHaveBeenCalledWith("fixture-staff", "staff@example.test", "가상 스탭");
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining("접근 요청을 보냈습니다"), "success");
  });

  it("전송 결과가 불확실하면 재전송보다 요청 상태를 재조회한다", async () => {
    mocks.request.mockRejectedValueOnce(new Error("WRITE_FAILED /private/db/node"));
    render(<FieldHomeClient />);
    fireEvent.click(await screen.findByRole("button", { name: "수련회 현장 접근 요청 보내기" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("접근 요청 상태를 확인하지 못했습니다");
    expect(mocks.toast).toHaveBeenCalledWith("요청 전송 여부를 확인하지 못했습니다. 요청 상태를 다시 확인해 주세요.", "error");
    expect(screen.queryByRole("button", { name: /접근 요청 보내기/ })).not.toBeInTheDocument();
  });

  it("늦게 도착한 이전 계정의 요청 결과를 현재 계정에 표시하지 않는다", async () => {
    let finishPrevious: ((value: boolean) => void) | undefined;
    mocks.pending.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finishPrevious = resolve; })).mockResolvedValue(false);
    const view = render(<FieldHomeClient />);
    mocks.auth.user = { uid: "new-staff", email: "new@example.test", displayName: "다른 스탭" };
    view.rerender(<FieldHomeClient />);
    await screen.findByRole("button", { name: "수련회 현장 접근 요청 보내기" });
    act(() => finishPrevious?.(true));
    expect(screen.queryByRole("button", { name: "승인 여부 다시 확인" })).not.toBeInTheDocument();
    expect(screen.getByText(/로그인한 계정:/)).toHaveTextContent("new@example.test");
  });
});

describe("현장 데이터 다시 불러오기", () => {
  beforeEach(() => { mocks.auth.roles = { semester: "none", retreat: "fieldStaff" }; });

  it("목록 실패는 빈 목록 대신 안내하며 재시도로 실패한 구독을 새로 연다", () => {
    const stop = vi.fn();
    mocks.retreats.mockReturnValue(stop);
    render(<FieldHomeClient />);
    act(() => mocks.retreats.mock.calls[0][1](new Error("PERMISSION_DENIED retreats")));
    expect(screen.getByRole("alert")).toHaveTextContent("수련회 목록을 불러오지 못했습니다");
    expect(screen.queryByText("수련회 현장 목록")).not.toBeInTheDocument();
    expect(screen.queryByText(/PERMISSION_DENIED/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.retreats).toHaveBeenCalledTimes(2);
    act(() => mocks.retreats.mock.calls.at(-1)![0]([{ id: "retreat", name: "가상 수련회", year: 2026 }]));
    expect(screen.getByText("가상 수련회")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it("부가 정보 실패를 목록 응답 하나로 지우지 않고 재시도 경로를 유지한다", () => {
    render(<FieldHomeClient />);
    act(() => mocks.retreats.mock.calls[0][0]([{ id: "retreat", name: "가상 수련회", year: 2026 }]));
    act(() => mocks.periods.mock.calls.at(-1)![2](new Error("INTERNAL /secret/path")));
    expect(screen.getByRole("alert")).toHaveTextContent("수련회 일정 또는 입장 잠금 상태를 확인하지 못했습니다");
    act(() => mocks.retreats.mock.calls[0][0]([{ id: "retreat", name: "가상 수련회", year: 2026 }]));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/INTERNAL|secret/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(mocks.retreats).toHaveBeenCalledTimes(2);
    expect(mocks.periods).toHaveBeenCalledTimes(3);
  });

  it.each(["periods", "locks"] as const)("%s 재시도 때 같은 계정의 수련회 선택은 유지하고 구독을 다시 연다", (failingSource) => {
    const firstStop = vi.fn();
    mocks.retreats.mockReturnValue(firstStop);
    const list = [{ id: "first", name: "첫 수련회", year: 2026 }, { id: "second", name: "두 번째 수련회", year: 2026 }];
    render(<FieldHomeClient />);
    act(() => mocks.retreats.mock.calls[0][0](list));
    fireEvent.click(screen.getByRole("button", { name: "두 번째 수련회 선택" }));
    expect(screen.getByTestId("selected-retreat")).toHaveTextContent("second");
    // 선택 변경만으로 목록 리스너를 다시 열지 않는다.
    expect(mocks.retreats).toHaveBeenCalledOnce();
    act(() => mocks[failingSource].mock.calls.at(-1)![2](new Error("연결 실패")));
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(firstStop).toHaveBeenCalledOnce();
    expect(mocks.retreats).toHaveBeenCalledTimes(2);
    act(() => mocks.retreats.mock.calls.at(-1)![0](list));
    expect(screen.getByTestId("selected-retreat")).toHaveTextContent("second");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("계정이 바뀌면 이전 계정의 수련회 선택을 사용하지 않는다", () => {
    const list = [{ id: "first", name: "첫 수련회", year: 2026 }, { id: "second", name: "두 번째 수련회", year: 2026 }];
    const view = render(<FieldHomeClient />);
    act(() => mocks.retreats.mock.calls[0][0](list));
    fireEvent.click(screen.getByRole("button", { name: "두 번째 수련회 선택" }));
    expect(screen.getByTestId("selected-retreat")).toHaveTextContent("second");
    mocks.auth.user = { uid: "new-staff", email: "new@example.test", displayName: "다른 스탭" };
    view.rerender(<FieldHomeClient />);
    expect(screen.queryByTestId("selected-retreat")).not.toBeInTheDocument();
    act(() => mocks.retreats.mock.calls.at(-1)![0](list));
    expect(screen.getByTestId("selected-retreat")).toBeEmptyDOMElement();
  });

  it("재시도 뒤 선택 수련회가 사라졌으면 다른 수련회를 임의로 선택하지 않는다", () => {
    const list = [{ id: "first", name: "첫 수련회", year: 2026 }, { id: "second", name: "두 번째 수련회", year: 2026 }];
    render(<FieldHomeClient />);
    act(() => mocks.retreats.mock.calls[0][0](list));
    fireEvent.click(screen.getByRole("button", { name: "두 번째 수련회 선택" }));
    act(() => mocks.locks.mock.calls.at(-1)![2](new Error("연결 실패")));
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    act(() => mocks.retreats.mock.calls.at(-1)![0]([list[0]]));
    expect(screen.getByTestId("selected-retreat")).toBeEmptyDOMElement();
  });
});

describe("팀·훈련 권한 안내", () => {
  it.each([TeamAccessState, TrainingAccessState])("조회 실패에 역할 재시도와 접속 도움말을 제공한다", (AccessState) => {
    mocks.auth.roleError = true;
    render(<AccessState allowed={false}><p>허용 업무</p></AccessState>);
    expect(screen.getByRole("alert")).toHaveTextContent("확인하지 못했습니다");
    expect(screen.queryByText("허용 업무")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(mocks.auth.retryRoles).toHaveBeenCalledOnce();
    expect(screen.getByRole("link", { name: "접속 문제 도움말" })).toHaveAttribute("href", "/library/help#connection");
  });

  it.each([TeamAccessState, TrainingAccessState])("미배정은 계정 이메일과 실제 담당자 문의 방법을 제공한다", (AccessState) => {
    render(<AccessState allowed={false}><p>허용 업무</p></AccessState>);
    expect(screen.queryByText("허용 업무")).not.toBeInTheDocument();
    expect(screen.getByText(/로그인한 계정:/)).toHaveTextContent("staff@example.test");
    expect(screen.getByText(/교역자 또는 통합관리자/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "계정 확인·담당자 문의 방법" })).toHaveAttribute("href", "/library/help#access");
  });

  it("훈련 목록 기술 오류 원문을 숨기고 재시도로 실제 구독을 다시 연다", async () => {
    mocks.auth.roles = { semester: "pastor", retreat: "none" };
    const stop = vi.fn();
    mocks.semesters.mockReturnValue(stop);
    render(<TrainingHome />);
    act(() => mocks.semesters.mock.calls[0][1](new Error("PERMISSION_DENIED /secret/path")));
    expect(screen.getByRole("alert")).toHaveTextContent("훈련 정보를 불러오지 못했습니다");
    expect(screen.queryByText(/PERMISSION_DENIED|secret/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "다시 불러오기" }));
    expect(stop).toHaveBeenCalledOnce();
    expect(mocks.semesters).toHaveBeenCalledTimes(2);
    act(() => mocks.semesters.mock.calls.at(-1)![0]([]));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByText("등록된 학기가 없습니다")).toBeInTheDocument();
  });
});
