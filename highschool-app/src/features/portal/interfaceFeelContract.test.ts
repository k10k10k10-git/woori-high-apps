import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("인터페이스 촉감·접근성 계약", () => {
  it("공통 버튼과 헤더 제어는 작은 포인터 표적을 만들지 않는다", () => {
    const css = source("src/app/globals.css");
    expect(css).toContain(".btn-sm {");
    expect(css).toContain("min-height: 40px;");
    expect(css).toContain(".portal-account-row { display: flex; min-height: 40px;");
    expect(css).toContain(".portal-compact-action {\n  display: inline-flex;\n  min-height: 40px;");
    expect(css).toContain(".view-mode-toggle button {\n  display: inline-flex;\n  min-height: 40px;");
    expect(css).toContain(".portal-search-trigger {\n  display: inline-flex;\n  min-height: 40px;");
    expect(css).toContain(".portal-brand { display: inline-flex; min-width: 40px; min-height: 40px;");
  });

  it("아이콘 버튼과 출석 상태는 키보드·터치 표적 계약을 공유한다", () => {
    const controls = source("src/app/interaction-controls.css");
    const attendance = source("src/app/semester/[id]/AttendanceTab.tsx");
    expect(controls).toContain(".compact-icon-control");
    expect(controls).toContain(".attendance-status-choice");
    expect(controls).toContain("min-width: 44px;");
    expect(attendance).toContain('entry?.s === s ? on : "attendance-status-choice"');
    expect(attendance).toContain("<Backspace");
    expect(attendance).not.toContain("⌫");
  });

  it("카드 선택과 배정 해제는 div·span 클릭이 아닌 링크·버튼이다", () => {
    const vacation = source("src/features/portal/VacationHome.tsx");
    const groupStaff = source("src/app/retreat/[id]/field/GroupStaffView.tsx");
    expect(vacation).toContain("<Link\n                      href={entryHref(retreat.id)}");
    expect(vacation).not.toMatch(/<div[^>]*onClick=/);
    expect(groupStaff).toContain('aria-label={`${staffById.get(sid)?.name ?? "미상"} 조스탭 배정 해제`}');
    expect(groupStaff).not.toMatch(/<span[^>]*onClick=/);
  });

  it("모션은 필요한 속성만 전환하고 모달 진입 키프레임을 강제하지 않는다", () => {
    const files = [
      "src/app/RetreatsHome.tsx",
      "src/app/retreat/[id]/SuppliesTab.tsx",
      "src/app/retreat/[id]/OnSiteRegistrationTab.tsx",
      "src/app/retreat/[id]/AdminSuppliesTab.tsx",
      "src/app/retreat/[id]/GroupComponents.tsx",
      "src/app/retreat/[id]/RoomComponents.tsx",
      "src/features/portal/VacationHome.tsx",
    ];
    for (const file of files) expect(source(file)).not.toContain("transition-all");
    const css = source("src/app/globals.css");
    expect(css).not.toContain("@keyframes modalIn");
    expect(css).not.toContain("@keyframes backdropIn");
    expect(css).toContain("transform: scale(0.96)");
    expect(css).not.toContain("transform: scale(0.97)");
  });

  it("사진·첨부·도면과 양 테마 타이포그래피에 공통 경계·렌더링을 적용한다", () => {
    const css = source("src/app/globals.css");
    expect(css).toContain("-moz-osx-font-smoothing: grayscale;");
    expect(css).toContain("text-wrap: balance;");
    expect(css).toContain("text-wrap: pretty;");
    expect(css).toContain(".media-outline");
    expect(source("src/features/landing/LandingPage.tsx")).toContain('className="landing-hero-media media-outline"');
    expect(source("src/features/portal/SiteRequestsPanel.tsx")).toContain('className="media-outline block overflow-hidden');
    expect(source("src/app/retreat/[id]/field/LodgingMapView.tsx")).toContain('className="media-outline overflow-x-auto');
  });

  it("배치 화면의 교사·조장 아이콘은 Phosphor 한 계열을 사용한다", () => {
    const files = [
      source("src/app/retreat/[id]/GroupComponents.tsx"),
      source("src/app/retreat/[id]/RoomComponents.tsx"),
      source("src/app/retreat/[id]/field/GroupStaffView.tsx"),
    ];
    for (const file of files) {
      expect(file).not.toContain("👨‍🏫");
      expect(file).not.toContain("👑");
    }
    expect(files.join("\n")).toContain("ChalkboardTeacher");
    expect(files.join("\n")).toContain("<X");
  });
});
