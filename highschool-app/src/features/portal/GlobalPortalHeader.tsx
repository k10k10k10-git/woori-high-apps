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

  // 드롭다운 닫기는 이벤트에서만 한다(링크 클릭·바깥 클릭·ESC·마우스 이탈).
  // 라우트 변경 effect에서 setState하면 cascading render가 된다.
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
  const vacationItems = [
    ...(canAccessPortalArea("retreat-admin", role) ? [{ href: "/retreats", label: "수련회 행정팀", hint: "신청·편성·물품" }] : []),
    ...(canAccessPortalArea("retreat-field", role) ? [{ href: "/field", label: "수련회 이가드팀", hint: "현장 운영·큐싯" }] : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-[60] h-14 border-b border-white/10 bg-slate-950 text-white shadow-sm">
        <div className="mx-auto flex h-full max-w-[1760px] items-center gap-3 px-3 sm:px-5">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg pr-1 hover:text-emerald-200" aria-label="고등부 사역 플랫폼 홈으로">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-violet-500 text-sm font-black">W</span>
            <span className="hidden font-bold sm:inline">고등부 사역 플랫폼</span>
            <span className="font-bold sm:hidden">홈</span>
          </Link>

          <nav className="ml-1 flex min-w-0 flex-1 items-center gap-1" aria-label="통합 사역 메뉴">
            {semesterAllowed && (
              <Link
                href="/semesters"
                className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:px-3 ${currentArea === "semester" ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/8 hover:text-white"}`}
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
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:px-3 ${currentArea === "vacation" ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/8 hover:text-white"}`}
                >
                  방학 중 사역
                  <span aria-hidden="true" className="text-[9px] opacity-70">▼</span>
                </button>
                {vacationOpen && (
                  <div className="absolute left-0 top-full z-[70] w-56 pt-1.5">
                    <div className="overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-xl">
                      {vacationItems.map((item) => (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setVacationOpen(false)}
                          className="block px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:bg-white/10 hover:text-white"
                        >
                          {item.label}
                          <span className="mt-0.5 block text-[10px] font-normal text-slate-500">{item.hint}</span>
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
              <button onClick={() => setTeamOpen(true)} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10 hover:text-white">
                <span aria-hidden="true">👥</span><span className="hidden sm:inline"> 팀원 관리</span>
              </button>
            )}
            <span className="hidden max-w-32 truncate text-xs text-slate-500 lg:inline">{user.displayName || user.email}</span>
            <button onClick={() => void signOut()} className="rounded-lg border border-white/10 px-2.5 py-2 text-xs text-slate-400 hover:text-white" aria-label="로그아웃">
              <span className="hidden sm:inline">로그아웃</span><span className="sm:hidden">↪</span>
            </button>
          </div>
        </div>
      </header>
      {teamOpen && <TeamModal onClose={() => setTeamOpen(false)} />}
    </>
  );
}
