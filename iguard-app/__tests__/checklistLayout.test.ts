import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("호차별 인원체크 모바일 레이아웃", () => {
  it("호차별은 모바일부터 2열이고 조별은 기존 모바일 1열을 유지한다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/ChecklistView.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain('mode === "호차별" ? "grid grid-cols-2 gap-2 sm:gap-4" : "grid gap-4 sm:grid-cols-2"');
    expect(source).toContain("grid-cols-[1.5rem_minmax(0,1fr)]");
    expect(source).toContain("min-w-0 sm:hidden");
    expect(source).toContain("hidden w-5 text-xs text-slate-400 sm:inline-block");
  });

  it("체크는 기존 멱등 저장과 확인 후 해제를 유지한다", () => {
    const source = readFileSync(
      new URL("../src/app/retreat/[id]/ChecklistView.tsx", import.meta.url),
      "utf8",
    );

    expect(source).toContain("if (checkedKeys.has(k)) return");
    expect(source).toContain("await updateIguardAttendance(retreatId, k, true, byName)");
    expect(source).toContain("await uiConfirm(`${m.name} 체크를 해제할까요?`)");
  });
});
