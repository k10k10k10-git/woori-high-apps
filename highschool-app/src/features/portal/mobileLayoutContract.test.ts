import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("모바일 운영 화면 계약", () => {
  it("모든 aria-modal을 공통 스크롤 관리자가 감시한다", () => {
    expect(source("src/app/providers.tsx")).toContain("<ModalScrollManager />");
    expect(source("src/components/ModalScrollManager.tsx")).toContain('[aria-modal="true"]');
    expect(source("src/components/ModalScrollManager.tsx")).toContain('body.style.position = "fixed"');
  });

  it("새친구 편집기는 정의되지 않은 레거시 클래스 대신 공통 전체 화면 시트를 사용한다", () => {
    const newFriends = source("src/app/semester/[id]/NewFriendsTab.tsx");
    expect(newFriends).toContain('variant="fullscreen-mobile"');
    expect(newFriends).toContain("overlay-panel-body");
    expect(newFriends).toContain("overlay-panel-footer");
    expect(newFriends).not.toContain('className="modal-overlay center-modal"');
  });

  it.each([320, 390, 430])("%dpx 폭이 같은 640px 이하 모바일 계약을 사용한다", (width) => {
    expect(width).toBeLessThanOrEqual(640);
    const css = source("src/app/globals.css");
    expect(css).toContain("height: 100dvh");
    expect(css).toContain("overscroll-behavior: contain");
    expect(css).toContain(".workspace-sticky-header {\n    position: relative;");
  });

  it("새친구, 등록 현황, 행정 변동은 모바일 전용 목록과 데스크톱 표를 함께 제공한다", () => {
    expect(source("src/app/semester/[id]/NewFriendsTab.tsx")).toContain("새친구 진행 현황 모바일 목록");
    const sundayTabs = source("src/features/sundayMinistry/SundayMinistryTabs.tsx");
    expect(sundayTabs).toContain("출석부 등록 현황 모바일 목록");
    expect(sundayTabs).toContain("행정 변동 사항 모바일 목록");
    expect(sundayTabs).toContain("hidden overflow-x-auto sm:block");
  });
});
