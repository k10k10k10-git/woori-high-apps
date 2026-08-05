import { describe, expect, it } from "vitest";
import { createSettingsDraft, editSettingsDraft, syncSettingsDraft } from "./settingsDraft";
import { SemesterMeta } from "./types";

const meta: SemesterMeta = {
  title: "2026 1학기",
  completionRule: { minRate: 0.8 },
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("학기 설정 draft 비동기 초기화", () => {
  it("meta가 나중에 도착하면 최초 한 번 초기화한다", () => {
    const loading = createSettingsDraft("2026-1", null);
    expect(syncSettingsDraft(loading, "2026-1", meta)).toMatchObject({
      initialized: true,
      dirty: false,
      title: "2026 1학기",
      minRatePct: 80,
    });
  });

  it("사용자가 먼저 입력했으면 늦게 도착한 meta가 덮지 않는다", () => {
    const edited = editSettingsDraft(createSettingsDraft("2026-1", null), { title: "임시 제목" });
    expect(syncSettingsDraft(edited, "2026-1", meta)).toBe(edited);
  });

  it("학기 ID가 바뀌면 새 meta로 draft를 교체한다", () => {
    const edited = editSettingsDraft(createSettingsDraft("2026-1", meta), { minRatePct: 90 });
    expect(syncSettingsDraft(edited, "2026-2", { ...meta, title: "2026 2학기" })).toMatchObject({
      sid: "2026-2",
      title: "2026 2학기",
      minRatePct: 80,
      dirty: false,
    });
  });
});
