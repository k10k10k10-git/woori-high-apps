import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  ref: vi.fn((_db: unknown, path: string) => path),
  set: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("firebase/database", () => ({ ...mocks, onValue: vi.fn() }));
vi.mock("../firebase", () => ({ db: {} }));
vi.mock("./retreatRoster", () => ({ getRetreatRoster: vi.fn(), subscribeRetreatRoster: vi.fn() }));

import { loadTeachersFromDB } from "./students";

function source(values: Record<string, unknown>) {
  mocks.get.mockImplementation(async (path: string) => {
    const value = values[path] ?? null;
    return { exists: () => value !== null, val: () => value };
  });
}

beforeEach(() => vi.clearAllMocks());

describe("수련회에 새로 불러오는 교사 명단", () => {
  it("현재 출석부 담임을 사용하고 이전 교사의 부가정보와 수련회 기록은 변경하지 않는다", async () => {
    const values = {
      "classes/2026": { "2-2-8": { teacher: "  현재 담임  " } },
      "teacherExtra/2026": { "2": { "2_2_8": { name: "이전 담임", title: "2학년 8반 담임" } } },
      "retreats/past/teachers": { old: { name: "이전 담임", originKey: "class:2-2-8", status: "전참" } },
    };
    const before = structuredClone(values);
    source(values);

    const { teachers, hasStaffNode } = await loadTeachersFromDB(2026);

    expect(teachers).toEqual([{ name: "현재 담임", bu: "2부", classKey: "2학년 8반 담임", originKey: "class:2-2-8" }]);
    expect(hasStaffNode).toBe(false);
    expect(values).toEqual(before);
    expect(mocks.get.mock.calls.map(([path]) => path)).not.toContain("retreats/past/teachers");
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each([undefined, "", "   "])("현재 담임이 %s이면 이전 이름으로 다시 채우지 않는다", async (teacher) => {
    source({
      "classes/2026": { "2-2-8": { teacher } },
      "teacherExtra/2026": { "2": { "2_2_8": { name: "이전 담임" } } },
    });
    expect((await loadTeachersFromDB(2026)).teachers).toEqual([]);
  });

  it("반별 기본 표기와 안정 키, 특별 교사·스탭의 공식 이름을 유지한다", async () => {
    source({
      "classes/2026": { "2-2-8": { teacher: "현재 담임" }, "invalid": { teacher: "잘못된 반" } },
      "teacherExtra/2026": { "2": { "2_2_8": { title: "   " } } },
      "teacherSpecial/2026": { "1": [{ name: "  특별 교사  ", title: "부장" }] },
      "teacherStaff/2026": { staff1: { name: "공식 스탭", title: "팀장" } },
    });

    const result = await loadTeachersFromDB(2026);
    expect(result.hasStaffNode).toBe(true);
    expect(result.teachers).toEqual([
      { name: "특별 교사", bu: "1부", classKey: "부장", originKey: "special:1:0" },
      { name: "현재 담임", bu: "2부", classKey: "2학년 8반", originKey: "class:2-2-8" },
      { name: "공식 스탭", bu: "스탭", classKey: "팀장", originKey: "staff:staff1" },
    ]);
  });

  it("원장 읽기 실패를 빈 명단으로 바꾸지 않는다", async () => {
    mocks.get.mockRejectedValue(new Error("read denied"));
    await expect(loadTeachersFromDB(2026)).rejects.toThrow("read denied");
  });
});
