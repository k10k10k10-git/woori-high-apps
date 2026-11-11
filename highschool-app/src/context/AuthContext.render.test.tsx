/** @vitest-environment jsdom */
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "firebase/auth";
import { NO_ROLES } from "@/features/portal/accessPolicy";

const mocks = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(),
  get: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: mocks.onAuthStateChanged,
  signInWithPopup: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/rtdb", () => ({
  get: mocks.get,
  ref: (_db: unknown, path: string) => path,
}));
vi.mock("@/lib/firebase", () => ({ auth: {}, db: {}, googleProvider: {} }));

import { AuthProvider, useAuth } from "./AuthContext";

type Snapshot = { val: () => unknown };
type PendingRead = { resolve: (snapshot: Snapshot) => void; reject: (error: Error) => void };
let onAuth: (user: User | null) => Promise<void>;
let reads: Map<string, PendingRead>;

function AuthState() {
  const { user, loading, roleError, roles, memberName, retryRoles } = useAuth();
  return <><output data-testid="auth-state">{JSON.stringify({ uid: user?.uid ?? null, loading, roleError, roles, memberName })}</output><button onClick={retryRoles}>역할 다시 시도</button></>;
}

function MembershipState() {
  const { teamMemberships } = useAuth();
  return <output data-testid="team-memberships">{JSON.stringify(teamMemberships)}</output>;
}

function RosterSearchState() {
  const { canSearchOfficialRoster } = useAuth();
  return <output data-testid="roster-search">{String(canSearchOfficialRoster)}</output>;
}

const state = () => JSON.parse(screen.getByTestId("auth-state").textContent!);
const user = (uid: string) => ({ uid }) as User;

function finishReads(uid: string, values: Record<string, unknown> = {}) {
  for (const bucket of ["retreatAdmins", "iguardMembers", "iguardRoles", "admins"]) {
    reads.get(`${bucket}/${uid}`)?.resolve({ val: () => values[bucket] ?? null });
  }
}

