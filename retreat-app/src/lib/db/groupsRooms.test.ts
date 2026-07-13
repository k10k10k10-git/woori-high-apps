import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  backupNodeBeforeOverwrite: vi.fn(),
  remove: vi.fn(),
  ref: vi.fn((_db: unknown, path: string) => path),
}));

vi.mock("firebase/database", () => ({
  ref: mocks.ref,
  get: vi.fn(),
  set: vi.fn(),
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

import { clearGroups, clearRooms } from "./groupsRooms";

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
