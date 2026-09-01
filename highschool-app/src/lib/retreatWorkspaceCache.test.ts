import { afterEach, describe, expect, it, vi } from "vitest";
import { getRetreatWorkspaceSnapshot, mergeRetreatWorkspaceSnapshot } from "./retreatWorkspaceCache";

describe("수련회 업무 화면 메모리 스냅샷", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("서로 다른 업무 화면이 같은 수련회의 최신 조각을 합쳐 읽는다", () => {
    vi.stubGlobal("window", {});
    const id = `retreat-cache-${Date.now()}`;
    const retreat = {
      id,
      name: "테스트 수련회",
      year: 2026,
      sheetId: "",
      sheetGid: "",
      createdAt: 1,
      groupCount: 1,
    };
    const groups = [{ id: "g1", name: "1조", bu: "1부", teachers: [], leader: "", studentIds: [] }];

    mergeRetreatWorkspaceSnapshot(id, { retreat });
    mergeRetreatWorkspaceSnapshot(id, { groups });

    expect(getRetreatWorkspaceSnapshot(id)).toMatchObject({ retreat, groups });
  });
});