async function settle(uid: string, values: Record<string, unknown>, request: Promise<void>) {
  await act(async () => {
    finishReads(uid, values);
    // 이전 구현의 직렬 admins 조회까지 풀어 경쟁 상태 자체를 비교한다.
    await Promise.resolve();
    await Promise.resolve();
    finishReads(uid, values);
    await request;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  reads = new Map();
  mocks.onAuthStateChanged.mockImplementation((_auth: unknown, callback: typeof onAuth) => {
    onAuth = callback;
    return mocks.unsubscribe;
  });
  mocks.get.mockImplementation((path: string) => new Promise<Snapshot>((resolve, reject) => {
    reads.set(path, { resolve, reject });
  }));
});
afterEach(cleanup);

describe("AuthProvider — 최신 인증 요청만 화면에 반영", () => {
  it("독립적인 네 권한 읽기를 응답 대기 전에 함께 시작한다", async () => {
    render(<AuthProvider><AuthState /></AuthProvider>);
    let pending!: Promise<void>;
    act(() => { pending = onAuth(user("a")); });
    expect([...reads.keys()].sort()).toEqual([
      "admins/a", "iguardMembers/a", "iguardRoles/a", "retreatAdmins/a",
    ]);
    await settle("a", {}, pending);
  });

  it("로그아웃 뒤 도착한 이전 계정의 성공 응답을 버린다", async () => {
    render(<AuthProvider><AuthState /></AuthProvider>);
    let pending!: Promise<void>;
    act(() => { pending = onAuth(user("a")); });
    await act(() => onAuth(null));
    await settle("a", { admins: true, retreatAdmins: { name: "이전 사용자" } }, pending);
    expect(state()).toEqual({ uid: null, loading: false, roleError: false, roles: NO_ROLES, memberName: null });
  });

  it.each(["성공", "실패"])("다음 계정 조회가 먼저 끝나도 이전 계정의 %s 응답이 덮지 않는다", async (result) => {
    render(<AuthProvider><AuthState /></AuthProvider>);
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = onAuth(user("a")); });
    act(() => { second = onAuth(user("b")); });
    await settle("b", { iguardMembers: { name: "현재 사용자" }, iguardRoles: "staff" }, second);
    const current = state();
    expect(current.memberName).toBe("현재 사용자");
    if (result === "성공") {
      await settle("a", { admins: true, retreatAdmins: { name: "이전 사용자" } }, first);
    } else {
      await act(async () => {
        reads.get("retreatAdmins/a")!.reject(new Error("permission_denied"));
        await first;
      });
    }
    expect(state()).toEqual(current);
  });

  it("계정 변경 직후에는 이전 역할을 비우고 새 역할 조회가 끝날 때까지 로딩한다", async () => {
    render(<AuthProvider><AuthState /></AuthProvider>);
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => { first = onAuth(user("a")); });
    await settle("a", { admins: true }, first);
    act(() => { second = onAuth(user("b")); });
    expect(state()).toEqual({ uid: "b", loading: true, roleError: false, roles: NO_ROLES, memberName: null });
    await settle("b", {}, second);
    expect(state().loading).toBe(false);
  });

  it("필수 역할 조회 실패와 권한 미배정을 구분하고 다시 읽을 수 있다", async () => {
    render(<AuthProvider><AuthState /></AuthProvider>);
    let pending!: Promise<void>;
    act(() => { pending = onAuth(user("a")); });
    await act(async () => {
      reads.get("retreatAdmins/a")!.reject(new Error("permission_denied"));
      await pending;
    });
    expect(state()).toEqual({ uid: "a", loading: false, roleError: true, roles: NO_ROLES, memberName: null });
    act(() => screen.getByRole("button", { name: "역할 다시 시도" }).click());
    expect(state().loading).toBe(true);
    await act(async () => finishReads("a", { admins: true }));
    expect(state()).toMatchObject({ uid: "a", loading: false, roleError: false });
    expect(state().roles).not.toEqual(NO_ROLES);
  });

  it.each(["permission_denied", "Permission denied"])("admins 자기조회 거부(%s)는 일반 현장 역할을 막지 않는다", async (deniedMessage) => {
    render(<AuthProvider><AuthState /></AuthProvider>);
    let pending!: Promise<void>;
    act(() => { pending = onAuth(user("a")); });
    await act(async () => {
      reads.get("admins/a")?.reject(new Error(deniedMessage));
      finishReads("a", { iguardMembers: { name: "현장 담당" }, iguardRoles: "staff" });
      await Promise.resolve();
      await Promise.resolve();
      reads.get("admins/a")!.reject(new Error(deniedMessage));
      await pending;
    });
    expect(state()).toMatchObject({ uid: "a", loading: false, memberName: "현장 담당" });
    expect(state().roles).not.toEqual(NO_ROLES);
  });

  it("선택적 관리자 조회라도 연결 실패면 권한 미배정으로 확정하지 않는다", async () => {
    render(<AuthProvider><AuthState /></AuthProvider>);
    let pending!: Promise<void>;
    act(() => { pending = onAuth(user("a")); });
    await act(async () => {
      reads.get("admins/a")!.reject(new Error("network unavailable"));
      finishReads("a", {});
      await pending;
    });
    expect(state()).toMatchObject({ uid: "a", loading: false, roleError: true, roles: NO_ROLES });
  });

  it("두 계정 저장소에 나뉜 담당 팀을 합쳐 읽는다", async () => {
    render(<AuthProvider><AuthState /><MembershipState /></AuthProvider>);
    let pending!: Promise<void>;
    act(() => { pending = onAuth(user("a")); });
    await settle("a", {
      retreatAdmins: { teamMemberships: { design: { active: true, role: "staff" } } },
      iguardMembers: { teamMemberships: { praise: { active: true, role: "staff" } } },
    }, pending);
    expect(JSON.parse(screen.getByTestId("team-memberships").textContent!)).toEqual({
      design: { active: true, role: "staff" },
      praise: { active: true, role: "staff" },
    });
  });

  it("팀장이 가진 비활성 원시 팀 연결도 Rules와 같이 전체 인물검색을 닫는다", async () => {
    render(<AuthProvider><RosterSearchState /></AuthProvider>);
    let pending!: Promise<void>;
    act(() => { pending = onAuth(user("a")); });
    await settle("a", { retreatAdmins: { role: "leader" } }, pending);
    expect(screen.getByTestId("roster-search")).toHaveTextContent("true");

    act(() => { pending = onAuth(user("b")); });
    expect(screen.getByTestId("roster-search")).toHaveTextContent("false");
    await settle("b", {
      retreatAdmins: { role: "leader", teamMemberships: { praise: { active: false, role: "leader" } } },
    }, pending);
    expect(screen.getByTestId("roster-search")).toHaveTextContent("false");
  });

  it("Provider 해제 시 인증 구독을 해제하고 미완료 조회를 마무리할 수 있다", async () => {
    const view = render(<AuthProvider><AuthState /></AuthProvider>);
    let pending!: Promise<void>;
    act(() => { pending = onAuth(user("a")); });
    view.unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    await settle("a", { admins: true }, pending);
  });
});
