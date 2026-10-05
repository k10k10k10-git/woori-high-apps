import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { ref, token, fetcher } = vi.hoisted(() => ({ ref: vi.fn(), token: vi.fn(), fetcher: vi.fn() }));
vi.mock("./firebaseAdmin", () => ({ getPraiseFirebaseAdmin: () => ({ database: { ref }, app: { options: { databaseURL: "https://test-project.firebaseio.com", credential: { getAccessToken: token } } } }), praiseUnavailable: (code: string) => new Error(code) }));
import { praiseAccounts, validateSemesterLink, listSemesterIds } from "./references";
beforeEach(() => vi.clearAllMocks());
it("담당 계정은 승인된 찬양 접근 계정만 반환하고 동명이인을 이메일로 구분한다", async () => {
  const nodes: Record<string, unknown> = { admins: {}, retreatAdmins: {}, iguardMembers: {
    one: { name: "같은이름", email: "one@example.com", semesterRole: "praise", retreatRole: "none", teamMemberships: { praise: { role: "staff", active: true } } },
    two: { name: "같은이름", email: "two@example.com", semesterRole: "praise", retreatRole: "none", teamMemberships: { praise: { role: "viewer", active: true } } },
    blocked: { name: "권한없음", email: "private@example.com", semesterRole: "none", retreatRole: "iguardTeam" },
    otherLeader: { name: "다른팀장", email: "other@example.com", semesterRole: "leader", retreatRole: "none", teamMemberships: { media: { role: "leader", active: true } } },
  }, iguardRoles: {} };
  ref.mockImplementation((path: string) => ({ get: async () => ({ val: () => nodes[path] }) }));
  const accounts = await praiseAccounts();
  expect(accounts.map((account) => account.email).sort()).toEqual(["one@example.com", "two@example.com"]);
  expect(accounts.some((account) => account.uid === "blocked")).toBe(false);
  expect(accounts.some((account) => account.uid === "otherLeader")).toBe(false);
  expect(accounts.every((account) => Object.keys(account).every((key) => ["uid", "name", "email", "roleLabel"].includes(key)))).toBe(true);
});
it("계정 조회 실패는 빈 계정 목록으로 숨기지 않는다", async () => {
  ref.mockImplementation(() => ({ get: async () => { throw new Error("offline"); } }));
  await expect(praiseAccounts()).rejects.toThrow("reference_unavailable");
});

it("학기 연결은 찬양팀으로 확인된 팀만 허용한다", async () => {
  const nodes: Record<string, unknown> = {
    "semesters/2026-2/meta": { title: "2학기" },
    "semesters/2026-2/teams/praise-id": { name: "찬양팀" },
    "semesters/2026-2/teams/media-id": { name: "미디어팀", teamKey: "media" },
  };
  ref.mockImplementation((path: string) => ({ get: async () => ({ val: () => nodes[path] }) }));
  await expect(validateSemesterLink("2026-2", "praise-id")).resolves.toBeUndefined();
  await expect(validateSemesterLink("2026-2", "media-id")).rejects.toThrow("찬양팀");
});


afterEach(() => vi.unstubAllGlobals());
it("학기 탐색은 shallow ID만 받으며 원장을 읽지 않고 토큰은 헤더에만 둔다", async () => {
  token.mockResolvedValue({ access_token: "server-test-token" });
  fetcher.mockResolvedValue({ ok: true, json: async () => ({ "2026-2": true, "2026-sunday": true }) });
  vi.stubGlobal("fetch", fetcher);
  await expect(listSemesterIds()).resolves.toEqual(["2026-2", "2026-sunday"]);
  const [url, options] = fetcher.mock.calls[0];
  expect(url.toString()).toBe("https://test-project.firebaseio.com/semesters.json?shallow=true");
  expect(options.headers).toEqual({ Authorization: "Bearer server-test-token" });
  expect(options.cache).toBe("no-store");
  expect(ref).not.toHaveBeenCalled();
});
it.each([[], "wrong", 0, { "2026-2": { attendance: { s: "출석" } } }, { "bad/key": true }])(
  "잘못된 shallow 응답 %j는 성공한 빈 목록으로 숨기지 않는다", async (body) => {
    token.mockResolvedValue({ access_token: "server-test-token" });
    fetcher.mockResolvedValue({ ok: true, json: async () => body }); vi.stubGlobal("fetch", fetcher);
    await expect(listSemesterIds()).rejects.toThrow("reference_unavailable");
    expect(ref).not.toHaveBeenCalled();
  },
);
it("null은 실제 빈 학기 목록으로 읽고 네트워크 실패는 구분한다", async () => {
  token.mockResolvedValue({ access_token: "server-test-token" });
  fetcher.mockResolvedValueOnce({ ok: true, json: async () => null }).mockRejectedValueOnce(new Error("private-token-error"));
  vi.stubGlobal("fetch", fetcher);
  await expect(listSemesterIds()).resolves.toEqual([]);
  await expect(listSemesterIds()).rejects.toThrow("reference_unavailable");
});
