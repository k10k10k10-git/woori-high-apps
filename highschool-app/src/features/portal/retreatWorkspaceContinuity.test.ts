import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("수련회 업무 화면 연속성 계약", () => {
  it("행정 하위 탭은 방문 후 모두 마운트 상태를 유지한다", () => {
    const admin = source("src/app/retreat/[id]/RetreatPageClient.tsx");
    expect(admin).not.toContain("KEEP_ALIVE_TABS");
    for (const tab of [
      "PARTICIPANTS", "GROUPS", "ROOMS", "ROSTER", "NOTES", "TEACHERS", "CARPOOL",
      "PARTIAL", "INSURANCE", "CANCELLATION", "SUPPLIES", "ONSITE", "PAYMENTS",
      "TSHIRT", "MEALCOUNT", "ADMINSUPPLIES", "MEDICAL",
    ]) {
      expect(admin).toContain(`mountedTabs.has(TAB_IDX.${tab})`);
    }
  });

  it("행정·프로그램·이가드는 직전 정상 스냅샷을 복원한 뒤 구독을 재연결한다", () => {
    const admin = source("src/app/retreat/[id]/RetreatPageClient.tsx");
    const programs = source("src/app/retreat/[id]/programs/ProgramPreparationClient.tsx");
    const field = source("src/features/iguard/hooks/useRetreatData.ts");

    expect(admin).toContain("getRetreatWorkspaceSnapshot(id)");
    expect(programs).toContain("getRetreatWorkspaceSnapshot(retreatId)");
    expect(field).toContain("getCachedRetreatData(id)");
    expect(field).toContain('if (typeof window === "undefined") return null');
    expect(field).toContain("retreatDataCache.set(id");
  });
});
