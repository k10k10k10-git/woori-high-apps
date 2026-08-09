"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import TeamModal from "./TeamModal";
import { canAccessPortalArea, canManageRoles } from "./accessPolicy";

type GlobalArea = "home" | "semester" | "vacation";

function activeArea(pathname: string): GlobalArea {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/semester")) return "semester";
  return "vacation";
}

export default function GlobalPortalHeader() {
  const pathname = usePathname();
  const { user, loading, role, signOut } = useAuth();
  const [teamOpen, setTeamOpen] = useState(false);
  const [vacationOpen, setVacationOpen] = useState(false);
  const vacationRef = useRef<HTMLDivElement>(null);
  const currentArea = activeArea(pathname);
  const openTeam = useCallback(() => setTeamOpen(true), []);

  useEffect(() => {
    window.addEventListener("portal:open-team", openTeam);
    return () => window.removeEventListener("portal:open-team", openTeam);
  }, [openTeam]);

  // 드롭다운 닫기는 이벤트에서만 한다(effect에서 setState하면 cascading render).
  useEffect(() => {
    if (!vacationOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setVacationOpen(false);
    }
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (!vacationRef.current?.contains(event.target as Node)) setVacationOpen(false);
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [vacationOpen]);

  if (loading || !user) return null;

  const semesterAllowed = canAccessPortalArea("semester", role);
  // 방학 중 사역은 드롭다운 두 갈래. 두 경로 모두 **같은 홈 화면**(VacationHome)을 보여주고,
  // 수련회에 들어갔을 때 행정 화면이냐 현장 화면이냐만 달라진다.
  const vacationItems = [
    ...(canAccessPortalArea("retreat-admin", role) ? [{ href: "/retreats", label: "수련회 행정팀", hint: "신청·편성·물품" }] : []),
    ...(canAccessPortalArea("retreat-field", role) ? [{ href: "/field", label: "수련회 이가드팀", hint: "현장 운영·큐싯" }] : []),
  ];

  return (
    <>
      <header className="global-portal-header">
        <div className="global-portal-inner">
          <Link href="/" className="portal-brand group" aria-label="분당우리교회 서현고등부 홈으로">
            <span className="portal-brand-mark transition group-hover:-translate-y-0.5">W</span>
            <span className="portal-brand-name hidden sm:inline">분당우리교회 서현고등부</span>
            <span className="text-[13px] font-bold sm:hidden">홈</span>
          </Link>

          <nav className="portal-nav" aria-label="통합 사역 메뉴">
            {semesterAllowed && (
              <Link
                href="/semesters"
                className="portal-nav-link"
                aria-current={currentArea === "semester" ? "page" : undefined}
              >
                학기 중 사역
              </Link>
            )}

            {vacationItems.length > 0 && (
              <div
                ref={vacationRef}
                className="relative"
                onMouseEnter={() => setVacationOpen(true)}
                onMouseLeave={() => setVacationOpen(false)}
              >
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={vacationOpen}
                  onClick={() => setVacationOpen((open) => !open)}
                  onFocus={() => setVacationOpen(true)}
                  className="portal-nav-link"
                  data-active={currentArea === "vacation" ? "true" : undefined}
                >
                  방학 중 사역
                  <span aria-hidden="true" className="text-[9px] opacity-70">▼</span>
                </button>
                {vacationOpen && (
                  <div className="absolute left-0 top-full z-[70] w-56 pt-1.5">
                    <div className="portal-menu">
                      {vacationItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setVacationOpen(false)}
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
            )}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {canManageRoles(role) && (
              <button onClick={() => setTeamOpen(true)} className="portal-action">
                <span aria-hidden="true" className="text-[var(--color-on-dark-accent)]">●</span><span className="hidden sm:inline">팀원 관리</span>
              </button>
            )}
            <span className="portal-account-name hidden lg:inline">{user.displayName || user.email}</span>
            <button onClick={() => void signOut()} className="portal-action" aria-label="로그아웃">
              <span className="hidden sm:inline">로그아웃</span><span className="sm:hidden">↪</span>
            </button>
          </div>
        </div>
      </header>
      {teamOpen && <TeamModal onClose={() => setTeamOpen(false)} />}
    </>
  );
}
