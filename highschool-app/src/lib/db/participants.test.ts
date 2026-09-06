import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  ref: vi.fn((_db: unknown, path: string) => path),
}));

vi.mock("firebase/database", () => ({
  ref: mocks.ref,
  get: mocks.get,
  set: mocks.set,
  update: mocks.update,
  push: vi.fn(),
  remove: vi.fn(),
  onValue: vi.fn(),
}));
// 업무 모듈의 원자 쓰기·백업 계약을 검사한다. 로그 원자성은 write.test.ts에서 별도 검증한다.
vi.mock("@/features/activityLog/write", () => ({
  auditedSet: mocks.set,
  auditedUpdate: mocks.update,
  auditedRemove: vi.fn(),
}));

vi.mock("../firebase", () => ({ db: {} }));
vi.mock("./core", () => ({
  snapToList: vi.fn(),
  stripUndefined: <T>(value: T) => value,
}));

import { saveParticipants, restoreParticipantsBackup, updateParticipant } from "./participants";

const SAMPLE = {
  "1_a": { name: "김학생", gender: "남", grade: 1, class: 1, bu: "1부" },
};
const snap = (value: unknown) => ({ exists: () => value !== null, val: () => value });

afterEach(() => vi.restoreAllMocks());

// participants는 이가드까지 읽는 2순위 꼬임 경로다(DB_OWNERSHIP.md).
// 전체 덮어쓰기의 백업을 호출부 규약에 맡기면 새 호출부 하나가 전체를 날릴 수 있으므로,
// db 계층이 강제한다는 사실을 회귀 테스트로 고정한다.
describe("saveParticipants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  });

  it("전체 덮어쓰기 전에 공개 명단과 비공개 연락처를 같은 키로 백업한다", async () => {
    mocks.get
      .mockResolvedValueOnce(snap(SAMPLE))
      .mockResolvedValueOnce(snap({ "1_a": { phone: "010-1" } }))
      .mockResolvedValueOnce(snap(null));
    await saveParticipants("retreat-1", SAMPLE as never);

    expect(mocks.update).toHaveBeenNthCalledWith(1, undefined, {
      "retreats/retreat-1/participantsBackups/1700000000000": SAMPLE,
      "retreatsPrivate/retreat-1/participantContactsBackups/1700000000000": { "1_a": { phone: "010-1" } },
    });
    expect(mocks.update).toHaveBeenNthCalledWith(2, undefined, {
      "retreats/retreat-1/participants": SAMPLE,
      "retreatsPrivate/retreat-1/participantContacts": null,
    });
  });

  it("현재 연락처가 없다는 사실도 빈 마커로 같은 키에 남긴다", async () => {
    mocks.get
      .mockResolvedValueOnce(snap(SAMPLE))
      .mockResolvedValueOnce(snap(null))
      .mockResolvedValueOnce(snap(null));
    await saveParticipants("retreat-1", SAMPLE as never);
    expect(mocks.update).toHaveBeenNthCalledWith(1, undefined, {
      "retreats/retreat-1/participantsBackups/1700000000000": SAMPLE,
      "retreatsPrivate/retreat-1/participantContactsBackups/1700000000000": { __empty: true },
    });
  });
});

describe("restoreParticipantsBackup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1700000000999);
  });

  it("복구 전 현재 묶음을 백업하고 선택한 시점의 연락처와 함께 복구한다", async () => {
    const backedUpPublic = { "1_a": { ...SAMPLE["1_a"], phone: "010-legacy" } };
    mocks.get
      .mockResolvedValueOnce(snap(backedUpPublic))
      .mockResolvedValueOnce(snap({ "1_a": { phone: "010-backup-private" } }))
      .mockResolvedValueOnce(snap(SAMPLE))
      .mockResolvedValueOnce(snap({ "1_a": { phone: "010-current" } }))
      .mockResolvedValueOnce(snap(null));

    await restoreParticipantsBackup("retreat-1", "1700000000000");

    expect(mocks.update).toHaveBeenNthCalledWith(1, undefined, {
      "retreats/retreat-1/participantsBackups/1700000000999": SAMPLE,
      "retreatsPrivate/retreat-1/participantContactsBackups/1700000000999": { "1_a": { phone: "010-current" } },
    });
    expect(mocks.update).toHaveBeenNthCalledWith(2, undefined, {
      "retreats/retreat-1/participants": SAMPLE,
      "retreatsPrivate/retreat-1/participantContacts": { "1_a": { phone: "010-backup-private" } },
    });
  });

  it("현재 상태 백업에 실패하면 복구하지 않는다", async () => {
    mocks.get.mockResolvedValue(snap(SAMPLE));
    mocks.update.mockRejectedValueOnce(new Error("backup failed"));

    await expect(restoreParticipantsBackup("retreat-1", "1700000000000")).rejects.toThrow("백업에 실패");
    expect(mocks.update).toHaveBeenCalledTimes(1);
  });

  it("백업 키가 없으면 현재 상태를 건드리지 않는다", async () => {
    mocks.get.mockResolvedValue(snap(null));

    await expect(restoreParticipantsBackup("retreat-1", "없는키")).rejects.toThrow("백업을 찾을 수 없습니다.");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe("updateParticipant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("연락처를 공개 참가자와 비공개 경로에 원자적으로 분리한다", async () => {
    await updateParticipant("retreat-1", "p_0", {
      ...SAMPLE["1_a"],
      registeredAt: "2026-01-01",
      phone: "010-1111",
      pPhone: "010-2222",
    } as never);

    expect(mocks.update).toHaveBeenCalledWith(undefined, {
      "retreats/retreat-1/participants/p_0": {
        ...SAMPLE["1_a"],
        registeredAt: "2026-01-01",
      },
      "retreatsPrivate/retreat-1/participantContacts/p_0": { phone: "010-1111", pPhone: "010-2222" },
    });
  });
});
