import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OnSiteEntry } from "@/lib/types";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("@/lib/rtdb", () => ({
  ref: (_db: unknown, nodePath?: string) => nodePath,
  get: vi.fn(), push: vi.fn(), onValue: vi.fn(), onChildAdded: vi.fn(), onChildRemoved: vi.fn(),
}));
vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("@/features/activityLog/write", () => ({
  auditedSet: vi.fn(), auditedUpdate: vi.fn(), auditedRemove: vi.fn(), auditedRunTransaction: mocks.transaction,
}));

import { toggleOnSiteCheckIn } from "./retreatOps";
import { updateIguardAttendance } from "@/features/iguard/lib/db";
import { markArchiveLinkDeleting } from "@/features/semester/db";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); });

describe("로그 연결 후 원장 트랜잭션 계약", () => {
  it("자료 삭제 표식은 기존 필드를 보존하고 삭제된 자료를 다시 만들지 않는다", async () => {
    const link = { title: "합성 자료", url: "https://example.invalid", filePath: "semesters/2026-2/archive/file", kind: "doc" };
    mocks.transaction.mockImplementation(async (_path, transform) => {
      expect(transform(link)).toEqual({ ...link, deletionPending: true });
      expect(transform(null)).toBeNull();
      return { committed: true, snapshot: { exists: () => true } };
    });
    await expect(markArchiveLinkDeleting("2026-2", "link")).resolves.toBe(true);
    expect(mocks.transaction).toHaveBeenCalledWith("semesters/2026-2/archiveLinks/link", expect.any(Function));
    mocks.transaction.mockResolvedValueOnce({ committed: true, snapshot: { exists: () => false } });
    await expect(markArchiveLinkDeleting("2026-2", "link")).resolves.toBe(false);
  });

  it("현장 추가자는 보존하고 일반 체크인은 서버 확정 상태를 반환한다", async () => {
    const walkIn = { isOnSite: true, name: "가상현장학생" } as OnSiteEntry;
    const entry = { isOnSite: false, name: "가상신청학생" } as OnSiteEntry;
    mocks.transaction.mockImplementation(async (_path, transform) => {
      expect(transform(walkIn)).toBe(walkIn);
      expect(transform(entry)).toBeNull();
      expect(transform(null)).toEqual(entry);
      return { committed: true, snapshot: { val: () => entry } };
    });
    await expect(toggleOnSiteCheckIn("test-retreat", "student-key", () => entry)).resolves.toBe(true);
    expect(mocks.transaction).toHaveBeenCalledWith("retreats/test-retreat/onSiteReg/student-key", expect.any(Function));
    mocks.transaction.mockResolvedValueOnce({ committed: true, snapshot: { val: () => null } });
    await expect(toggleOnSiteCheckIn("test-retreat", "student-key", () => entry)).resolves.toBe(false);
  });

  it("인원체크는 낡은 요청을 중단하고 해제 톰스톤을 유지한다", async () => {
    vi.spyOn(Date, "now").mockReturnValue(100);
    mocks.transaction.mockImplementation(async (_path, transform) => {
      expect(transform({ checked: true, updatedAt: 101 })).toBeUndefined();
      expect(transform({ checked: true, updatedAt: 99 })).toEqual({ checked: false, updatedAt: 100, by: "가상담당" });
      expect(transform(true)).toEqual({ checked: false, updatedAt: 100, by: "가상담당" });
      return { committed: true, snapshot: { val: () => null } };
    });
    await updateIguardAttendance("test-retreat", "day/1", false, "가상담당");
    expect(mocks.transaction).toHaveBeenCalledWith("retreats/test-retreat/iguard/attendance/day%2F1", expect.any(Function));
  });

  it("업무 확정 후 로그 오류를 삼키거나 재실행하지 않고 호출 화면에 전달한다", async () => {
    const afterCommitError = new Error("업무는 저장됐으나 활동 로그 저장에 실패했습니다.");
    mocks.transaction.mockRejectedValue(afterCommitError);
    await expect(toggleOnSiteCheckIn("test-retreat", "student-key", () => ({ isOnSite: false } as OnSiteEntry))).rejects.toBe(afterCommitError);
    await expect(updateIguardAttendance("test-retreat", "day/1", true)).rejects.toBe(afterCommitError);
    expect(mocks.transaction).toHaveBeenCalledTimes(2);
  });
});
