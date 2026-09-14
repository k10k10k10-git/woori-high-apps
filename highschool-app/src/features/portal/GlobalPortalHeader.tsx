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
import { canAccessArea, canAccessSundayTeam, canManageRolesOf } from "./accessPolicy";
import { SUNDAY_MINISTRY_TEAMS } from "./featureCatalog";
import { accessibleTeamKeys, canAccessOperationsCenter } from "@/features/teams/teamModel";

const MyPageModal = dynamic(() => import("./MyPageModal"), { ssr: false });

type GlobalArea = "home" | "teams" | "events" | "operations" | "library" | "help";
type MyPageSession = { pathname: string; uid: string; initialTab: MyPageTab };

type NavItem = { href: string; label: string; hint: string; disabled?: boolean };

/**
 * 상단 메뉴의 hover 드롭다운. 팀 목록을 키보드·바깥클릭으로 일관되게 다룬다.
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
  if (pathname.startsWith("/teams") || pathname.startsWith("/sunday-ministry")) return "teams";
  if (pathname.startsWith("/operations") || pathname.startsWith("/semester")) return "operations";
  if (pathname.startsWith("/library") || pathname.startsWith("/ministry-guide")) return "library";
  if (pathname.startsWith("/help") || pathname.startsWith("/suggestions")) return "help";
  return "events";
}

const AREA_LABEL: Record<GlobalArea, string> = {
  home: "통합 홈",
  teams: "팀",
  events: "행사",
  operations: "운영센터",
  library: "자료",
  help: "도움말",
};

export default function GlobalPortalHeader() {
  const pathname = usePathname();
  const { user, loading, roles, teamMemberships, signOut } = useAuth();
  const { mode, isViewportMobile } = useViewMode();
  const [myPage, setMyPage] = useState<MyPageSession | null>(null);
  const [openMenu, setOpenMenu] = useState<"teams" | null>(null);
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
  const openTeams = useCallback(() => setOpenMenu("teams"), []);

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

  const operationsAllowed = canAccessOperationsCenter(roles, teamMemberships) || canManageRolesOf(roles);
  const eventsAllowed = canAccessArea("retreat-admin", roles) || canAccessArea("retreat-field", roles);
  const teamKeys = teamMemberships
    ? accessibleTeamKeys(roles, teamMemberships)
    : SUNDAY_MINISTRY_TEAMS.filter((team) => canAccessSundayTeam(team.key, roles)).map((team) => team.key);
  const teamItems: NavItem[] = SUNDAY_MINISTRY_TEAMS
    .filter((team) => teamKeys.includes(team.key))
    .map((team) => ({
      href: `/teams/${team.key}`,
      label: team.label,
      hint: team.hint,
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
            {teamItems.length > 0 && (
              <NavDropdown
                label="팀"
                items={teamItems}
                active={currentArea === "teams"}
                open={openMenu === "teams"}
                onOpen={openTeams}
                onClose={closeMenu}
              />
            )}

            {eventsAllowed && (
              <Link
                href="/events"
                className="portal-nav-link"
                aria-current={currentArea === "events" ? "page" : undefined}
              >
                행사
              </Link>
            )}

            {operationsAllowed && <Link href="/operations" className="portal-nav-link" aria-current={currentArea === "operations" ? "page" : undefined}>운영센터</Link>}

            <Link href="/library" className="portal-nav-link" aria-current={currentArea === "library" ? "page" : undefined}>자료</Link>
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
      <nav className="portal-mobile-bottom-nav" aria-label="주요 메뉴">
        <Link href="/" aria-current={currentArea === "home" ? "page" : undefined}><span>홈</span></Link>
        {teamItems.length > 0 && <Link href="/teams" aria-current={currentArea === "teams" ? "page" : undefined}><span>팀</span></Link>}
        {eventsAllowed && <Link href="/events" aria-current={currentArea === "events" ? "page" : undefined}><span>행사</span></Link>}
        {operationsAllowed && <Link href="/operations" aria-current={currentArea === "operations" ? "page" : undefined}><span>운영</span></Link>}
        <Link href="/library" aria-current={currentArea === "library" ? "page" : undefined}><span>자료</span></Link>
      </nav>
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
              <Link href="/" aria-current={currentArea === "home" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>홈</Link>
              {teamItems.length > 0 && <Link href="/teams" aria-current={currentArea === "teams" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>팀</Link>}
              {eventsAllowed && <Link href="/events" aria-current={currentArea === "events" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>행사</Link>}
              {operationsAllowed && <Link href="/operations" aria-current={currentArea === "operations" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>운영센터</Link>}
              <Link href="/library" aria-current={currentArea === "library" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>자료</Link>
              <Link href="/help/feedback" aria-current={currentArea === "help" ? "page" : undefined} onClick={() => setMobileMenuOpen(false)}>문제 제보</Link>
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
