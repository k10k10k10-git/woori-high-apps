import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PraiseAuditEvent, PraiseState } from "../types";
import { createPraiseState } from "./commands";
const mocks = vi.hoisted(() => ({ transaction: vi.fn(), workspace: vi.fn(), values: new Map<string, unknown>() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabaseAdmin", () => ({ getPraiseAdmin: () => ({ database: { transaction: async (path: string, updater: (value: unknown) => unknown) => {
  mocks.transaction(path); const before = mocks.values.get(path) ?? null; const next = updater(before);
  if (next !== undefined) mocks.values.set(path, next);
  return { committed: next !== undefined, value: mocks.values.get(path) ?? null };
} } }) }));
vi.mock("./repository", () => ({ transactWorkspace: mocks.workspace }));
import { praiseActivityRecord, projectPraiseAudit } from "./projection";
function state(): PraiseState {
  const value = createPraiseState({ operationId: "create", workspace: { id: "review-workspace", name: "검증 공간", startDate: "2026-09-05", endDate: "2026-09-05" } }, { uid: "review-manager", roles: { semester: "superAdmin", retreat: "none" }, teamMemberships: {} }, 1_800_000_000_000);
  value.audit = { event: { id: "event", at: 1_800_000_000_001, actor: { uid: "review-manager" }, action: "attendance.set", label: "검증 출결", changes: [{ field: "출결", before: "미입력", after: "출석" }] } };
  return value;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.values = new Map();
  mocks.workspace.mockImplementation(async (_id, updater) => updater(state()));
});

describe("감사 투영의 충돌·실패 후 재시도", () => {
  it("동일 고정 ID에 다른 기록이 선점되면 완료 표식을 찍지 않는다", async () => {
    const current = state(); const expected = praiseActivityRecord(current.meta.id, current.audit.event)!;
    const poisoned = { ...expected, actor: { kind: "user", uid: "another-approved-user" } };
    const path = `activityLogs/events/${expected.id}`; mocks.values.set(path, poisoned);
    expect(await projectPraiseAudit(current)).toBe(true); expect(mocks.values.get(path)).toEqual(poisoned);
    expect(mocks.workspace).not.toHaveBeenCalled(); expect(current.audit.event.projectedAt).toBeUndefined();
  });
  it("이전 요청의 같은 기록이 있으면 덮어쓰기 없이 완료를 복구한다", async () => {
    const current = state(); const expected = praiseActivityRecord(current.meta.id, current.audit.event)!;
    mocks.values.set(`activityLogs/events/${expected.id}`, JSON.parse(JSON.stringify(expected)));
    expect(await projectPraiseAudit(current)).toBe(false); expect(mocks.values.size).toBe(1); expect(mocks.workspace).toHaveBeenCalledOnce();
    const update = mocks.workspace.mock.calls[0][1] as (value: PraiseState) => PraiseState;
    expect(update(current).audit.event.projectedAt).toEqual(expect.any(Number));
  });
  it("글로벌 로그 저장 뒤 workspace 표식 저장 실패는 다음 호출에서 중복 없이 복구한다", async () => {
    const current = state(); mocks.workspace.mockRejectedValueOnce(new Error("synthetic interruption"));
    expect(await projectPraiseAudit(current)).toBe(true); expect(mocks.values.size).toBe(1);
    expect(await projectPraiseAudit(current)).toBe(false); expect(mocks.values.size).toBe(1); expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
  it("과거 원본 감사는 재시도 대상에서도 제외한다", async () => {
    const current = state(); current.audit.event = { ...current.audit.event, historical: true, actor: { uid: "supabase:source-user" } } as PraiseAuditEvent;
    expect(await projectPraiseAudit(current)).toBe(false); expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.workspace).not.toHaveBeenCalled();
  });
});
