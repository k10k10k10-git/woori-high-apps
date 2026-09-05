"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDown, DotsThree, SignOut, UserCircle } from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";
import type { MyPageTab } from "./MyPageModal";
import PortalSearch from "./PortalSearch";
import ThemeToggle from "@/components/ThemeToggle";
import ViewModeToggle from "@/components/ViewModeToggle";
import OverlayShell from "@/components/OverlayShell";
import { useViewMode } from "@/context/ViewModeContext";
import { canAccessArea, canAccessSundayTeam, canManageRolesOf, ownSundayTeam } from "./accessPolicy";
import { SUNDAY_MINISTRY_TEAMS, sundayTeamHref } from "./featureCatalog";

const MyPageModal = dynamic(() => import("./MyPageModal"), { ssr: false });

type GlobalArea = "home" | "semester" | "sunday" | "guide" | "vacation" | "suggestions";
type MyPageSession = { pathname: string; uid: string; initialTab: MyPageTab };

type NavItem = { href: string; label: string; hint: string; disabled?: boolean };

/**
 * 상단 메뉴의 hover 드롭다운. 주일 사역과 방학 중 사역이 **같은 컴포넌트**를 써야
 * 두 메뉴의 여닫힘·키보드·바깥클릭 동작이 갈라지지 않는다.
 * 열림 상태는 부모가 들고 있어 한쪽을 열면 다른 쪽이 닫힌다.
 */
