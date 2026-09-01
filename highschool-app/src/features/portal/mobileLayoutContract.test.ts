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

  it("새친구 편집기는 필드 고유 너비가 달라도 세로축으로만 스크롤한다", () => {
    const css = source("src/app/globals.css");
    const newFriends = source("src/app/semester/[id]/NewFriendsTab.tsx");
    expect(newFriends).toContain("block min-w-0 text-xs");
    expect(css).toContain(".new-friend-editor .input");
    expect(css).toContain("min-width: 0;");
    expect(css).toContain("max-width: 100%;");
    expect(css).toContain("overflow-x: hidden;");
    expect(css).toContain("touch-action: pan-y;");
  });

  it("새친구 접수는 선택형 인도자·신급과 수정 가능한 등록일을 제공하고 선물일 입력은 노출하지 않는다", () => {
    const newFriends = source("src/app/semester/[id]/NewFriendsTab.tsx");
    expect(newFriends).toContain('Field label="새친구 등록일"');
    expect(newFriends).toContain("NEW_FRIEND_INVITER_OPTIONS.map");
    expect(newFriends).toContain("NEW_FRIEND_FAITH_STEP_OPTIONS.map");
    expect(newFriends).not.toContain('Field label="등반 선물 전달일"');
    expect(newFriends.indexOf('>No.</th>')).toBeLessThan(newFriends.indexOf('>등록일</th>'));
    expect(newFriends.indexOf('>등록일</th>')).toBeLessThan(newFriends.indexOf('>이름</th>'));
  });

  it("새친구, 등록 현황, 행정 변동은 모바일 전용 목록과 데스크톱 표를 함께 제공한다", () => {
    expect(source("src/app/semester/[id]/NewFriendsTab.tsx")).toContain("새친구 진행 현황 모바일 목록");
    const sundayTabs = source("src/features/sundayMinistry/SundayMinistryTabs.tsx");
    expect(sundayTabs).toContain("출석부 등록 현황 모바일 목록");
    expect(sundayTabs).toContain("행정 변동 사항 모바일 목록");
    expect(sundayTabs).toContain("hidden overflow-x-auto sm:block");
  });

  it("모바일 상단의 새로고침과 이가드 현장 행동은 한 줄을 유지한다", () => {
    expect(source("src/app/UpdateBanner.tsx")).toContain("shrink-0 whitespace-nowrap");
    const retreatHeader = source("src/app/retreat/[id]/RetreatPageClient.tsx");
    expect(retreatHeader).toContain("ml-auto shrink-0 whitespace-nowrap");
  });

  it("반별 명단 학생 셀은 전역 카드 표보다 조밀한 전용 행간을 사용한다", () => {
    expect(source("src/app/retreat/[id]/ClassRosterTab.tsx")).toContain("class-roster-grid cell-action-grid text-xs");
    const css = source("src/app/globals.css");
    expect(css).toContain(".card table.class-roster-grid tbody td");
    expect(css).toContain("height: 24px;");
    expect(css).toContain("height: 26px;");
    expect(css).toContain("padding-top: 1px;");
    expect(css).toContain("padding-bottom: 1px;");
    expect(css).toContain("white-space: nowrap;");
  });

  it("모든 역할의 마이페이지는 공통 탭과 관리자 전용 탭을 구분한다", () => {
    const myPage = source("src/features/portal/MyPageModal.tsx");
    expect(myPage).toContain('initialTab = "dashboard"');
    expect(myPage).toContain(">대시보드</TabButton>");
    expect(myPage).toContain(">내 사역</TabButton>");
    expect(myPage).toContain(">내 요청</TabButton>");
    expect(myPage).toContain(">팀원 관리</TabButton>");
    expect(myPage).toContain(">요청사항</TabButton>");
    expect(myPage).toContain("<RoleDashboardPanel />");
    expect(myPage).toContain("canManageTeam && <TabButton");
    expect(myPage).toContain("canManageRequests && <TabButton");
    const header = source("src/features/portal/GlobalPortalHeader.tsx");
    expect(header).toContain("<span>마이페이지</span>");
    expect(header).not.toContain("teamOpen");
  });

  it("PC 모바일 미리보기는 CSS 축소가 아니라 실제 430px 모바일 앱을 실행한다", () => {
    const layout = source("src/app/layout.tsx");
    const shell = source("src/components/PortalViewportShell.tsx");
    const header = source("src/features/portal/GlobalPortalHeader.tsx");
    const css = source("src/app/globals.css");
    expect(layout).toContain("<PortalViewportShell>{children}</PortalViewportShell>");
    expect(shell).toContain("shouldUseMobilePreview(mode, isViewportMobile)");
    expect(shell).toContain('<iframe');
    expect(shell).toContain('className="portal-mobile-preview-frame"');
    expect(shell).toContain('title="고등부 통합사이트 모바일 화면"');
    expect(header).toContain("모바일 화면 미리보기");
    expect(css).toContain("width: min(430px, calc(100vw - 32px));");
    expect(css).toContain("height: min(844px, calc(100dvh - 84px));");
    expect(css).not.toContain('html[data-view-preview="true"] .home-hero');
  });

  it("PC버전은 처음부터 같은 1280px 프레임을 사용해 리사이즈 중 화면을 교체하지 않는다", () => {
    const shell = source("src/components/PortalViewportShell.tsx");
    const css = source("src/app/globals.css");
    expect(shell).toContain("shouldUseDesktopFrame(mode, isEmbeddedDesktopFrame)");
    expect(shell).toContain('className="portal-desktop-lock-frame"');
    expect(shell).toContain("name={DESKTOP_FRAME_NAME}");
    expect(shell).toContain("const [src] = useState(initialSrc)");
    expect(shell).toContain("frameLocation.replace(nextFrameLocation)");
    expect(shell).toContain('History.prototype.replaceState.call(window.history, null, "", nextLocation)');
    expect(shell).not.toContain("router.replace(nextLocation");
    expect(shell).toContain("stripDesktopFrameSearch(frameLocation.search)");
    expect(shell).toContain("currentMobileFrameSrc");
    expect(shell).toContain('frameDocument.readyState !== "complete"');
    expect(shell).toContain("setLoadedFrameKey(frameKey)");
    expect(shell).toContain('title="고등부 통합사이트 PC 화면"');
    expect(css).toContain(".portal-desktop-lock-frame");
    expect(css).toContain("width: max(100%, 1280px);");
    expect(css).toContain("min-width: 1280px;");
  });
});
