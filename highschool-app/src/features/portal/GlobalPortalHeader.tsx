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
      <header className="sticky top-0 z-[60] h-14 border-b border-white/[0.08] bg-[#18233f]/95 text-white shadow-[0_6px_24px_rgba(16,24,46,0.16)] backdrop-blur-xl">
        <div className="mx-auto flex h-full max-w-[1760px] items-center gap-3 px-3 sm:px-5">
          <Link href="/" className="group flex min-w-0 shrink-0 items-center gap-2.5 rounded-xl pr-1 transition hover:text-white" aria-label="분당우리교회 서현고등부 홈으로">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-[#5c7cfa] to-[#0f9d8c] text-sm font-black shadow-[0_6px_16px_rgba(62,99,221,0.3)] transition group-hover:-translate-y-0.5">W</span>
            <span className="hidden text-[13px] font-bold tracking-[-0.01em] text-slate-100 sm:inline">분당우리교회 서현고등부</span>
            <span className="text-[13px] font-bold sm:hidden">홈</span>
          </Link>

          <nav className="ml-1 flex min-w-0 flex-1 items-center gap-1" aria-label="통합 사역 메뉴">
            {semesterAllowed && (
              <Link
                href="/semesters"
                className={`rounded-xl px-2.5 py-2 text-xs font-semibold transition sm:px-3 ${currentArea === "semester" ? "bg-white/[0.12] text-white shadow-inner" : "text-[var(--color-on-dark-secondary)] hover:bg-white/[0.07] hover:text-white"}`}
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
                  className={`flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition sm:px-3 ${currentArea === "vacation" ? "bg-white/[0.12] text-white shadow-inner" : "text-[var(--color-on-dark-secondary)] hover:bg-white/[0.07] hover:text-white"}`}
                >
                  방학 중 사역
                  <span aria-hidden="true" className="text-[9px] opacity-70">▼</span>
                </button>
                {vacationOpen && (
                  <div className="absolute left-0 top-full z-[70] w-56 pt-1.5">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#202d4b] p-1.5 shadow-2xl shadow-slate-950/30">
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
              <button onClick={() => setTeamOpen(true)} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-on-dark-primary)] transition hover:bg-white/10 hover:text-white">
                <span aria-hidden="true" className="text-[#8ee1d5]">●</span><span className="hidden sm:inline"> 팀원 관리</span>
              </button>
            )}
            <span className="hidden max-w-32 truncate text-xs text-[var(--color-on-dark-primary)] lg:inline">{user.displayName || user.email}</span>
            <button onClick={() => void signOut()} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-[var(--color-on-dark-secondary)] hover:text-white" aria-label="로그아웃">
              <span className="hidden sm:inline">로그아웃</span><span className="sm:hidden">↪</span>
            </button>
          </div>
        </div>
      </header>
      {teamOpen && <TeamModal onClose={() => setTeamOpen(false)} />}
    </>
  );
}
