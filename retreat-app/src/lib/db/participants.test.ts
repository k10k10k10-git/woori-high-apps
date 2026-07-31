import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  backupNodeBeforeOverwrite: vi.fn(),
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
  remove: vi.fn(),
  onValue: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: {} }));
vi.mock("./core", () => ({
  snapToList: vi.fn(),
  stripUndefined: <T>(value: T) => value,
  backupNodeBeforeOverwrite: mocks.backupNodeBeforeOverwrite,
}));

import { saveParticipants, restoreParticipantsBackup } from "./participants";

const SAMPLE = {
  "1_a": { name: "김학생", gender: "남", grade: 1, class: 1, bu: "1부" },
};

// participants는 이가드까지 읽는 2순위 꼬임 경로다(DB_OWNERSHIP.md).
// 전체 덮어쓰기의 백업을 호출부 규약에 맡기면 새 호출부 하나가 전체를 날릴 수 있으므로,
// db 계층이 강제한다는 사실을 회귀 테스트로 고정한다.
describe("saveParticipants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(true);
  });

  it("전체 덮어쓰기 전에 롤링 백업을 남긴다", async () => {
    await saveParticipants("retreat-1", SAMPLE as never);

    expect(mocks.backupNodeBeforeOverwrite).toHaveBeenCalledWith(
      "retreats/retreat-1/participants",
      "retreats/retreat-1/participantsBackups",
    );
    expect(mocks.set).toHaveBeenCalledWith("retreats/retreat-1/participants", SAMPLE);
  });

  it("백업이 저장보다 먼저 실행된다", async () => {
    const order: string[] = [];
    mocks.backupNodeBeforeOverwrite.mockImplementation(async () => { order.push("backup"); return true; });
    mocks.set.mockImplementation(async () => { order.push("set"); });

    await saveParticipants("retreat-1", SAMPLE as never);

    expect(order).toEqual(["backup", "set"]);
  });
});

describe("restoreParticipantsBackup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.set.mockResolvedValue(undefined);
  });

  it("복구 전 현재 상태를 스로틀 없이 강제 백업한다", async () => {
    mocks.get.mockResolvedValue({ exists: () => true, val: () => SAMPLE });
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(true);

    await restoreParticipantsBackup("retreat-1", "1700000000000");

    expect(mocks.backupNodeBeforeOverwrite).toHaveBeenCalledWith(
      "retreats/retreat-1/participants",
      "retreats/retreat-1/participantsBackups",
      0,
    );
    expect(mocks.set).toHaveBeenCalledWith("retreats/retreat-1/participants", SAMPLE);
  });

  it("현재 상태 백업에 실패하면 복구하지 않는다", async () => {
    mocks.get.mockResolvedValue({ exists: () => true, val: () => SAMPLE });
    mocks.backupNodeBeforeOverwrite.mockResolvedValue(false);

    await expect(restoreParticipantsBackup("retreat-1", "1700000000000")).rejects.toThrow("백업에 실패");
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it("백업 키가 없으면 현재 상태를 건드리지 않는다", async () => {
    mocks.get.mockResolvedValue({ exists: () => false, val: () => null });

    await expect(restoreParticipantsBackup("retreat-1", "없는키")).rejects.toThrow("백업을 찾을 수 없습니다.");
    expect(mocks.backupNodeBeforeOverwrite).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