function NavDropdown({ label, items, active, open, onOpen, onClose }: {
  label: string;
  items: NavItem[];
  active: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // 드롭다운 닫기는 이벤트에서만 한다(effect에서 setState하면 cascading render).
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, onClose]);

  return (
    <div
      ref={ref}
      className="portal-nav-dropdown relative"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={onOpen}
        className="portal-nav-link"
        data-active={active ? "true" : undefined}
      >
        {label}
        <span aria-hidden="true" className="text-[9px] opacity-70">▼</span>
      </button>
      {open && (
        <div className="portal-dropdown-panel absolute left-0 top-full z-[70] w-56 pt-1.5">
          <div className="portal-menu">
            {items.map((item) => item.disabled ? (
              <div
                key={item.href}
                aria-disabled="true"
                className="rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-500"
              >
                {item.label}
                <span className="mt-0.5 block text-[10px] font-normal text-slate-600">{item.hint}</span>
              </div>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="block rounded-xl px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
              >
                {item.label}
                <span className="mt-0.5 block text-[10px] font-normal text-[var(--color-on-dark-muted)]">{item.hint}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function activeArea(pathname: string): GlobalArea {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/sunday-ministry") || pathname.startsWith("/semester-admin")) return "sunday";
  if (pathname.startsWith("/semester")) return "semester";
  if (pathname.startsWith("/ministry-guide")) return "guide";
  if (pathname.startsWith("/suggestions")) return "suggestions";
  return "vacation";
}

const AREA_LABEL: Record<GlobalArea, string> = {
  home: "통합 홈",
  semester: "학기 중 사역",
  sunday: "주일 사역",
  vacation: "방학 중 사역",
  guide: "사역 가이드",
  suggestions: "사이트 건의사항",
};

export default function GlobalPortalHeader() {
  const pathname = usePathname();
  const { user, loading, roles, signOut } = useAuth();
  const { mode, isViewportMobile } = useViewMode();
  const [myPage, setMyPage] = useState<MyPageSession | null>(null);
  const [openMenu, setOpenMenu] = useState<"sunday" | "vacation" | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const currentArea = activeArea(pathname);
  // 다른 업무로 이동하면 이전 모달을 폐기한다. 뒤로가기로 돌아와도 다시 열리지 않는다.
  if (myPage && (myPage.pathname !== pathname || myPage.uid !== user?.uid)) {
    setMyPage(null);
  }
  const openMyPage = useCallback((tab: MyPageTab = "dashboard") => {
    if (!user) return;
    setMyPage({ pathname, uid: user.uid, initialTab: tab });
  }, [pathname, user]);
  const openTeam = useCallback(() => {
    if (!canManageRolesOf(roles)) return;
    openMyPage("team");
  }, [openMyPage, roles]);
  const closeMenu = useCallback(() => setOpenMenu(null), []);
  const openSunday = useCallback(() => setOpenMenu("sunday"), []);
  const openVacation = useCallback(() => setOpenMenu("vacation"), []);

  useEffect(() => {
    window.addEventListener("portal:open-team", openTeam);
    return () => window.removeEventListener("portal:open-team", openTeam);
  }, [openTeam]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  if (loading || !user) return null;

  const isMobilePreview = !isViewportMobile && mode === "mobile";

  const semesterAllowed = canAccessArea("semester", roles);
  const assignedSundayTeam = ownSundayTeam(roles);
  // 방학 중 사역은 행정·프로그램 준비·이가드 세 갈래다.
  // 세 경로 모두 **같은 홈 화면**(VacationHome)을 보여주고, 선택 후 업무 화면만 달라진다.
  const vacationItems: NavItem[] = [
    ...(canAccessArea("retreat-admin", roles) ? [{ href: "/retreats", label: "수련회 행정팀", hint: "신청·편성·물품" }] : []),
    ...(canAccessArea("retreat-admin", roles) ? [{ href: "/programs", label: "수련회 프로그램팀", hint: "기획·진행안·브리핑" }] : []),
    ...(canAccessArea("retreat-field", roles) ? [{ href: "/field", label: "수련회 이가드팀", hint: "현장 운영·큐싯" }] : []),
  ];
  // 주일 사역도 같은 드롭다운 구조다. 팀 목록은 featureCatalog가 단일 원천.
  // 들어갈 수 없는 팀은 메뉴에서 뺀다 — 눌러도 막히는 항목을 남겨두면 목록이 거짓말이 된다.
  const sundayItems: NavItem[] = SUNDAY_MINISTRY_TEAMS
    .filter((team) => canAccessSundayTeam(team.key, roles))
    .map((team) => ({
      href: sundayTeamHref(team.key),
      label: team.label,
      hint: team.hint,
      // 기획 중 팀은 완성된 기능처럼 열지 않는다. 다만 그 팀으로 배정된
      // 사용자는 자신의 준비 화면과 건의사항 진입을 계속 쓸 수 있다.
      disabled: team.status === "planned" && assignedSundayTeam !== team.key,
    }));

  // PC에서 모바일버전을 볼 때 이 헤더는 사이트 내비게이션이 아니라 미리보기
  // 제어 막대만 담당한다. 실제 모바일 헤더와 메뉴는 430px 프레임 안의 앱이 렌더한다.
  if (isMobilePreview) {
    return (
      <>
        <header className="portal-preview-toolbar" aria-label="모바일 미리보기 제어">
          <div className="portal-preview-toolbar__inner">
            <Link href="/" className="portal-preview-toolbar__brand" aria-label="분당우리교회 서현고등부 홈으로">
              <span className="portal-brand-mark">W</span>
              <span>모바일 화면 미리보기</span>
            </Link>
            <div className="portal-preview-toolbar__controls">
              <ViewModeToggle />
              <ThemeToggle showLabel />
              <button onClick={() => openMyPage()} className="portal-compact-action portal-compact-action--account">
                <UserCircle aria-hidden="true" size={16} />
                <span>마이페이지</span>
              </button>
              <span className="portal-account-name">{user.displayName || user.email}</span>
              <button onClick={() => void signOut()} className="portal-compact-action portal-compact-action--quiet" aria-label="로그아웃">
                <span>로그아웃</span>
              </button>
            </div>
          </div>
        </header>
        {myPage && <MyPageModal initialTab={myPage.initialTab} onClose={() => setMyPage(null)} />}
      </>
    );
  }

  return (
    <>
      <header className="global-portal-header">
        <div className="global-portal-inner">
          <Link href="/" className="portal-brand group" aria-label="분당우리교회 서현고등부 홈으로">
            <span className="portal-brand-mark transition group-hover:-translate-y-0.5">W</span>
            <span className="portal-brand-name hidden sm:inline">분당우리교회 서현고등부</span>
          </Link>

          <button
            type="button"
            className="portal-mobile-area"
            onClick={() => setMobileMenuOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={mobileMenuOpen}
          >
            <span>{AREA_LABEL[currentArea]}</span>
            <CaretDown aria-hidden="true" size={13} weight="bold" />
          </button>

          <nav className={`portal-nav ${openMenu ? "portal-nav-menu-open" : ""}`} aria-label="통합 사역 메뉴">
            {semesterAllowed && (
              <Link
                href="/semesters"
                className="portal-nav-link"
                aria-current={currentArea === "semester" ? "page" : undefined}
              >
                학기 중 사역
              </Link>
            )}

            {semesterAllowed && (
              <NavDropdown
                label="주일 사역"
                items={sundayItems}
                active={currentArea === "sunday"}
                open={openMenu === "sunday"}
                onOpen={openSunday}
                onClose={closeMenu}
              />
            )}

            {vacationItems.length > 0 && (
              <NavDropdown
                label="방학 중 사역"
                items={vacationItems}
                active={currentArea === "vacation"}
                open={openMenu === "vacation"}
                onOpen={openVacation}
                onClose={closeMenu}
              />
            )}

            <Link
              href="/ministry-guide"
              className="portal-nav-link"
              aria-current={currentArea === "guide" ? "page" : undefined}
            >
              사역 가이드
            </Link>

            <Link
              href="/suggestions"
              className="portal-nav-link"
              aria-current={currentArea === "suggestions" ? "page" : undefined}
            >
              사이트 건의사항
            </Link>
          </nav>

          <div className="portal-header-tools">
            <div className="portal-account-row portal-account-row--desktop">
              <ViewModeToggle />
              <ThemeToggle showLabel />
              <button onClick={() => openMyPage()} className="portal-compact-action portal-compact-action--account">
                <UserCircle aria-hidden="true" size={16} />
                <span>마이페이지</span>
              </button>
              <span className="portal-account-name hidden md:inline">{user.displayName || user.email}</span>
              <button onClick={() => void signOut()} className="portal-compact-action portal-compact-action--quiet" aria-label="로그아웃">
                <SignOut aria-hidden="true" className="sm:hidden" size={16} /><span className="hidden sm:inline">로그아웃</span>
              </button>
            </div>
            <PortalSearch />
            <button
              type="button"
              className="portal-mobile-more"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="사이트 메뉴 열기"
              aria-haspopup="dialog"
              aria-expanded={mobileMenuOpen}
            >
              <DotsThree aria-hidden="true" size={22} weight="bold" />
            </button>
          </div>
        </div>
      </header>
      {mobileMenuOpen && (
        <OverlayShell
          label="사이트 메뉴"
          onClose={() => setMobileMenuOpen(false)}
          variant="bottom-sheet"
          panelClassName="portal-mobile-sheet"
        >
            <div className="portal-mobile-sheet-handle" aria-hidden="true" />
            <p className="portal-mobile-sheet-title">사역 메뉴</p>
            <nav className="portal-mobile-links" aria-label="모바일 통합 사역 메뉴">
              <Link href="/" aria-current={currentArea === "home" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>통합 홈</Link>
              {semesterAllowed && <Link href="/semesters" aria-current={currentArea === "semester" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>학기 중 사역</Link>}
              {semesterAllowed && sundayItems.length > 0 && <Link href="/sunday-ministry" aria-current={currentArea === "sunday" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>주일 사역</Link>}
              {vacationItems.length > 0 && <Link href={(vacationItems.find((item) => item.href === "/field") ?? vacationItems[0]).href} aria-current={currentArea === "vacation" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>방학 중 사역</Link>}
              <Link href="/ministry-guide" aria-current={currentArea === "guide" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>사역 가이드</Link>
              <Link href="/suggestions" aria-current={currentArea === "suggestions" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>사이트 건의사항</Link>
            </nav>
            <div className="portal-mobile-account">
              <ThemeToggle showLabel />
              <button onClick={() => {
                setMobileMenuOpen(false);
                openMyPage();
              }}>
                <UserCircle aria-hidden="true" size={18} />
                <span>마이페이지</span>
              </button>
              <button onClick={() => void signOut()}>
                <SignOut aria-hidden="true" size={18} />
                <span>로그아웃</span>
              </button>
            </div>
        </OverlayShell>
      )}
      {myPage && <MyPageModal initialTab={myPage.initialTab} onClose={() => setMyPage(null)} />}
    </>
  );
}
