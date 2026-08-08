import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  backupNodeBeforeOverwrite: vi.fn(),
  remove: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
  ref: vi.fn((_db: unknown, path: string) => path),
}));

vi.mock("firebase/database", () => ({
  ref: mocks.ref,
  get: mocks.get,
  set: mocks.set,
  update: vi.fn(),
  push: vi.fn(),
  remove: mocks.remove,
  onValue: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: {} }));
vi.mock("./core", () => ({
  snapToList: vi.fn(),
  stripUndefined: <T>(value: T) => value,
  backupNodeBeforeOverwrite: mocks.backupNodeBeforeOverwrite,
}));

import {
  clearGroups,
  clearRooms,
  clearRoomAssignments,
  restoreGroupsBackup,
  restoreRoomsBackup,
} from "./groupsRooms";

// 복구는 현재 상태를 통째로 덮어쓴다 — 사전 백업이 실패했는데도 덮어쓰면 되돌릴 수 없다.
describe.each([
  ["restoreGroupsBackup", restoreGroupsBackup, "retreats/retreat-1/groups"],
  ["restoreRoomsBackup", restoreRoomsBackup, "retreats/retreat-1/rooms"],
] as const)("%s", (_name, restore, nodePath) => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({ exists: () => true, val: () => ({ a: 1 }) });
  });

  it("백업이 성공하면 백업 내용으로 덮어쓴다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(true);

    await restore("retreat-1", "backup-key");

    expect(mocks.set).toHaveBeenCalledWith(nodePath, { a: 1 });
  });

  it("백업이 실패하면 덮어쓰지 않는다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(false);

    await expect(restore("retreat-1", "backup-key")).rejects.toThrow("백업에 실패");
    expect(mocks.set).not.toHaveBeenCalled();
  });
});

describe("clearGroups", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("스로틀 없는 백업을 만든 뒤 groups 노드만 삭제한다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(true);

    await clearGroups("retreat-1");

    expect(mocks.backupNodeBeforeOverwrite).toHaveBeenCalledWith(
      "retreats/retreat-1/groups",
      "retreats/retreat-1/groupsBackups",
      0,
    );
    expect(mocks.remove).toHaveBeenCalledWith("retreats/retreat-1/groups");
  });

  it("백업이 실패하면 삭제하지 않는다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(false);

    await expect(clearGroups("retreat-1")).rejects.toThrow("백업에 실패");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("clearRooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("스로틀 없는 백업을 만든 뒤 rooms 노드만 삭제한다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(true);

    await clearRooms("retreat-1");

    expect(mocks.backupNodeBeforeOverwrite).toHaveBeenCalledWith(
      "retreats/retreat-1/rooms",
      "retreats/retreat-1/roomsBackups",
      0,
    );
    expect(mocks.remove).toHaveBeenCalledWith("retreats/retreat-1/rooms");
  });

  it("백업이 실패하면 삭제하지 않는다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(false);

    await expect(clearRooms("retreat-1")).rejects.toThrow("백업에 실패");
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});

describe("clearRoomAssignments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("스로틀 없는 백업 후, 방 구조는 유지하고 studentIds·teachers만 비워 저장한다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(true);
    mocks.get.mockResolvedValue({
      exists: () => true,
      val: () => ({
        r1: { dong: "본관", roomNumber: "101", capacity: 2, type: "남", studentIds: ["1_a", "1_b"], teachers: ["김교사"] },
        r2: { roomNumber: "202", capacity: 3, type: "여", studentIds: [] },
      }),
    });

    await clearRoomAssignments("retreat-1");

    expect(mocks.backupNodeBeforeOverwrite).toHaveBeenCalledWith(
      "retreats/retreat-1/rooms",
      "retreats/retreat-1/roomsBackups",
      0,
    );
    expect(mocks.set).toHaveBeenCalledWith("retreats/retreat-1/rooms", {
      r1: { dong: "본관", roomNumber: "101", capacity: 2, type: "남", studentIds: [], teachers: [] },
      r2: { roomNumber: "202", capacity: 3, type: "여", studentIds: [], teachers: [] },
    });
    expect(mocks.remove).not.toHaveBeenCalled(); // 방 자체는 절대 삭제하지 않는다
  });

  it("백업이 실패하면 아무것도 쓰지 않는다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(false);

    await expect(clearRoomAssignments("retreat-1")).rejects.toThrow("백업에 실패");
    expect(mocks.get).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("방이 하나도 없으면 쓰기 없이 종료한다", async () => {
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(true);
    mocks.get.mockResolvedValue({ exists: () => false, val: () => null });

    await clearRoomAssignments("retreat-1");

    expect(mocks.set).not.toHaveBeenCalled();
  });
});
