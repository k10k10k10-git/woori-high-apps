import { beforeEach, describe, expect, it, vi } from "vitest";
const print = vi.hoisted(() => vi.fn().mockReturnValue(true));
vi.mock("@/lib/exportUtils", async (original) => ({ ...(await original<typeof import("@/lib/exportUtils")>()), printAsPDF: print }));
import { printStagePDF } from "./stageExport";
import type { PraiseStageVersion } from "../types";
import { DEFAULT_STAGE } from "../defaults";
beforeEach(() => print.mockClear());
describe("등단표 인쇄", () => {
  it("이름을 HTML로 실행하지 않고 확정본의 좌우와 순서를 유지한다", () => {
    const version: PraiseStageVersion = { id: "v1", meetingId: "m1", number: 1, kind: "CONFIRMED", createdAt: 1000, createdBy: "test", inputRevision: "rev", worshipDate: "2026-09-06", config: { ...DEFAULT_STAGE, leaderType: "STAFF", leaderId: "leader", staffOnly: false }, leaderName: "<script>test</script>", services: [{ department: "FIRST", assignments: [{ personType: "STUDENT", personId: "a", name: "<img src=x onerror=test>", gender: "FEMALE", role: "SINGER", side: "RIGHT", positionOrder: 0, reason: "", isManual: false }] }], overrides: [], candidates: [], warnings: [], acknowledgedWarnings: false };
    expect(printStagePDF(version)).toBe(true);
    const html = print.mock.calls[0][0] as string;
    expect(html).toContain("&lt;script&gt;test&lt;/script&gt;"); expect(html).toContain("&lt;img src=x onerror=test&gt;"); expect(html).not.toContain("<script>"); expect(html).toContain("확정 1차");
  });
});
