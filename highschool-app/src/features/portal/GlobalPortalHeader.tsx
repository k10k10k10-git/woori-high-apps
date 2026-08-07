"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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
  const currentArea = activeArea(pathname);
  const openTeam = useCallback(() => setTeamOpen(true), []);

  useEffect(() => {
    window.addEventListener("portal:open-team", openTeam);
    return () => window.removeEventListener("portal:open-team", openTeam);
  }, [openTeam]);

  if (loading || !user) return null;

  const semesterAllowed = canAccessPortalArea("semester", role);
  // 방학 중 사역은 진입점 하나. 행정 권한이 있으면 행정 홈, 아니면 현장 홈으로 보낸다.
  // 두 화면 모두 같은 수련회 목록을 보여주고 카드에서 행정·현장으로 갈라진다.
  const vacationHref = canAccessPortalArea("retreat-admin", role)
    ? "/retreats"
    : canAccessPortalArea("retreat-field", role) ? "/field" : null;

  return (
    <>
      <header className="sticky top-0 z-[60] h-14 border-b border-white/10 bg-slate-950 text-white shadow-sm">
        <div className="mx-auto flex h-full max-w-[1760px] items-center gap-3 px-3 sm:px-5">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg pr-1 hover:text-emerald-200" aria-label="분당우리교회 서현고등부 홈으로">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-emerald-400 to-violet-500 text-sm font-black">W</span>
            <span className="hidden font-bold sm:inline">분당우리교회 서현고등부</span>
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

            {vacationHref && (
              <Link
                href={vacationHref}
                className={`rounded-lg px-2.5 py-2 text-xs font-semibold transition sm:px-3 ${currentArea === "vacation" ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/8 hover:text-white"}`}
              >
                방학 중 사역
              </Link>
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
