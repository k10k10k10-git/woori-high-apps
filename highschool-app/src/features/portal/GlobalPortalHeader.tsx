"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import UnifiedTeamModal from "./UnifiedTeamModal";
import { canAccessPortalArea } from "./accessPolicy";

type GlobalArea = "home" | "semester" | "retreat" | "field";

function activeArea(pathname: string): GlobalArea {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/semester")) return "semester";
  if (pathname === "/field" || pathname.includes("/field")) return "field";
  return "retreat";
}

export default function GlobalPortalHeader() {
  const pathname = usePathname();
  const { user, loading, accessLevel, iguardAccessLevel, signOut } = useAuth();
  const [teamOpen, setTeamOpen] = useState(false);
  const currentArea = activeArea(pathname);
  const access = useMemo(() => ({ accessLevel, iguardAccessLevel }), [accessLevel, iguardAccessLevel]);
  const openTeam = useCallback(() => setTeamOpen(true), []);

  useEffect(() => {
    window.addEventListener("portal:open-team", openTeam);
    return () => window.removeEventListener("portal:open-team", openTeam);
  }, [openTeam]);

  if (loading || !user) return null;

  const navItems = [
    { area: "home" as const, href: "/", label: "홈" },
    ...(canAccessPortalArea("semester", access) ? [{ area: "semester" as const, href: "/semesters", label: "학기 중 사역" }] : []),
    ...(canAccessPortalArea("retreat-admin", access) ? [{ area: "retreat" as const, href: "/retreats", label: "수련회 행정" }] : []),
    ...(canAccessPortalArea("retreat-field", access) ? [{ area: "field" as const, href: "/field", label: "이가드 현장" }] : []),
  ];

  return (
    <>
      <header className="sticky top-0 z-[60] h-14 border-b border-white/10 bg-slate-950 text-white shadow-sm">
        <div className="mx-auto flex h-full max-w-[1760px] items-center gap-3 px-3 sm:px-5">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg pr-1 hover:text-sky-200" aria-label="고등부 사역 플랫폼 홈으로">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-sky-400 to-violet-500 text-sm font-black">W</span>
            <span className="hidden font-bold sm:inline">고등부 사역 플랫폼</span>
            <span className="font-bold sm:hidden">홈</span>
          </Link>

          <nav className="ml-1 hidden min-w-0 flex-1 items-center gap-1 md:flex" aria-label="통합 사역 메뉴">
            {navItems.map((item) => (
              <Link key={item.area} href={item.href} className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${currentArea === item.area ? "bg-white/12 text-white" : "text-slate-400 hover:bg-white/8 hover:text-white"}`}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-1 sm:flex md:hidden">
              {navItems.filter((item) => item.area !== "home").map((item) => (
                <Link key={item.area} href={item.href} title={item.label} className={`grid h-8 w-8 place-items-center rounded-lg text-xs ${currentArea === item.area ? "bg-white/15 text-white" : "text-slate-400"}`}>
                  {item.area === "semester" ? "학" : item.area === "retreat" ? "행" : "현"}
                </Link>
              ))}
            </div>
            {accessLevel === "admin" && (
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
      {teamOpen && <UnifiedTeamModal onClose={() => setTeamOpen(false)} />}
    </>
  );
}
